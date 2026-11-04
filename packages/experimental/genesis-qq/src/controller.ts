/** One owner serializes QQ reconfiguration and drains the old transport before replacing it. @module */
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import { z } from 'zod'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { Config } from './config.ts'
import type { QqMessageStore } from './message-store.ts'
import { QqRuntime } from './runtime.ts'
import { allowsConversation, type QqPreferences } from './preferences.ts'
import { connectionSchema, type QqConnectionPreferences } from './connection.ts'
import type { QqDecisionSettings, QqConnection, QqStatus, QqDelivery } from './types.ts'

import type { QqDecisionPreferences } from './decision-settings.ts'
const decisionKeyRef = credentialRef('GENESIS_QQ_DECISION_API_KEY')
const tokenRef = credentialRef('GENESIS_QQ_TOKEN')
/** Settings remain available when OneBot is absent or its listener cannot start. */
export class QqController {
  private runtime: QqRuntime | undefined
  private tail: Promise<void> = Promise.resolve()
  private readonly lifetime = new AbortController()
  private failure: QqStatus['failure'] = null
  private credentialUncertain = false
  private closing: Promise<void> | undefined
  /**
   * @param ctx - Channel dependencies.
   * @param config - Resource limits and legacy defaults.
   * @param preferences - Independent admission policy.
   * @param connection - Durable connection choices.
   * @param decisions - Independent group-decision settings.
   * @param messages - Cross-conversation receipt owner, retained across transport replacement.
   */
  constructor(private readonly ctx: Context, private readonly config: Config, private readonly preferences: QqPreferences,
    private readonly connection: QqConnectionPreferences, private readonly decisions: QqDecisionPreferences, private readonly messages: QqMessageStore) {}

