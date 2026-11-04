/** Durable explicit task submissions under the exclusive Genesis writer lease. @module */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { MessageId, type ToolCallId } from '@deepseek-ai/dsh-llm'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import type { LifeId } from './model.ts'
import type { Config } from './config.ts'
import { GenesisError } from './error.ts'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const controlSchema = z.strictObject({ id: z.string().min(1).transform(brandString<MessageId>),
  requestId: z.string().min(1).max(200), kind: z.enum(['resume', 'stop', 'operator']), expectedTurn: z.number().int().nonnegative(),
  requester: z.string().min(1).transform(brandString<SessionId>), callId: z.string().min(1).transform(brandString<ToolCallId>).optional(),
  sourceMessageId: z.string().min(1).transform(brandString<MessageId>).optional(),
  sandbox: z.enum(['read-only', 'workspace-write', 'danger-full-access']), denyApproval: z.boolean(),
  status: z.enum(['pending', 'done']),
}).refine(request => request.kind === 'operator' ? request.sourceMessageId !== undefined && request.callId === undefined : request.callId !== undefined)
const rowSchema = z.strictObject({
  schemaVersion: z.literal(1), lifeId: z.string().min(1).transform(brandString<LifeId>),
  sessionId: z.string().min(1).transform(brandString<SessionId>),
  requester: z.string().min(1).transform(brandString<SessionId>),
  workspaceId: z.string().min(1).transform(brandString<WorkspaceId>), workspacePath: z.string().min(1),
  mode: z.string().min(1), requestId: z.string().min(1).max(200), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sandbox: z.enum(['read-only', 'workspace-write', 'danger-full-access']), denyApproval: z.boolean(),
  delivery: z.enum(['pending', 'delivered', 'withdrawn']), prompt: z.string().min(1).max(100000).nullable(),
  controls: z.strictObject({ paused: z.boolean(), requests: z.array(controlSchema) }).optional(),
}).refine(row => row.delivery === 'pending' ? row.prompt !== null : row.prompt === null)

/** Submission and pending delivery share one atomic row; acknowledged rows retain no prompt body. */
export const taskQueueDomain = defineDomain({ name: 'genesis_tasks', version: 1,
  tables: { submissions: domainTable<SessionId, z.infer<typeof rowSchema>>(rowSchema) } })
/** Immutable task identity, captured permission ceilings and durable delivery state. */
export type TaskSubmission = z.infer<typeof rowSchema>
/** One explicit control request; replay preserves its original caller and permission ceilings. */
export type TaskControl = z.infer<typeof controlSchema>

/**
 * Derive the same task Session across Life conversations and restarts.
 * @param lifeId - Persistent life identity.
 * @param requestId - Explicit idempotency key.
 * @returns Stable task Session identity.
 */
export function taskSessionId(lifeId: LifeId, requestId: string): SessionId {
  return SessionId(`life-task-${digest([lifeId, requestId])}`)
}

/**
 * Identify the immutable submitted work independently of delivery attempts.
 * @param workspaceId - Registered target.
 * @param mode - Explicit ordinary preset.
 * @param prompt - Complete assignment text.
 * @returns Input digest, including the workspace identity.
 */
export function taskFingerprint(workspaceId: WorkspaceId, mode: string, prompt: string): string {
  return digest([workspaceId, mode, prompt])
}

/** Serial admission and receipts; uncertain writes stop all dependent operations until reload. */
export class TaskQueue {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined
  private closed = false
  private readonly owned = new Set<SessionId>()

