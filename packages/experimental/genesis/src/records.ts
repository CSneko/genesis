/** Serialized record operations under the life writer lease, with recoverable Markdown publication. @module */
import { searchText } from './search.ts'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { LifeId } from './model.ts'
import type { RecordsConfig } from './config.ts'
import { GenesisError } from './error.ts'
import { publishWritingFiles, writingOwner } from './records-files.ts'
import { writingsDomain, writingIdSchema, writingTypeIdSchema } from './records-model.ts'
import type { WritingCatalog, WritingDraft, WritingEntry, WritingId, WritingImportId, WritingMatch, WritingQuery, WritingRead, WritingReceipt, WritingSearch, WritingState, WritingType, WritingTypeId } from './records-model.ts'

function fileName(entry: Pick<WritingEntry, 'id' | 'createdAt' | 'typeId'>): string {
  return `${entry.typeId}/${entry.createdAt.slice(0, 4)}/${entry.createdAt.slice(5, 7)}/${entry.createdAt.replace(/[-:.]/g, '')}_${entry.id}.md`
}
function digest(text: string): string { return createHash('sha256').update(text).digest('hex') }
function fail(message: string): never { throw new GenesisError('invalid-source', message) }

/**
 * Fit text while counting all JSON metadata, escaping and pagination fields.
 * @param text - Candidate content or excerpt.
 * @param build - Complete response constructor for a retained prefix.
 * @param budget - Maximum serialized characters.
 * @returns Longest fitting prefix; rejects when metadata alone exceeds the budget.
 */
function fitText<T>(text: string, build: (content: string) => T, budget: number): T {
  if (JSON.stringify(build('')).length > budget) throw new GenesisError('capacity', 'Record metadata exceeds the result budget. Increase records.resultChars.')
  let low = 0; let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (JSON.stringify(build(text.slice(0, middle))).length <= budget) low = middle
    else high = middle - 1
  }
  if (low > 0 && /[\uD800-\uDBFF]/.test(text.charAt(low - 1))) low--
  return build(text.slice(0, low))
}

/** One durable catalog; unknown writes poison this instance until storage is reopened and pending files recover. */
export class WritingRecords {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined

  /**
   * Initialize one exclusively owned record store.
   * @param domain - Exclusive validated record storage.
   * @param root - Private canonical file root.
   * @param lifeId - Restored life identity.
   * @param config - Deployment limits.
   */
  constructor(private readonly domain: Domain<typeof writingsDomain>, private readonly root: string,
    private readonly lifeId: LifeId, private readonly config: RecordsConfig) {}

  /**
   * Restore the catalog and finish pending files before exposing tools or management.
   * @returns After durable initialization and recovery; a missing catalog with an ownership marker never starts over.
   */
  async start(): Promise<void> {
    let state = this.domain.table('states').get('catalog')
    const owner = await writingOwner(this.root)
    if (state === undefined) {
      if (owner !== null) throw new GenesisError('invalid-state', 'The records catalog is missing but its directory has an owner. Restore genesis_writings storage before restarting; records were not reset.')
      state = { schemaVersion: 1, lifeId: this.lifeId, root: this.root, revision: 1, entries: [], receipts: [], retiredPaths: [],
        pendingFiles: true, types: [{ id: brandString<WritingTypeId>('diary'), name: '日记', enabled: true, revision: 1 },
          { id: brandString<WritingTypeId>('essay'), name: '随笔', enabled: true, revision: 1 }] }
      await this.commit(state)
      return
    }
    if (state.lifeId !== this.lifeId || state.root !== this.root || (owner !== null && owner !== this.lifeId)) throw new GenesisError('configuration-conflict', 'Records belong to a different life or directory. Restore the original identity and records location.')
    const types = new Set(state.types.map(type => type.id))
    const entries = new Set(state.entries.map(entry => entry.id))
    const receipts = new Set(state.receipts.map(receipt => receipt.id))
    if (types.size !== state.types.length || entries.size !== state.entries.length || receipts.size !== state.receipts.length
      || state.types.some(type => !type.name.trim()) || state.entries.some(entry => !types.has(entry.typeId) || !receipts.has(entry.id)
        || entry.fileName !== fileName(entry) || entry.updatedAt < entry.createdAt)
      || state.retiredPaths.some(path => state.entries.some(entry => entry.fileName === path))) {
      throw new GenesisError('invalid-state', 'The records catalog has inconsistent ids, types or file locations. Restore verified storage before restarting.')
    }
    try {
      await publishWritingFiles(state)
      if (state.pendingFiles || state.retiredPaths.length) await this.domain.table('states').put('catalog', { ...state, pendingFiles: false, retiredPaths: [] })
    } catch (error) { throw this.storageFailure(error) }
  }

