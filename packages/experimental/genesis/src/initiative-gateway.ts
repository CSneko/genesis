/** Authenticated proactive conversation policy and receipt inspection. @module */
import { z } from 'zod'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Config } from './config.ts'
import type { SocialInitiative } from './social.ts'
import type { InitiativeStatus } from './status-types.ts'
import { initiativeSettingsSchema, resolveInitiative, type InitiativeSettings } from './social-state.ts'
import { GenesisError } from './error.ts'
import { statusFailure } from './status-error.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    genesisInitiativeStatus: GenesisInitiativeGateway
  }
}

/** Settings revisions are independent of background receipt commits. */
export class GenesisInitiativeGateway extends TypertRemoteService {
  static inject = ['genesis', 'agents']
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()

  /** @param ctx - Authenticated existing transport. @param options - Optional worker and character selection. */
  constructor(
    ctx: Context,
    private readonly options: {
      config: Config
      engine: SocialInitiative | undefined
      applies: (agent: Agent) => boolean
    },
  ) {
    super(ctx, 'genesisInitiativeStatus')
    ctx.effect(() => async () => {
      this.lifetime.abort()
      await Promise.allSettled(this.operations)
    })
  }

  private async operation<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
    AbortSignal.any([signal, this.lifetime.signal]).throwIfAborted()
    const task = run()
    this.operations.add(task)
    try {
      return await task
    } catch (error) {
      throw statusFailure(error)
    } finally {
      this.operations.delete(task)
    }
  }

  /**
   * Read settings, channel availability and bounded actual decisions and receipts.
   * @param signal - Caller cancellation.
   * @returns A complete bounded sample with truncation and omission counts; no delivery is implied by enqueueing.
   */
  @Remote('inspect')
  inspect(signal: AbortSignal): Promise<InitiativeStatus> {
    return this.browse('', 0, signal)
  }

  /**
   * Search delivery history before selecting a bounded page.
   * @param query - Text, target, status or diagnostic substring.
   * @param offset - Matching records to skip.
   * @param signal - Caller cancellation.
   * @returns Current policy and matching delivery records, with remaining count.
   */
  @Remote('browse')
  browse(query: string, offset: number, signal: AbortSignal): Promise<InitiativeStatus> {
    return this.operation(signal, async () => {
      z.string().max(500).parse(query)
      z.number().int().nonnegative().max(100000).parse(offset)
      const state = await this.ctx.genesis.snapshot()
      const { config, engine } = this.options
      const settings = config.socialInitiative === undefined ? null : resolveInitiative(config.socialInitiative, state.initiative)
      const runtime = engine?.status()
      const agents = this.ctx.agents.list().filter(this.options.applies)
      const idle = (agent: Agent) => agent.status === 'idle' && agent.inbox.nextTurn.length === 0 && agent.inbox.nextStep.length === 0
      const target =
        settings?.sessionId ??
        [...state.events]
          .reverse()
          .find(
            event =>
              event.source === 'user' &&
              event.payload['kind'] === 'user-message' &&
              agents.some(agent => idle(agent) && agent.session.id === event.relatedSessionId),
          )?.relatedSessionId
      const eligible = agents.some(agent => idle(agent) && agent.session.id === target)
      const records = state.initiative?.records ?? []
      const matching = records.filter(record =>
        [record.message, record.reason, record.note, record.sessionId, record.status, record.key].some(value =>
          value?.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        ),
      )
      const latest = records.filter(item => item.status === 'sent').sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0]
      const latestText = latest?.message?.slice(0, Math.floor(config.resultChars / 8))
      const result: InitiativeStatus = {
        available: engine !== undefined,
        settings,
        revision: state.initiative?.revision ?? 0,
        sampledAt: new Date().toISOString(),
        mode:
          engine === undefined
            ? 'unavailable'
            : !settings?.enabled
              ? 'paused'
              : runtime?.working
                ? 'checking'
                : runtime?.failure
                  ? 'failed'
                  : eligible
                    ? 'ready'
                    : 'waiting-channel',
        nextCheckAt: settings?.enabled ? (runtime?.nextCheckAt ?? null) : null,
        lastCheckAt: state.initiative?.lastCheckAt ?? null,
        failure: runtime?.failure ?? null,
        lastMessage: latest === undefined ? null : { ...latest, ...(latestText === undefined ? {} : { message: latestText }) },
        lastMessageTruncated: latest !== undefined && latestText !== latest.message,
        channels: [],
        counts: { pending: 0, dispatching: 0, sent: 0, skipped: 0, uncertain: 0 },
        records: [],
        omitted: Math.max(0, matching.length - offset),
        channelsOmitted: agents.length,
      }
      for (const item of records) result.counts[item.status]++
      const fits = () => JSON.stringify(result).length <= config.resultChars
      for (const agent of agents.slice(0, config.queryLimit)) {
        result.channels.push({ id: agent.session.id, idle: idle(agent) })
        if (!fits()) {
          result.channels.pop()
          break
        }
        result.channelsOmitted--
      }
      for (const record of matching.toReversed().slice(offset, offset + config.queryLimit)) {
        const decision = state.agency?.decisions.find(item => item.id === record.decisionId)
        const message = record.message?.slice(0, Math.floor(config.resultChars / 4))
        result.records.push({
          record: { ...record, ...(message === undefined ? {} : { message }) },
          triggerType: state.events.find(event => event.id === record.sourceEventId)?.type ?? 'unknown',
          choice: decision?.candidates[decision.selected]?.disposition ?? null,
          messageTruncated: message !== record.message,
        })
        if (!fits()) {
          result.records.pop()
          break
        }
        result.omitted--
      }
      if (!fits()) throw new GenesisError('capacity', 'Proactive status exceeds resultChars. Increase the response budget.')
      return result
    })
  }

  /**
   * Save policy for subsequent opportunities and admission; previously admitted assistant turns may finish.
   * @param settings - Complete policy, validated at this wire boundary.
   * @param revision - Displayed settings revision.
   * @param signal - Caller cancellation; an admitted storage commit drains.
   * @returns Committed revision; failures preserve the operator draft.
   */
  @Remote('saveSettings')
  saveSettings(settings: InitiativeSettings, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, async () => {
      if (this.options.engine === undefined) throw new GenesisError('invalid-state', 'Social initiative is unavailable in this profile.')
      return this.ctx.genesis.configureInitiative(initiativeSettingsSchema.parse(settings), revision)
    })
  }
}
