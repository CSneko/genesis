/** Authenticated operator toolkit editing, independent of tool learning and activation. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import type { Config } from './config.ts'
import type { ToolkitPreferences } from './toolkit-preferences.ts'
import type { ToolkitDefinition, ToolkitStatus } from './toolkit-model.ts'
import type { QqPermissions } from './qq-permissions.ts'
import type { QqPermissionRule } from './qq-permission-types.ts'
import { GenesisError } from './error.ts'
import { statusFailure } from './status-error.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    genesisToolkits: GenesisToolkitGateway
  }
}
/** Catalogue editing never teaches tools or grants execution permission. */
export class GenesisToolkitGateway extends TypertRemoteService {
  static inject = ['genesis', 'tools', 'agents']
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  /** @param ctx - Existing authenticated transport and life owner. @param options - Durable preferences and output bounds. */
  constructor(
    ctx: Context,
    private readonly options: { preferences: ToolkitPreferences; permissions: QqPermissions; config: Config },
  ) {
    super(ctx, 'genesisToolkits')
    ctx.effect(() => async () => {
      this.lifetime.abort()
      await Promise.allSettled(this.operations)
    })
  }
  private async operation<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
    AbortSignal.any([signal, this.lifetime.signal]).throwIfAborted()
    if (principalOf(this.ctx.invocation) !== undefined)
      throw statusFailure(new GenesisError('invalid-source', 'Tool permissions require operator access.'))
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
  /** Contribute automatically managed toolkits for the calling plugin's lifetime.
   * @param owner - Unique provider name, independent of toolkit ids.
   * @param entries - Live definitions; saved groups, learning and permissions remain independent.
   * @returns Disposer withdrawing these groups without changing saved preferences or Session activations.
   */
  registerManaged(owner: string, entries: () => ToolkitDefinition[]): () => void {
    return this.ctx.effect(() => this.options.preferences.registerManaged(owner, entries))
  }
  /**
   * Read the complete editable catalogue, including empty groups and unknown member rules.
   * @param signal - Caller cancellation.
   * @returns Detached catalogue plus learned and currently registered names; neither implies authorization.
   */
  @Remote('inspect')
  inspect(signal: AbortSignal): Promise<ToolkitStatus> {
    return this.operation(signal, async () => {
      const managed = this.options.preferences.managedEntries()
      this.options.preferences.catalogue()
      const value = {
        ...this.options.preferences.read(),
        ...(managed.length ? { managed } : {}),
        qqPermissions: this.options.permissions.read(),
        learned: this.ctx.genesis.learningStatus().tools,
        available: [...new Set(this.ctx.agents.list().flatMap(agent => this.ctx.tools.schemas(agent).map(tool => tool.name)))].sort(),
      }
      if (JSON.stringify(value).length > this.options.config.resultChars)
        throw new GenesisError('capacity', 'Toolkit status exceeds resultChars. Increase resultChars before editing the catalogue.')
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
  /** Replace QQ tool permissions for people and groups.
   * @param rules - Complete operator policy, including explicit denials.
   * @param revision - Last displayed QQ permission revision.
   * @param signal - Cancellation before admission; accepted writes drain on disposal.
   * @returns Confirmed revision; unknown writes stop QQ authorization until reload.
   */
  @Remote('savePermissions')
  savePermissions(rules: QqPermissionRule[], revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, () => this.options.permissions.save(rules, revision))
  }
}