  private state(): WritingState {
    if (this.failure !== undefined) throw this.failure
    const state = this.domain.table('states').get('catalog')
    if (state === undefined) throw new GenesisError('invalid-state', 'Record storage has not started.')
    return state
  }
  private storageFailure(error: unknown): GenesisError {
    this.failure = new GenesisError('storage', 'Record storage or file publication failed; the catalog may already be saved. Record operations stopped. Restore access and restart to recover pending files; do not create a replacement record.', { cause: error })
    return this.failure
  }
  private async commit(state: WritingState): Promise<void> {
    if (state.entries.length + state.receipts.length > this.config.maxRecords || state.types.length > this.config.maxTypes
      || JSON.stringify(state).length > this.config.maxStateChars) throw new GenesisError('capacity', 'Record storage reached its configured capacity. Export or remove records, or increase the records limits; creation receipts are retained for safe replay.')
    try {
      await this.domain.table('states').put('catalog', { ...state, pendingFiles: true })
      await publishWritingFiles(state)
      await this.domain.table('states').put('catalog', { ...state, pendingFiles: false, retiredPaths: [] })
    } catch (error) { throw this.storageFailure(error) }
  }
  private operation<T>(signal: AbortSignal, run: () => Promise<T> | T): Promise<T> {
    if (this.closing !== undefined) return Promise.reject(new GenesisError('closed', 'Record storage is closing.'))
    const operation = this.tail.then(() => { signal.throwIfAborted(); if (this.failure !== undefined) throw this.failure; return run() })
    this.tail = operation.then(() => {}, (_error: unknown) => {
      // The caller owns reporting; disposal must still drain later admitted operations.
    })
    return operation
  }
  private draft(draft: WritingDraft): WritingDraft {
    const parsed = z.strictObject({ title: z.string().trim().min(1).max(this.config.titleChars),
      content: z.string().min(1).max(this.config.contentChars).refine(text => text.trim().length > 0),
      typeId: writingTypeIdSchema }).parse(draft)
    return parsed
  }
  private type(state: WritingState, id: WritingTypeId): WritingType {
    return state.types.find(type => type.id === id) ?? fail('Unknown record type. Use the types operation to select a current type id.')
  }

  /**
   * Read current categories and operator editing limits.
   * @param signal - Cancellation before admission.
   * @returns Current types and edit limits without record bodies.
   */
  catalog(signal: AbortSignal): Promise<WritingCatalog> {
    return this.operation(signal, () => {
      const state = this.state()
      return { types: structuredClone(state.types), count: state.entries.length, revision: state.revision,
        limits: { titleChars: this.config.titleChars, contentChars: this.config.contentChars, typeChars: this.config.typeChars } }
    })
  }

  /**
   * Save agent-authored text independently of user instructions; replay never recreates deleted text.
   * @param draft - Required title, content and enabled type.
   * @param source - Actual calling Session and tool call, never model-supplied attribution.
   * @param signal - Cancellation checked before durable admission; admitted commits drain.
   * @param imported - Trusted adapter receipt and original time; attribution still identifies the actual migration call.
   * @returns Stable receipt with creation time and path, or an already-deleted status; conflicting reuse rejects.
   */
  create(draft: WritingDraft, source: { sessionId: SessionId; callId: ToolCallId }, signal: AbortSignal,
    imported?: { id: WritingImportId; createdAt: string }): Promise<WritingReceipt> {
    const parsed = this.draft(draft)
    return this.operation(signal, async () => {
      const state = structuredClone(this.state())
      const id = brandString<WritingId>(digest(JSON.stringify(imported === undefined
        ? [this.lifeId, source.sessionId, source.callId] : [this.lifeId, 'import', imported.id])))
      const fingerprint = digest(JSON.stringify(imported === undefined ? parsed : [parsed, imported.createdAt]))
      const previous = state.receipts.find(receipt => receipt.id === id)
      if (previous !== undefined) {
        if (previous.fingerprint !== fingerprint) fail('This record creation call was already used with different content. Do not reuse its call id.')
        const existing = state.entries.find(entry => entry.id === id)
        return existing === undefined ? { id, status: 'already-deleted' } : { id, status: 'saved', createdAt: existing.createdAt, fileName: existing.fileName }
      }
      if (!this.type(state, parsed.typeId).enabled) fail('This record type is disabled. Use the types operation to choose an enabled type.')
      const now = new Date().toISOString()
      const createdAt = imported?.createdAt ?? now
      const entry: WritingEntry = { ...parsed, id, createdAt, updatedAt: now, revision: 1, source, updatedBy: 'agent', fileName: '' }
      entry.fileName = fileName(entry)
      state.entries.push(entry); state.receipts.push({ id, fingerprint }); state.revision++
      await this.commit(state)
      return { id, status: 'saved', createdAt, fileName: entry.fileName }
    })
  }

