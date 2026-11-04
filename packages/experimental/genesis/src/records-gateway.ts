/** Authenticated operator record management, independent of the character's learned-tool restriction. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { GenesisError } from './error.ts'
import { statusFailure } from './status-error.ts'
import type { WritingRecords } from './records.ts'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { WritingCatalog, WritingDraft, WritingId, WritingImportId, WritingQuery, WritingRead, WritingReceipt, WritingSearch, WritingType, WritingTypeId } from './records-model.ts'

declare module '@deepseek-ai/cordis' { interface Context { genesisRecords: GenesisRecordsGateway } }

/** Operator API; disabling recording keeps the namespace mounted with an explicit unavailable catalog. */
export class GenesisRecordsGateway extends TypertRemoteService {
  static inject = ['genesis']
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  /**
   * Initialize authenticated operator access.
   * @param ctx - Authenticated Gateway owner.
   * @param options - Optional independently owned record store.
   */
  constructor(ctx: Context, private readonly options: { records: WritingRecords | undefined }) {
    super(ctx, 'genesisRecords')
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.pending) })
  }
  private operation<T>(signal: AbortSignal, run: (records: WritingRecords, owned: AbortSignal) => Promise<T>): Promise<T> {
    const owned = AbortSignal.any([signal, this.lifetime.signal])
    const operation = Promise.resolve().then(() => {
      owned.throwIfAborted()
      if (this.options.records === undefined) throw new GenesisError('invalid-state', 'Recording is disabled. Configure records and personalDirectory before using it.')
      return run(this.options.records, owned)
    }).catch((error: unknown) => { throw statusFailure(error) })
    this.pending.add(operation)
    void operation.finally(() => this.pending.delete(operation)).catch((_error: unknown) => {
      // The Remote caller receives the original rejection; this branch only settles the tracking cleanup.
    })
    return operation
  }
  /**
   * Initialize a trusted integration category; this is not exposed to Remote callers or model tools.
   * @param id - Stable integration category identity.
   * @param name - Initial label, never overwriting operator changes.
   * @param signal - Caller cancellation.
   * @returns Existing or created category; disabled recording rejects.
   */
  ensureType(id: WritingTypeId, name: string, signal: AbortSignal): Promise<WritingType> {
    return this.operation(signal, (records, owned) => records.ensureType(id, name, owned))
  }
  /**
   * Import a legacy writing without changing life memory or exposing arbitrary import keys to the model.
   * @param draft - Complete attributed text and current category.
   * @param source - Actual Session and tool call performing migration.
   * @param imported - Adapter-owned permanent receipt and validated original creation time.
   * @param signal - Cancellation before durable admission; accepted writes drain.
   * @returns Stable receipt; retries preserve operator edits and never recreate deleted records.
   */
  importRecord(draft: WritingDraft, source: { sessionId: SessionId; callId: ToolCallId },
    imported: { id: WritingImportId; createdAt: string }, signal: AbortSignal): Promise<WritingReceipt> {
    return this.operation(signal, (records, owned) => records.create(draft, source, owned, imported))
  }
  /**
   * Read record categories and effective writing limits.
   * @param signal - Caller cancellation.
   * @returns Categories and limits, or null when recording is disabled.
   */
  @Remote('catalog')
  catalog(signal: AbortSignal): Promise<WritingCatalog | null> {
    if (this.options.records === undefined) return Promise.resolve(null)
    return this.operation(signal, (records, owned) => records.catalog(owned))
  }
  /**
   * Search writing titles and content without model calls.
   * @param query - Bounded substring, type and time filters.
   * @param signal - Caller cancellation.
   * @returns Matching records with snippets and continuation offset.
   */
  @Remote('search')
  search(query: WritingQuery, signal: AbortSignal): Promise<WritingSearch> {
    return this.operation(signal, (records, owned) => records.search(query, owned))
  }
  /**
   * Read one revision in bounded text chunks.
   * @param id - Stable record id.
   * @param offset - Returned continuation position, initially zero.
   * @param signal - Caller cancellation.
   * @returns One bounded text chunk and original attribution.
   */
  @Remote('read')
  read(id: WritingId, offset: number, signal: AbortSignal): Promise<WritingRead> {
    return this.operation(signal, (records, owned) => records.read(id, offset, owned))
  }
  /**
   * Replace current fields while retaining original creation attribution.
   * @param id - Record to edit.
   * @param draft - Operator replacement text and type.
   * @param revision - Displayed revision.
   * @param signal - Cancellation before commit admission.
   * @returns New revision; rejected edits retain the caller’s draft.
   */
  @Remote('edit')
  edit(id: WritingId, draft: WritingDraft, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, (records, owned) => records.edit(id, draft, revision, owned))
  }
  /**
   * Erase current writing text and its generated Markdown file.
   * @param id - Record to delete.
   * @param revision - Displayed revision.
   * @param signal - Cancellation before admission.
   * @returns After current text and generated file removal; Session history is independent.
   */
  @Remote('deleteRecord')
  deleteRecord(id: WritingId, revision: number, signal: AbortSignal): Promise<void> {
    return this.operation(signal, (records, owned) => records.remove(id, revision, owned))
  }
  /**
   * Create or update an operator-managed writing category.
   * @param id - Existing type id or null for a new system-generated id.
   * @param name - Display name.
   * @param enabled - Permit new writes.
   * @param revision - Displayed type revision, zero for creation.
   * @param signal - Cancellation before admission.
   * @returns Saved type without relocating records on rename.
   */
  @Remote('saveType')
  saveType(id: WritingTypeId | null, name: string, enabled: boolean, revision: number, signal: AbortSignal): Promise<WritingType> {
    return this.operation(signal, (records, owned) => records.saveType(id, name, enabled, revision, owned))
  }
}
