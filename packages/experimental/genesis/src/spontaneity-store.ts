/** Serialized thought mutations and conservative crash recovery. @module */
import { randomUUID, createHash } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { LifeGoalId } from './agency-state.ts'
import type { LifeId } from './model.ts'
import type { SpontaneityConfig } from './config.ts'
import { GenesisError } from './error.ts'
import { spontaneityDomain, spontaneityStateSchema, type SpontaneityState, type SpontaneityRun,
  type SpontaneitySettings, type ThoughtEdit, type ThoughtId } from './spontaneity-state.ts'

/** One life-wide writer; unknown writes fence all subsequent reads and effects. */
export class SpontaneityStore {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined
  /**
   *
   * @param domain - Exclusive domain under the life lease.
   *
   * @param lifeId - Existing identity.
   *
   * @param config - Retention limits. */
  constructor(private readonly domain: Domain<typeof spontaneityDomain>, private readonly lifeId: LifeId,
    private readonly config: SpontaneityConfig) {}

  /** Validate ownership and mark unfinished reservations interrupted without replaying them.
   *
   * @param previouslyInitialized - Durable life marker; missing initialized storage is an error.
   *
   * @returns After first initialization or recovery commits.
   */
  async start(previouslyInitialized: boolean): Promise<void> {
    const saved = this.domain.table('state').get('current')
    if (saved === undefined && previouslyInitialized) throw new GenesisError('invalid-state', 'Spontaneity storage is missing. Restore it with the matching life and Sessions.')
    if (saved !== undefined && spontaneityStateSchema.parse(saved).lifeId !== this.lifeId) throw new GenesisError('configuration-conflict', 'Thoughts belong to another life. Restore matching storage.')
    await this.change((state) => {
      for (const run of state.runs) if (run.status === 'reserved') { run.status = 'interrupted'; run.note = 'Process ended without a confirmed result; inspect the source Session before continuing.' }
      for (const thought of state.thoughts) if (thought.status === 'exploring') thought.status = 'resting'
    })
  }

  /** Read detached committed state; untrusted or closing storage rejects.
   *
   * @returns Confirmed state, including interruption receipts.
   */
  read(): SpontaneityState {
    if (this.failure !== undefined) throw this.failure
    if (this.closing !== undefined) throw new GenesisError('closed', 'Spontaneity is closing.')
    return this.committed()
  }

  private committed(): SpontaneityState {
    if (this.failure !== undefined) throw this.failure
    return structuredClone(this.domain.table('state').get('current') ?? {
      schemaVersion: 1, lifeId: this.lifeId, revision: 0, thoughts: [], runs: [], history: [],
    })
  }

  private change<T>(edit: (state: SpontaneityState) => T): Promise<T> {
    this.read()
    const operation = this.tail.then(async () => {
      const state = this.committed()
      const result = edit(state)
      state.revision++
      const next = spontaneityStateSchema.parse(state)
      if (next.thoughts.length + next.runs.length + next.history.length > this.config.maxRecords
        || JSON.stringify(next).length > this.config.maxStateChars) throw new GenesisError('capacity', 'Thought storage is full. Export or delete current text, or increase spontaneity retention limits.')
      try { await this.domain.table('state').put('current', next) }
      catch (error) { this.failure = new GenesisError('storage', 'Thought write outcome is uncertain. Stop exploration and reload verified storage.', { cause: error }); throw this.failure }
      return result
    })
    this.tail = operation.then(() => {}, (_error: unknown) => { /* Operation owner reports the error; close drains accepted writes. */ })
    return operation
  }

  /** Reserve once; the rolling quota counts empty, failed and interrupted opportunities too.
   *
   * @param run - Host-assigned source and Session.
   *
   * @returns Whether a new opportunity was admitted.
   */
  reserve(run: SpontaneityRun): Promise<boolean> {
    return this.change((state) => {
      const old = state.runs.find(item => item.key === run.key)
      if (old !== undefined) {
        if (old.sourceEventId !== run.sourceEventId) throw new GenesisError('invalid-source', 'Opportunity key refers to different evidence.')
        return false
      }
      if (state.runs.filter(item => run.createdAt - item.createdAt < 86400000).length >= this.config.maxPer24Hours) return false
      state.runs.push(run)
      return true
    })
  }