  /**
   * Add an integration-owned category without renaming or enabling an operator's existing category.
   * @param id - Stable directory-safe category id from trusted deployment configuration.
   * @param name - Initial display name, used only when absent.
   * @param signal - Cancellation before admission.
   * @returns Existing or newly saved type; operator edits remain authoritative.
   */
  ensureType(id: WritingTypeId, name: string, signal: AbortSignal): Promise<WritingType> {
    writingTypeIdSchema.parse(id)
    const label = z.string().trim().min(1).max(this.config.typeChars).parse(name)
    return this.operation(signal, async () => {
      const state = structuredClone(this.state())
      const existing = state.types.find(type => type.id === id)
      if (existing !== undefined) return structuredClone(existing)
      if (state.types.some(type => type.name.toLowerCase() === label.toLowerCase())) fail('A different record category already uses this name. Configure the existing category id or a different name.')
      const type = { id, name: label, enabled: true, revision: 1 }
      state.types.push(type); state.revision++; await this.commit(state)
      return type
    })
  }

  /**
   * Read a bounded portion of one current record.
   * @param id - Record identity.
   * @param offset - UTF-16 position, initially zero.
   * @param signal - Caller cancellation.
   * @returns Bounded content chunk with immutable creation source; missing records reject.
   */
  read(id: WritingId, offset: number, signal: AbortSignal): Promise<WritingRead> {
    writingIdSchema.parse(id); z.number().int().nonnegative().parse(offset)
    return this.operation(signal, () => {
      const entry = this.state().entries.find(entry => entry.id === id) ?? fail('Record not found. Refresh the search results.')
      if (offset > entry.content.length || (offset > 0 && /[\uD800-\uDBFF]/.test(entry.content.charAt(offset - 1)))) fail('Invalid record content offset. Continue with the returned nextOffset.')
      const { content, ...metadata } = entry
      const result = fitText(content.slice(offset), chunk => ({ ...metadata, content: chunk, offset,
        nextOffset: offset + chunk.length < content.length ? offset + chunk.length : null }), this.config.resultChars)
      if (!result.content && result.nextOffset !== null) throw new GenesisError('capacity', 'Record metadata leaves no space for content. Increase records.resultChars.')
      return result
    })
  }