  /** @param domain - Exclusively owned task data. @param lifeId - Expected owner. @param config - Shared retained-data limits. */
  constructor(private readonly domain: Domain<typeof taskQueueDomain>, lifeId: LifeId,
    private readonly config: Pick<Config, 'maxRecords' | 'maxStateChars'>) {
    const rows = [...domain.table('submissions').entries()]
    this.bounded(rows.map(([, row]) => row))
    for (const [key, row] of rows) {
      if (key !== row.sessionId || row.lifeId !== lifeId || key !== taskSessionId(lifeId, row.requestId)
        || (row.prompt !== null && row.fingerprint !== taskFingerprint(row.workspaceId, row.mode, row.prompt))) {
        throw new GenesisError('invalid-state', 'Task storage identity or input digest is inconsistent. Restore verified task storage before submitting work.')
      }
      if (new Set(row.controls?.requests.map(request => request.id)).size !== (row.controls?.requests.length ?? 0)) {
        throw new GenesisError('invalid-state', 'Task storage repeats a control request. Restore verified storage before continuing.')
      }
      this.owned.add(key)
    }
  }

  /** Identify managed or uncertain submissions without trusting their state. @param id - Session identity. @returns Ownership only. */
  owns(id: SessionId): boolean { return this.owned.has(id) }

  /** Read an immutable submission without waking its Session. @param id - Task Session. @returns Saved row, if any. */
  get(id: SessionId): TaskSubmission | undefined {
    this.readable()
    return this.domain.table('submissions').get(id)
  }

  /** Read immutable managed submissions for bounded operator inspection.
   * @returns Retained receipts; this does not load or dispatch a Session. */
  list(): TaskSubmission[] {
    this.readable()
    return [...this.domain.table('submissions').entries()].map(([, row]) => row)
  }

  /** Read submissions without a confirmed delivery receipt. @param id - Target workspace. @returns Pending rows only. */
  pending(id: WorkspaceId): TaskSubmission[] {
    this.readable()
    return [...this.domain.table('submissions').entries()].map(([, row]) => row)
      .filter(row => row.workspaceId === id && row.delivery === 'pending')
  }

  /**
   * Reserve identical work once, before Session creation or delivery.
   * @param row - Validated assignment with pending delivery and permission ceilings.
   * @returns Existing or newly committed submission; conflicting input never replaces it.
   */
  reserve(row: TaskSubmission): Promise<TaskSubmission> {
    return this.serial(async () => {
      const previous = this.get(row.sessionId)
      if (previous !== undefined) {
        if (previous.fingerprint !== row.fingerprint || previous.workspacePath !== row.workspacePath) {
          throw new GenesisError('invalid-source', 'Request id is already reserved for different work. Inspect the existing task.')
        }
        return previous
      }
      this.bounded([...this.domain.table('submissions').entries()].map(([, value]) => value).concat(row))
      this.owned.add(row.sessionId)
      await this.put(row)
      return row
    })
  }

  /** Record caller-verified Session durability and erase the queued body. @param id - Task Session. @returns After receipt durability. */
  delivered(id: SessionId): Promise<void> {
    return this.serial(async () => {
      const row = this.get(id)
      if (row === undefined) throw new GenesisError('invalid-state', 'Task submission is missing. Inspect storage before retrying.')
      if (row.delivery === 'pending') await this.put({ ...row, delivery: 'delivered', prompt: null })
    })
  }

  /** Erase an undelivered body while reserving its key. @param id - Task Session. @returns Whether delivery was withdrawn. */
  withdraw(id: SessionId): Promise<boolean> {
    return this.serial(async () => {
      const row = this.get(id)
      if (row === undefined) throw new GenesisError('invalid-source', 'Task submission is unknown.')
      if (row.delivery === 'delivered') return false
      if (row.delivery === 'pending') await this.put({ ...row, delivery: 'withdrawn', prompt: null })
      return true
    })
  }

