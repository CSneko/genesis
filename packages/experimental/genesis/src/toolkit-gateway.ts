/** Authenticated operator toolkit editing, independent of tool learning and activation. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Config } from './config.ts'
import type { ToolkitPreferences } from './toolkit-preferences.ts'
import type { ToolkitDefinition, ToolkitStatus } from './toolkit-model.ts'
import { GenesisError } from './error.ts'
import { statusFailure } from './status-error.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { genesisToolkits: GenesisToolkitGateway }
}
/** Catalogue editing never teaches tools or grants execution permission. */
export class GenesisToolkitGateway extends TypertRemoteService {
  static inject = ['genesis', 'tools', 'agents']
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  /** @param ctx - Existing authenticated transport and life owner. @param options - Durable preferences and output bounds. */
  constructor(ctx: Context, private readonly options: { preferences: ToolkitPreferences; config: Config }) {
    super(ctx, 'genesisToolkits')
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.operations) })
  }
  private async operation<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
    AbortSignal.any([signal, this.lifetime.signal]).throwIfAborted()
    const task = run()
    this.operations.add(task)
    try { return await task } catch (error) { throw statusFailure(error) } finally { this.operations.delete(task) }
  }
  /**
   * Read the complete editable catalogue, including empty groups and unknown member rules.
   * @param signal - Caller cancellation.
   * @returns Detached catalogue plus learned and currently registered names; neither implies authorization.
   */
  @Remote('inspect')
  inspect(signal: AbortSignal): Promise<ToolkitStatus> {
    return this.operation(signal, async () => {
      const value = { ...this.options.preferences.read(), learned: this.ctx.genesis.learningStatus().tools,
        available: [...new Set(this.ctx.agents.list().flatMap(agent => this.ctx.tools.schemas(agent).map(tool => tool.name)))].sort() }
      if (JSON.stringify(value).length > this.options.config.resultChars) throw new GenesisError('capacity', 'Toolkit status exceeds resultChars. Increase resultChars before editing the catalogue.')
      return value
    })
  }
  /**
   * Replace operator definitions with optimistic concurrency; existing conversation activations retain their IDs.
   * @param entries - Complete definitions, validated before any write; innate tools cannot be grouped.
   * @param revision - Last displayed catalogue revision.
   * @param signal - Caller cancellation; admitted writes drain even after cancellation.
   * @returns Committed revision; stale or invalid drafts do not replace confirmed settings.
   */
  @Remote('save')
  save(entries: ToolkitDefinition[], revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, async () => this.options.preferences.save(entries, revision))
  }
}
