/** Authenticated operator memory generation and layer conversion. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import type { MemoryId, LifeMemory, MemoryDraft, MemoryOrganizationRequest, MemoryOrganizationId } from './status-types.ts'
import type { MemoryKind } from './status-types.ts'
import type { LifeMemoryEngine } from './memory.ts'
import type { MemoryConsolidator } from './consolidation.ts'
import type { Config } from './config.ts'
import { GenesisError } from './error.ts'
import { statusFailure } from './status-error.ts'
import { memoryView } from './memory.ts'
import type { OperatorIdentity } from './model.ts'
import { hasRoleReferences } from './participants.ts'

declare module '@deepseek-ai/cordis' { interface Context { genesisMemory: GenesisMemoryGateway } }

/** Explicit user memory controls; errors retain their actual stage and safe diagnostic. */
export class GenesisMemoryGateway extends TypertRemoteService {
  static inject = ['genesis', 'agents']
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  /** @param ctx - Authenticated service owner. @param options - Shared engine and deployment limits. */
  constructor(ctx: Context, private readonly options: {
    memory: LifeMemoryEngine | undefined
    config: Config
    participates: (agent: Agent | undefined) => boolean
    consolidation?: MemoryConsolidator | undefined }) {
    super(ctx, 'genesisMemory')
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.pending) })
  }
  private async operation<T>(signal: AbortSignal, run: (owned: AbortSignal) => Promise<T>): Promise<T> {
    const owned = AbortSignal.any([signal, this.lifetime.signal])
    owned.throwIfAborted()
    const pending = run(owned)
    this.pending.add(pending)
    try { return await pending } catch (error) { throw statusFailure(error) } finally { this.pending.delete(pending) }
  }
  /**
   * Generate selected-layer memories for one durable reply without running the decision model.
   * @param sessionId - Open conversation owning the reply.
   * @param messageId - Completed assistant message.
   * @param kind - Operator-selected memory layer.
   * @param signal - Caller cancellation; storage commits already admitted drain.
   * @returns Whether changes were saved; repeated requests are idempotent.
   */
  @Remote({ name: 'generate', resources: { session: (sessionId: SessionId) => sessionId } })
  generate(sessionId: SessionId, messageId: MessageId, kind: MemoryKind, signal: AbortSignal): Promise<boolean> {
    return this.operation(signal, async (owned) => {
      const agent = this.ctx.agents.get(sessionId)
      if (agent === undefined) throw new GenesisError('invalid-state', 'Open the original conversation before generating memory.')
      if (!this.options.participates(agent)) throw new GenesisError('invalid-source', 'Only a Life conversation can generate life memories.')
      const memory = this.options.memory
      if (memory === undefined) throw new GenesisError('invalid-state', 'Enable the memory pipeline and configure its writer and embedding service first.')
      await agent.whenIdle()
      owned.throwIfAborted()
      const saved = await memory.manual(agent, messageId, kind, owned)
      this.options.consolidation?.kick()
      return saved
    })
  }
  /**
   * Let the independent writer organize all chat text and memories associated with one open Life conversation.
   * @param sessionId - Authorized source conversation; tool and injected output are excluded.
   * @param id - Stable operator request UUID, retained across failed or uncertain retries.
   * @param signal - Caller cancellation; admitted storage writes drain.
   * @returns Whether valid entries changed memories after version checks; invalid entries are logged and deletions withheld; repeated committed requests are idempotent.
   */
  @Remote({ name: 'overview', resources: { session: (sessionId: SessionId) => sessionId } })
  overview(sessionId: SessionId, id: MemoryOrganizationId, signal: AbortSignal): Promise<boolean> {
    return this.operation(signal, async (owned) => {
      const agent = this.ctx.agents.get(sessionId)
      if (agent === undefined) throw new GenesisError('invalid-state', 'Open the original conversation before organizing its memories.')
      if (!this.options.participates(agent)) throw new GenesisError('invalid-source', 'Only a Life conversation can organize life memories.')
      const memory = this.options.memory
      if (memory === undefined) throw new GenesisError('invalid-state', 'Configure the memory writer and embeddings before organizing this conversation.')
      await agent.whenIdle()
      owned.throwIfAborted()
      const updated = await memory.overview(agent, id, owned)
      this.options.consolidation?.kick()
      return updated
    })
  }
  /**
   * Create a sourced operator candidate or directly update its current fields without an edit event or revision.
   * @param id - Client-allocated memory UUID, retained across retries.
   * @param draft - Editable fields; attribution and sources are assigned by the core.
   * @param updatedAt - Displayed version, or null when creating.
   * @param signal - Cancellation before storage admission.
   * @returns Accepted memory without its vector cache.
   */
  @Remote('save')
  save(id: MemoryId, draft: MemoryDraft, updatedAt: string | null, signal: AbortSignal): Promise<LifeMemory> {
    return this.operation(signal, async (owned) => {
      owned.throwIfAborted()
      const saved = memoryView(await this.ctx.genesis.editMemory(id, draft, updatedAt,
        this.options.config.memory?.maxImplicitMemories ?? this.options.config.maxRecords))
      this.options.consolidation?.kick()
      return saved
    })
  }
  /**
   * Save or remove a short description without changing memory content, attribution or habit evidence.
   * @param id - Existing memory identifier.
   * @param summary - At most forty characters, or null to remove the description.
   * @param updatedAt - Displayed memory version.
   * @param signal - Cancellation before storage admission.
   * @returns Accepted memory without vector caches; stale edits are refused.
   */
  @Remote('saveSummary')
  saveSummary(id: MemoryId, summary: string | null, updatedAt: string, signal: AbortSignal): Promise<LifeMemory> {
    return this.operation(signal, async (owned) => {
      owned.throwIfAborted()
      return memoryView(await this.ctx.genesis.setMemorySummary(id, summary, updatedAt))
    })
  }

  /**
   * Generate a short description from the current memory through the saved independent writer.
   * @param id - Existing memory identifier.
   * @param updatedAt - Displayed version, checked again after inference.
   * @param signal - Caller cancellation; retries retain the original deadline.
   * @returns Memory with its new summary; failure leaves the selected version unchanged.
   */
  @Remote('summarize')
  summarize(id: MemoryId, updatedAt: string, signal: AbortSignal): Promise<LifeMemory> {
    return this.operation(signal, async (owned) => {
      const memory = this.options.memory
      if (memory === undefined) throw new GenesisError('invalid-state', 'Configure the memory writer before generating a summary.')
      return memory.summarize(id, updatedAt, owned)
    })
  }
  /**
   * Delete current memory content after checking the displayed version, without adding an edit event.
   * @param id - Memory to remove.
   * @param updatedAt - Displayed version; stale deletion is refused.
   * @param signal - Cancellation before storage admission.
   * @returns Whether the memory existed and was deleted.
   */
  @Remote('deleteMemory')
  deleteMemory(id: MemoryId, updatedAt: string, signal: AbortSignal): Promise<boolean> {
    return this.operation(signal, async (owned) => {
      owned.throwIfAborted()
      const removed = await this.ctx.genesis.deleteMemory(id, updatedAt)
      this.options.consolidation?.kick()
      return removed
    })
  }
  /**
   * Enable or disable automatic idle consolidation without dropping queued evidence.
   * @param enabled - Operator preference, shared across modes and restarts.
   * @param signal - Cancellation before storage admission.
   * @returns After the preference commits and scheduling is reconsidered.
   */
  @Remote('setConsolidation')
  setConsolidation(enabled: boolean, signal: AbortSignal): Promise<void> {
    return this.operation(signal, async (owned) => {
      owned.throwIfAborted()
      this.options.consolidation?.activity()
      await this.ctx.genesis.setConsolidation(enabled)
      this.options.consolidation?.kick()
    })
  }

  /**
   * Run one explicit consolidation pass using the saved writer and embedding configuration.
   * @param signal - Operator cancellation; a conversation also cancels pending inference.
   * @returns Whether the pending revision committed; failures retain their specific stage and cause.
   */
  @Remote('consolidate')
  consolidate(signal: AbortSignal): Promise<boolean> {
    return this.operation(signal, async (owned) => {
      const worker = this.options.consolidation
      if (worker === undefined) throw new GenesisError('invalid-state', 'Configure the memory pipeline before consolidating memories.')
      return worker.run(owned)
    })
  }

  /**
   * Integrate explicitly selected memory versions into one or several new candidates.
   * @param request - Stable retry identity, selected versions and optional exact result count.
   * @param signal - Operator cancellation; admitted primary writes drain.
   * @returns Sourced results without vectors, atomically replacing the selection. Inference failures retain originals; storage or cleanup failures require checking the stable request on retry.
   */
  @Remote('organize')
  organize(request: MemoryOrganizationRequest, signal: AbortSignal): Promise<LifeMemory[]> {
    return this.operation(signal, (owned) => {
      const memory = this.options.memory
      if (memory === undefined) throw new GenesisError('invalid-state', 'Configure the memory writer and embeddings before organizing memories.')
      return memory.organize(request, owned)
    })
  }

  /**
   * Save explicit operator identity and replace legacy generic role references without changing facts.
   * @param profile - Human-authored operator name and identity.
   * @param revision - Displayed identity revision.
   * @param signal - Caller cancellation; admitted primary writes drain.
   * @returns New revision after identity and all accepted wording replacements commit together.
   */
  @Remote('saveOperator')
  saveOperator(profile: OperatorIdentity, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, async (owned) => {
      if (this.options.memory !== undefined) return this.options.memory.saveOperator(profile, revision, owned)
      const state = await this.ctx.genesis.snapshot()
      if (state.memories.some(memory => hasRoleReferences([memory.content, memory.habit?.cue, memory.habit?.response,
        ...(memory.experience?.topics ?? [])].filter(Boolean).join('\n')))) {
        throw new GenesisError('invalid-state', 'Configure the memory writer and embeddings to relabel existing memories before saving identity.')
      }
      owned.throwIfAborted()
      return this.ctx.genesis.saveOperator(profile, revision, state.memories.map(({ id, updatedAt }) => ({ id, updatedAt })), [])
    })
  }

  /**
   * Convert one existing memory between declarative and non-declarative storage.
   * @param id - Existing sourced memory.
   * @param kind - Desired layer; content and sources stay fixed.
   * @param updatedAt - Displayed memory version.
   * @param signal - Caller cancellation before storage admission.
   * @returns Committed memory without its embedding cache.
   */
  @Remote('convert')
  convert(id: MemoryId, kind: MemoryKind, updatedAt: string, signal: AbortSignal): Promise<LifeMemory> {
    return this.operation(signal, async (owned) => {
      owned.throwIfAborted()
      const converted = memoryView(await this.ctx.genesis.convertMemory(id, kind, updatedAt,
        this.options.config.memory?.maxImplicitMemories ?? this.options.config.maxRecords))
      this.options.consolidation?.kick()
      return converted
    })
  }
}