  /** Persist a sourced edit with an exact replay receipt; deletion redacts prior thought text.
   *
   * @param edit - Validated main-model choice.
   *
   * @param source - Actual tool invocation.
   *
   * @returns Stable thought identity.
   */
  edit(edit: ThoughtEdit, source: { sessionId: SessionId; callId: ToolCallId }): Promise<ThoughtId> {
    return this.change((state) => {
      const key = `${source.sessionId}:${source.callId}`
      const fingerprint = createHash('sha256').update(JSON.stringify(edit)).digest('hex')
      const previous = state.history.find(item => item.key === key)
      if (previous !== undefined) {
        if (previous.fingerprint !== fingerprint) throw new GenesisError('invalid-source', 'Thought tool replay has different fields.')
        return previous.thoughtId
      }
      if (edit.action === 'delete' && edit.id === undefined) throw new GenesisError('invalid-source', 'Deleting a thought requires its existing id.')
      const old = edit.id === undefined ? undefined : state.thoughts.find(item => item.id === edit.id)
      if (edit.id !== undefined && old === undefined) throw new GenesisError('invalid-source', 'Thought is missing or deleted; list current thoughts before editing.')
      if (old === undefined && state.thoughts.some(item => item.title.normalize('NFKC').toLocaleLowerCase() === edit.title.normalize('NFKC').toLocaleLowerCase())) {
        throw new GenesisError('invalid-source', 'A thought with this title exists. Update its id instead.')
      }
      const id = old?.id ?? brandString<ThoughtId>(randomUUID())
      const now = new Date().toISOString()
      const after = edit.action === 'delete' ? null : { id, title: edit.title, content: edit.content, reason: edit.reason,
        status: edit.action === 'save' ? 'saved' as const : edit.action === 'rest' ? 'resting' as const
          : edit.action === 'drop' ? 'dropped' as const : edit.action === 'promote' ? 'promoted' as const : 'exploring' as const,
        sourceEventIds: [...new Set([...(old?.sourceEventIds ?? []), ...edit.sourceEventIds])],
        createdAt: old?.createdAt ?? now, updatedAt: now, revisitAfter: edit.revisitAfter,
        ...(edit.goalId === undefined ? {} : { goalId: brandString<LifeGoalId>(edit.goalId) }) }
      if (after === null) {
        state.thoughts = state.thoughts.filter(item => item.id !== id)
        for (const receipt of state.history) if (receipt.thoughtId === id) receipt.after = null
      } else if (old === undefined) state.thoughts.push(after)
      else state.thoughts[state.thoughts.indexOf(old)] = after
      state.history.push({ key, fingerprint, thoughtId: id, at: now, action: edit.action, sessionId: source.sessionId,
        sourceEventIds: edit.sourceEventIds, after })
      return id
    })
  }

  /** Publish execution ownership or settlement without manufacturing success.
   *
   * @param key - Reserved opportunity.
   *
   * @param fields - Host-observed receipt fields.
   *
   * @returns After durable update.
   */
  updateRun(key: string, fields: Partial<Pick<SpontaneityRun, 'thoughtId' | 'decisionId' | 'status' | 'note'>>): Promise<void> {
    return this.change((state) => {
      const run = state.runs.find(item => item.key === key)
      if (run === undefined) throw new GenesisError('invalid-source', 'Exploration reservation is missing.')
      Object.assign(run, fields)
      if (run.status !== 'reserved') for (const thought of state.thoughts) {
        if (thought.id === run.thoughtId && thought.status === 'exploring') { thought.status = 'resting'; thought.updatedAt = new Date().toISOString() }
      }
    })
  }

  /** Save operator controls without conflicting with unrelated thought writes.
   *
   * @param controls - Complete validated settings.
   *
   * @param revision - Displayed controls revision.
   *
   * @returns Committed settings revision.
   */
  configure(controls: SpontaneitySettings, revision: number): Promise<number> {
    return this.change(state => {
      if ((state.controlsRevision ?? 0) !== revision) throw new GenesisError('configuration-conflict', 'Spontaneity settings changed. Reload before saving.')
      state.controls = controls; state.controlsRevision = revision + 1
      return state.controlsRevision
    })
  }

  /** Drain accepted writes before closing the domain.
   *
   * @returns After storage closes. */
  close(): Promise<void> { this.closing ??= this.tail.then(() => this.domain.close()); return this.closing }
}