  /**
   * Search title and body with bounded output and advancing pagination.
   * @param query - Multilingual full-text query, type and inclusive creation-time filters; blank text lists newest records.
   * @param signal - Caller cancellation.
   * @returns Budgeted matches with excerpts and continuation offset.
   */
  search(query: WritingQuery, signal: AbortSignal): Promise<WritingSearch> {
    const parsed = z.strictObject({ text: z.string().max(this.config.contentChars).default(''), typeId: writingTypeIdSchema.optional(),
      after: z.iso.datetime({ offset: true }).optional(), before: z.iso.datetime({ offset: true }).optional(),
      offset: z.number().int().nonnegative().default(0) }).parse(query)
    if (parsed.after !== undefined && parsed.before !== undefined && Date.parse(parsed.after) > Date.parse(parsed.before)) fail('The search start time must not follow its end time.')
    return this.operation(signal, () => {
      const state = this.state(); const needle = parsed.text.trim()
      if (parsed.typeId !== undefined) this.type(state, parsed.typeId)
      const eligible = state.entries.filter(entry => (parsed.typeId === undefined || entry.typeId === parsed.typeId)
        && (parsed.after === undefined || Date.parse(entry.createdAt) >= Date.parse(parsed.after))
        && (parsed.before === undefined || Date.parse(entry.createdAt) <= Date.parse(parsed.before)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      const found = needle ? searchText(needle, eligible.map(entry => ({ value: entry, id: entry.id,
        fields: [{ text: entry.title, weight: 3 }, { text: entry.content, weight: 1 }] })))
        : eligible.map(value => ({ value, positions: [-1, -1] }))
      const result: WritingSearch = { items: [], total: found.length, nextOffset: null, revision: state.revision }
      for (const { value: entry, positions } of found.slice(parsed.offset, parsed.offset + this.config.queryLimit)) {
        const { source: _source, content, ...metadata } = entry
        const start = Math.max(0, (positions[1] ?? -1) - Math.floor(this.config.snippetChars / 4))
        const snippet = content.slice(start, start + this.config.snippetChars)
        const matchedFields: WritingMatch['matchedFields'] = []
        if ((positions[0] ?? -1) >= 0) matchedFields.push('title')
        if ((positions[1] ?? -1) >= 0) matchedFields.push('content')
        const nextOffset = parsed.offset + result.items.length + 1 < found.length ? parsed.offset + result.items.length + 1 : null
        if (result.items.length && JSON.stringify({ ...result, items: [...result.items,
          { ...metadata, content: snippet, matchedFields, truncated: snippet.length !== content.length }],
        nextOffset }).length > this.config.resultChars) break
        const fitted = fitText(snippet, chunk => ({ ...result, items: [...result.items,
          { ...metadata, content: chunk, truncated: start > 0 || chunk.length < content.length, matchedFields }],
        nextOffset }), this.config.resultChars)
        result.items = fitted.items; result.nextOffset = fitted.nextOffset
      }
      return result
    })
  }

  /**
   * Replace current fields with an attributed operator edit.
   * @param id - Existing record.
   * @param draft - Operator-authored replacement.
   * @param revision - Displayed record revision.
   * @param signal - Cancellation before admission.
   * @returns New revision with original time and source; type changes relocate the generated file.
   */
  edit(id: WritingId, draft: WritingDraft, revision: number, signal: AbortSignal): Promise<number> {
    writingIdSchema.parse(id); const parsed = this.draft(draft)
    return this.operation(signal, async () => {
      const state = structuredClone(this.state()); const entry = state.entries.find(entry => entry.id === id) ?? fail('Record not found. Refresh the search results.')
      if (entry.revision !== revision) throw new GenesisError('configuration-conflict', 'The record changed. Reload it before saving your retained draft.')
      const type = this.type(state, parsed.typeId)
      if (!type.enabled && parsed.typeId !== entry.typeId) fail('Choose an enabled record type.')
      const oldPath = entry.fileName
      Object.assign(entry, parsed, { revision: entry.revision + 1, updatedAt: new Date().toISOString(), updatedBy: 'operator' })
      entry.fileName = fileName(entry)
      if (oldPath !== entry.fileName) state.retiredPaths.push(oldPath)
      state.revision++; await this.commit(state); return entry.revision
    })
  }

  /**
   * Erase current text while retaining a text-free replay receipt.
   * @param id - Record to erase from the catalog and generated files.
   * @param revision - Displayed version.
   * @param signal - Cancellation before admission.
   * @returns After deletion; historical Session logs remain independent.
   */
  remove(id: WritingId, revision: number, signal: AbortSignal): Promise<void> {
    writingIdSchema.parse(id)
    return this.operation(signal, async () => {
      const state = structuredClone(this.state()); const entry = state.entries.find(entry => entry.id === id)
      if (entry === undefined) return
      if (entry.revision !== revision) throw new GenesisError('configuration-conflict', 'The record changed. Reload it before deleting.')
      state.retiredPaths.push(entry.fileName); state.entries = state.entries.filter(entry => entry.id !== id)
      state.revision++; await this.commit(state)
    })
  }

  /**
   * Add, rename or disable a category without losing its records.
   * @param id - Existing type, or null to create a system-generated id.
   * @param name - Display name, never a directory name.
   * @param enabled - Whether new writes may use the type.
   * @param revision - Displayed revision, zero for creation.
   * @param signal - Cancellation before admission.
   * @returns Saved category; renames retain stable ids and update Markdown metadata.
   */
  saveType(id: WritingTypeId | null, name: string, enabled: boolean, revision: number, signal: AbortSignal): Promise<WritingType> {
    if (id !== null) writingTypeIdSchema.parse(id)
    const label = z.string().trim().min(1).max(this.config.typeChars).parse(name)
    return this.operation(signal, async () => {
      const state = structuredClone(this.state()); const existing = id === null ? undefined : this.type(state, id)
      if ((existing?.revision ?? 0) !== revision) throw new GenesisError('configuration-conflict', 'The record type changed. Reload the types before saving.')
      if (state.types.some(type => type.id !== id && type.name.toLowerCase() === label.toLowerCase())) fail('A record type with this name already exists. Choose another name.')
      const type: WritingType = { id: existing?.id ?? brandString<WritingTypeId>(`type-${randomUUID()}`), name: label, enabled, revision: revision + 1 }
      state.types = [...state.types.filter(item => item.id !== id), type]
      state.revision++; await this.commit(state); return type
    })
  }

  /**
   * Drain admitted operations before releasing the storage domain.
   * @returns After all accepted operations settle; new operations are rejected immediately.
   */
  close(): Promise<void> { this.closing ??= this.tail.then(() => this.domain.close()); return this.closing }
}