  private async token(): Promise<string> {
    if (this.credentialUncertain) throw new GenesisError('storage', 'QQ credential write has an uncertain outcome. Restart with verified credentials before reconnecting.')
    const stored = await this.ctx.credentials.resolve(tokenRef)
    return stored?.value ?? this.config.accessToken
  }
  private async stop(): Promise<void> {
    const runtime = this.runtime
    if (runtime === undefined) return
    await runtime.close()
    this.runtime = undefined
  }
  private serialize<T>(run: () => Promise<T>): Promise<T> {
    this.lifetime.signal.throwIfAborted()
    const pending = this.tail.then(async () => { this.lifetime.signal.throwIfAborted(); return run() })
    this.tail = pending.then(() => {}, (_error: unknown) => { /* The authenticated caller reports failure; teardown drains all work. */ })
    return pending
  }
  /**
   * Restore saved choices without preventing the settings page from reporting transport failure.
   * @returns After setup settles.
   */
  async start(): Promise<void> {
    const { connection } = this.connection.read()
    if (this.lifetime.signal.aborted || !connection.enabled) return
    const accessToken = await this.token()
    if (this.lifetime.signal.aborted || accessToken.length < 16) return
    const runtime = new QqRuntime(this.ctx, { ...this.config, ...connection, accessToken }, this.preferences, this.decisions, this.messages)
    this.runtime = runtime
    try { await runtime.start(); this.failure = null }
    catch (_error) {
      this.failure = 'transport'
      this.ctx.logger.error('QQ connection failed. Check the endpoint and token in Settings, then save the connection to retry.')
      await this.stop()
    }
  }
  /**
   * Save choices and reconnect; a failed reconnect remains visible and can be retried by saving again.
   * @param connection - Complete nonsecret choices.
   * @param revision - Displayed connection revision.
   * @returns Committed revision.
   */
  saveConnection(connection: QqConnection, revision: number): Promise<number> {
    const value = connectionSchema.parse(connection)
    return this.serialize(async () => {
      this.connection.checkRevision(revision)
      if (value.enabled && (await this.token()).length < 16) throw new GenesisError('invalid-state', 'Save an access token of at least 16 characters before enabling QQ.')
      await this.stop()
      const next = await this.connection.save(value, revision)
      this.failure = null
      await this.start()
      return next
    })
  }
  /**
   * Store or remove the channel token, stopping the old connection before touching credentials.
   * @param value - New token, or undefined to remove it.
   * @returns After credential persistence and optional reconnection.
   */
  setToken(value: string | undefined): Promise<void> {
    if (value !== undefined) z.string().min(16).max(4096).regex(/^[^\s]+$/u).parse(value)
    return this.serialize(async () => {
      await this.token()
      const credentials = this.ctx.credentials
      await this.stop()
      this.failure = 'settings'
      this.credentialUncertain = true
      if (value === undefined) await credentials.unset(tokenRef)
      else await credentials.set(tokenRef, value)
      this.credentialUncertain = false
      this.failure = null
      await this.start()
    })
  }
  /**
   * Inspect without connecting or exposing secrets.
   * @returns Current nonsecret connection and bounded receipt sample.
   */
  async inspect(): Promise<QqStatus> {
    const connection = this.connection.read()
    const policy = this.preferences.read()
    const tokenConfigured = this.credentialUncertain ? false : (await this.token()).length >= 16
    const sample = this.runtime === undefined ? { ...policy, botQq: connection.connection.botQq, operatorQq: connection.connection.operatorQq,
      endpoint: connection.connection.wsUrl || `ws://127.0.0.1:${connection.connection.port}`, tokenConfigured,
      mode: !connection.connection.enabled ? 'paused' as const : this.failure !== null ? 'failed' as const : 'unconfigured' as const,
      failure: this.failure, pending: 0, liveSessions: 0 }
      : await this.runtime.inspect()
    const state = await this.ctx.genesis.snapshot()
    const archived = this.ctx.get('workspaceRegistry')?.archivedSessionIds ?? []
    const hasArchivedRoute = connection.connection.enabled && state.people?.conversations.some((conversation) => {
      const [, , bot, target] = conversation.id.split(':')
      return bot === connection.connection.botQq && archived.includes(conversation.sessionId)
        && allowsConversation(policy.settings, conversation.kind, target!)
    }) === true
    const reservations = state.events.filter(event => event.type === 'qq.reserved')
    const receipts = new Map(state.events.filter(event => event.type === 'qq.receipt')
      .map(event => [`${event.relatedSessionId}:${event.relatedEventId}`, event]))
    const deliveries: QqDelivery[] = reservations.slice(-this.config.statusLimit).reverse().map((event) => {
      const receipt = receipts.get(`${event.relatedSessionId}:${event.relatedEventId}`)
      return { sessionId: SessionId(z.string().parse(event.relatedSessionId)), seq: z.coerce.number().int().nonnegative().parse(event.relatedEventId),
        timestamp: receipt?.timestamp ?? event.timestamp, parts: z.number().int().positive().parse(event.payload['parts']),
        status: receipt?.payload['status'] === 'confirmed' ? 'confirmed' : 'uncertain',
        acknowledged: receipt === undefined ? 0 : z.array(z.string()).parse(receipt.payload['messageIds']).length }
    })
    const result: QqStatus = { ...sample, ...connection, failure: sample.failure ?? (hasArchivedRoute ? 'archived' : null),
      decision: { ...this.decisions.read(), keyConfigured: (await this.ctx.credentials.resolve(decisionKeyRef)) !== undefined },
      deliveries, omitted: reservations.length - deliveries.length }
    if (JSON.stringify(result).length > this.config.statusChars) throw new GenesisError('capacity', 'QQ status exceeds statusChars. Increase its configured response budget.')
    return result
  }
  /**
   * Save QQ-only inference choices.
   * @param settings - Operator route.
   * @param revision - Revision fence.
   * @returns New revision.
   */
  saveDecision(settings: QqDecisionSettings, revision: number): Promise<number> {
    return this.serialize(() => this.decisions.save(settings, revision))
  }
  /**
   * Store a dedicated key without modifying memory credentials.
   * @param value - Secret or removal.
   * @returns After provider confirmation.
   */
  setDecisionKey(value: string | undefined): Promise<void> {
    return this.serialize(async () => {
      if (value === undefined) await this.ctx.credentials.unset(decisionKeyRef)
      else { z.string().min(1).max(8192).regex(/^[^\s]+$/u).parse(value); await this.ctx.credentials.set(decisionKeyRef, value) }
    })
  }
  /**
   * Return the current listener address.
   * @returns Null while disabled or disconnected.
   */
  address(): { address: string; port: number } | string | null { return this.runtime?.address() ?? null }
  /**
   * Forward committed replies only to the current transport.
   * @param sessionId - Session owner.
   * @param event - Committed Session event.
   */
  observe(sessionId: SessionId, event: SessionEvent): void { this.runtime?.observe(sessionId, event) }
  /**
   * Stop admission and drain reconfiguration before disposing transport.
   * @returns After all channel work closes.
   */
  close(): Promise<void> {
    this.lifetime.abort()
    this.closing ??= this.tail.then(() => this.stop())
    return this.closing
  }
}
