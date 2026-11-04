/** Authenticated Minecraft settings and operator stop controls. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService, remoteErrorOf, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { setTimeout } from 'node:timers/promises'
import { z } from 'zod'
import type { MinecraftController } from './controller.ts'
import type { MinecraftConnection, MinecraftSettings, MinecraftStatus } from './types.ts'
import { connectionSchema, failure } from './settings.ts'

declare module '@deepseek-ai/cordis' { interface Context { genesisMinecraft: MinecraftGateway } }
/** Operator access does not teach or enable any model tool. */
export class MinecraftGateway extends TypertRemoteService {
  private readonly lifetime = new AbortController()
  /**
   * @param ctx - Authenticated Remote owner.
   * @param controller - Sole game and settings owner.
   */
  constructor(ctx: Context, private readonly controller: MinecraftController) { super(ctx, 'genesisMinecraft'); ctx.effect(() => () => { this.lifetime.abort() }) }
  private async operation<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
    if (principalOf(this.ctx.invocation) !== undefined) throw failure('operator-required')
    signal.throwIfAborted()
    try { return await run() } catch (error) {
      if (remoteErrorOf(error) !== undefined) throw error
      throw failure(error instanceof z.ZodError ? 'invalid-settings' : 'operation-failed')
    }
  }
  /**
   * Read settings and sampled status without a connection side effect.
   * @param signal - Caller cancellation.
   * @returns Current nonsecret status.
   */
  @Remote('inspect')
  inspect(signal: AbortSignal): Promise<MinecraftStatus> { return this.operation(signal, async () => this.controller.status()) }
  /**
   * Persist settings, stopping the existing game before changes.
   * @param settings - Complete operator draft.
   * @param revision - Displayed revision.
   * @param signal - Caller cancellation before admission.
   * @returns Committed revision.
   */
  @Remote('save')
  save(settings: MinecraftSettings, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, () => this.controller.save(settings, revision))
  }
  /**
   * Connect with explicit server choices in a connection-owned Life conversation.
   * @param connection - Server, offline player name and protocol selection.
   * @param signal - Cancels setup.
   * @returns After real spawn and camera readiness.
   */
  @Remote('connect')
  connect(connection: MinecraftConnection, signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.controller.connect(connectionSchema.parse(connection), undefined, signal)) }
  /**
   * Stop skills immediately without waiting for Jev or a chat response.
   * @param signal - Caller cancellation before admission.
   * @returns After controls are cleared.
   */
  @Remote('stop')
  stop(signal: AbortSignal): Promise<void> { return this.operation(signal, async () => { this.controller.stop() }) }
  /**
   * Disconnect without automatic reconnection.
   * @param signal - Caller cancellation before admission.
   * @returns After all game resources close.
   */
  @Remote('disconnect')
  disconnect(signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.controller.disconnect()) }
  /**
   * Stream bounded sampled status while this settings resource is open.
   * @param signal - Ends the subscription.
   * @returns Current snapshots; cancellation creates no additional work.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<MinecraftStatus> {
    if (principalOf(this.ctx.invocation) !== undefined) throw failure('operator-required')
    signal = AbortSignal.any([signal, this.lifetime.signal])
    while (!signal.aborted) {
      yield this.controller.status()
      try { await setTimeout(this.controller.preferences.read().settings.intervalMs, undefined, { signal }) }
      catch (error) { if (!signal.aborted) throw error }
    }
  }
}