  /**
   * Persist a stop latch or explicit resume before changing execution.
   * @param id - Managed task Session.
   * @param request - Stable request identity and captured permission ceilings.
   * @returns Existing receipt or new pending request; a newer control supersedes an unfinished older one.
   */
  control(id: SessionId, request: TaskControl): Promise<TaskControl> {
    return this.serial(async () => {
      const row = this.get(id)
      if (row === undefined || row.delivery !== 'delivered') throw new GenesisError('invalid-state', 'Confirm initial task delivery before controlling execution.')
      const requests = row.controls?.requests ?? []
      const previous = requests.find(item => item.id === request.id)
      if (previous !== undefined) {
        if (previous.kind !== request.kind || previous.expectedTurn !== request.expectedTurn) {
          throw new GenesisError('invalid-source', 'Control request_id is reserved for a different action or turn.')
        }
        if (previous.status === 'pending' && requests.at(-1)?.id !== previous.id) {
          throw new GenesisError('configuration-conflict', 'A newer task control superseded this request. Inspect current state.')
        }
        return previous
      }
      const next = { ...row, controls: { paused: request.kind === 'stop', requests: [...requests, request] } }
      this.bounded([...this.domain.table('submissions').entries()].map(([key, value]) => key === id ? next : value))
      await this.put(next)
      return request
    })
  }

  /**
   * Release a task stop for actual operator input, retaining its durable inbox identity.
   * @param id - Worker receiving the operator message.
   * @param messageId - Actual input from its logged inbox, never model-supplied evidence.
   * @param turn - Receiving turn.
   * @returns After the operator control is durable; old message receipts never undo a later stop.
   */
  async operatorResume(id: SessionId, messageId: MessageId, turn: number): Promise<void> {
    const row = this.get(id)
    if (row === undefined) throw new GenesisError('invalid-state', 'Task submission is missing.')
    await this.control(id, { id: MessageId(`genesis-task-operator:${messageId}`), requestId: digest(messageId), kind: 'operator',
      expectedTurn: turn, requester: id, sourceMessageId: messageId, sandbox: row.sandbox, denyApproval: row.denyApproval, status: 'done' })
  }

  /**
   * Confirm a control from actual delivery or quiescence.
   * @param id - Task Session.
   * @param controlId - Request identity.
   * @returns After receipt durability.
   */
  settleControl(id: SessionId, controlId: MessageId): Promise<void> {
    return this.serial(async () => {
      const row = this.get(id)
      if (row?.controls === undefined) throw new GenesisError('invalid-state', 'Task control is missing. Inspect task storage.')
      const request = row.controls.requests.find(item => item.id === controlId)
      if (request === undefined) throw new GenesisError('invalid-state', 'Task control receipt is missing. Inspect task storage.')
      if (request.status === 'done') return
      await this.put({ ...row, controls: { ...row.controls,
        requests: row.controls.requests.map(item => item.id === controlId ? { ...item, status: 'done' } : item) } })
    })
  }

  private readable(): void {
    if (this.failure !== undefined) throw this.failure
    if (this.closed) throw new GenesisError('closed', 'Task storage is closed.')
  }

  private bounded(rows: TaskSubmission[]): void {
    if (rows.length + rows.reduce((count, row) => count + (row.controls?.requests.length ?? 0), 0) > this.config.maxRecords
      || JSON.stringify(rows).length > this.config.maxStateChars) {
      throw new GenesisError('capacity', 'Task storage exceeds maxRecords or maxStateChars. Increase these limits before submitting work; retain existing receipts.')
    }
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    this.readable()
    if (this.closing !== undefined) throw new GenesisError('closed', 'Task storage is closing.')
    const operation = this.tail.then(() => { this.readable(); return work() })
    this.tail = operation.then(() => {}, (_error: unknown) => { /* The tool reports failure; close drains accepted writes. */ })
    return operation
  }

  private async put(row: TaskSubmission): Promise<void> {
    try { await this.domain.table('submissions').put(row.sessionId, row) }
    catch (error) {
      this.failure = new GenesisError('storage', 'Task write has an uncertain outcome. Stop task submission and reload verified storage; do not use a new request id.', { cause: error })
      throw this.failure
    }
  }

  /** Drain accepted writes before releasing storage. @returns After the task domain closes. */
  close(): Promise<void> {
    this.closing ??= this.tail.then(async () => { await this.domain.close(); this.closed = true })
    return this.closing
  }
}
