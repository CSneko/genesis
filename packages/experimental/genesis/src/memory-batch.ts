/** Session-local automatic memory batches; only settled reviews advance the replayable cursor. @module */
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { appendPluginRecord, pluginRecordOf, type SessionId } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { ManualMemoryProjection } from './manual-projection.ts'
import type { MemoryConfig } from './config.ts'
import type { LifeMemoryEngine } from './memory.ts'
import { GenesisError } from './error.ts'
import { statusFailure } from './status-error.ts'

const cursorSchema = z.strictObject({ through: z.number().int().min(-1).nullable() })
const receiptSchema = z.strictObject({ version: z.literal(1), through: z.number().int().min(-1) })

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Automatic memory evidence settled through this Session sequence; no conversation text is copied. */
    'plugin:genesis/memory-batch': z.infer<typeof receiptSchema>
  }
}

/** Fixed-size private checkpoint; replay never invokes a model or changes life data. */
export const memoryBatchProjection: ProjectionDefinition<'genesisMemoryBatch', z.infer<typeof cursorSchema>> = {
  key: 'genesisMemoryBatch', stateVersion: 1, stateSchema: cursorSchema,
  init: () => ({ through: null }),
  apply: (state, event) => {
    const record = pluginRecordOf(event)
    if (record?.type !== 'plugin:genesis/memory-batch') return state
    const receipt = receiptSchema.parse(record.data)
    if (receipt.through >= event.seq)
      throw new GenesisError('invalid-state', 'Memory batch checkpoint references unavailable evidence. Inspect the Session log before resuming.')
    return { through: Math.max(state.through ?? -1, receipt.through) }
  },
}

type Reply = ManualMemoryProjection['replies'][string]

function replyEnd(reply: Reply) {
  const message = reply.messages.at(-1)
  if (message === undefined) throw new GenesisError('invalid-state', 'A completed memory exchange has no messages. Inspect the Session log.')
  return message
}

/** Owns partial-batch timers and in-flight scheduling; evidence and settlement remain in Session projections. */
export class MemoryBatcher {
  private readonly timers = new Map<SessionId, ReturnType<typeof setTimeout>>()
  private readonly running = new Map<SessionId, Promise<void>>()
  private readonly agents = new Map<SessionId, AbortController>()
  private closed = false

  /**
   * @param ctx - Ready Genesis evidence owner and diagnostic logger.
   * @param engine - Serialized memory writer.
   * @param config - Validated batching and evidence budgets.
   */
  constructor(private readonly ctx: Context, private readonly engine: LifeMemoryEngine, private readonly config: MemoryConfig) {}

  /**
   * Initialize the upgrade baseline or resume unreviewed complete exchanges after reopening a Session.
   * Historical Sessions without a cursor begin at their latest reply; no history-wide backfill is performed.
   * @param agent - Prepared Life Agent.
   */
  attach(agent: Agent): void {
    if (this.closed || this.agents.has(agent.id)) return
    this.agents.set(agent.id, new AbortController())
    const cursor = this.cursor(agent)
    if (cursor === null) {
      const through = this.replies(agent).reduce((last, reply) => Math.max(last, ...reply.messages.map(message => message.seq)), -1)
      this.commit(agent, through)
    }
    this.schedule(agent)
  }

  /** Cancel an idle timer while its Session is active; completed batches already admitted may finish. @param id - Active Session. */
  activity(id: SessionId): void {
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
  }

  /** Admit a full batch or arm one idle timer for a partial batch. @param agent - Source Agent after a completed turn. */
  schedule(agent: Agent): void {
    this.activity(agent.id)
    if (this.closed || this.running.has(agent.id)) return
    const pending = this.pending(agent)
    const latest = pending.at(-1)
    if (latest === undefined) return
    if (pending.length >= this.config.batchTurns) {
      this.launch(agent, false)
      return
    }
    const delay = Math.max(0, Date.parse(replyEnd(latest).timestamp) + this.config.batchIdleMs - Date.now())
    const timer = setTimeout(() => {
      this.timers.delete(agent.id)
      if (agent.status === 'idle') this.launch(agent, true)
    }, delay)
    timer.unref()
    this.timers.set(agent.id, timer)
  }

  /**
   * Release a disposed Agent's timer and cancel inference. Durable unreviewed evidence is retained.
   * @param id - Disposed Session.
   * @returns After its accepted operation settles.
   */
  async forget(id: SessionId): Promise<void> {
    this.activity(id)
    this.agents.get(id)?.abort()
    await this.running.get(id)
    this.agents.delete(id)
  }

  /**
   * Stop scheduling and wait for accepted batches. The engine owns cancellation.
   * @returns After callbacks can no longer schedule or commit work.
   */
  async close(): Promise<void> {
    this.closed = true
    for (const id of this.timers.keys()) this.activity(id)
    for (const controller of this.agents.values()) controller.abort()
    await Promise.allSettled(this.running.values())
    this.agents.clear()
  }

  /**
   * Retry pending complete exchanges immediately, without a chat turn.
   * @param agent - Original Life Agent.
   * @param signal - Operator cancellation.
   * @returns After the captured pending batches settle. Failed evidence stays pending.
   */
  async retry(agent: Agent, signal: AbortSignal): Promise<void> {
    this.activity(agent.id)
    await this.running.get(agent.id)
    signal.throwIfAborted()
    const operation = this.drain(agent, true, signal)
    this.running.set(agent.id, operation)
    try { await operation } finally { this.running.delete(agent.id) }
    this.schedule(agent)
  }

  private cursor(agent: Agent): number | null {
    const cursor = this.ctx.genesisSessionEvidence.memoryBatchOf(agent.session)
    if (cursor === undefined) throw new GenesisError('invalid-state', 'Memory batch checkpoint is unavailable. Reopen the conversation.')
    return cursor.through
  }

  private replies(agent: Agent): Reply[] {
    const evidence = this.ctx.genesisSessionEvidence.manualMemoryOf(agent.session)
    if (evidence === undefined) throw new GenesisError('invalid-state', 'Memory reply evidence is unavailable. Reopen the conversation.')
    const turns = new Map<number, Reply>()
    for (const reply of Object.values(evidence.replies)) {
      if (!reply.complete) continue
      const previous = turns.get(reply.turn)
      if (previous === undefined || replyEnd(previous).seq < replyEnd(reply).seq) turns.set(reply.turn, reply)
    }
    return [...turns.values()].sort((a, b) => a.turn - b.turn)
  }

  private pending(agent: Agent): Reply[] {
    const through = this.cursor(agent)
    if (through === null) throw new GenesisError('invalid-state', 'Initialize the memory batch checkpoint before scheduling review.')
    return this.replies(agent).filter(reply => replyEnd(reply).seq > through)
  }

  private commit(agent: Agent, through: number): void {
    appendPluginRecord(agent.session, 'plugin:genesis/memory-batch', { version: 1, through })
  }

  private launch(agent: Agent, partial: boolean): void {
    if (this.closed || this.running.has(agent.id)) return
    const operation = this.drain(agent, partial).then(() => {
      this.running.delete(agent.id)
      if (!this.closed && !this.agents.get(agent.id)?.signal.aborted && this.ctx.agents.get(agent.id) === agent) this.schedule(agent)
    }).catch((error: unknown) => {
      this.running.delete(agent.id)
      // Failed evidence remains pending; only new activity, an explicit retry or reopen starts another attempt.
      if (!this.closed && !this.agents.get(agent.id)?.signal.aborted)
        this.ctx.logger.error(`Genesis automatic memory batch remains pending. Check memory review diagnostics before retrying. ${statusFailure(error).message}`)
    })
    this.running.set(agent.id, operation)
  }

  private async drain(agent: Agent, partial: boolean, caller?: AbortSignal): Promise<void> {
    const owned = this.agents.get(agent.id)?.signal
    if (owned === undefined) throw new GenesisError('invalid-state', 'Attach the Life Agent before reviewing automatic memory batches.')
    const signal = caller === undefined ? owned : AbortSignal.any([owned, caller])
    while (!this.closed) {
      signal.throwIfAborted()
      const pending = this.pending(agent)
      if (pending.length === 0 || (!partial && pending.length < this.config.batchTurns)) return
      const batch: Reply[] = []
      for (const reply of pending.slice(0, this.config.batchTurns)) {
        if (JSON.stringify({ conversation: [...batch, reply].flatMap(item => item.messages) }).length > this.config.inputChars / 2) {
          if (batch.length > 0) break
          throw new GenesisError('capacity', 'One pending memory exchange exceeds memory.inputChars. Increase the review budget; no evidence was skipped.')
        }
        batch.push(reply)
      }
      const [first, ...rest] = batch
      const start = first?.messages[0]
      if (first === undefined || start === undefined)
        throw new GenesisError('invalid-state', 'A completed memory exchange has no messages. Inspect the Session log.')
      const contextTurns = Math.max(0, this.config.windowTurns - batch.length)
      const earlier = contextTurns === 0 ? [] : this.replies(agent).filter(reply => reply.turn < first.turn).slice(-contextTurns)
      const conversation = () => [...earlier, ...batch].flatMap(reply => reply.messages)
      while (earlier.length > 0 && JSON.stringify({ conversation: conversation() }).length > this.config.inputChars / 2) earlier.shift()
      const through = replyEnd(batch.at(-1) ?? first).seq
      const key = `${agent.id}:batch:${start.seq}:${through}`
      const turnOf = (reply: Reply) => ({ turn: reply.turn, seqs: reply.messages.map(message => message.seq) })
      await this.engine.reviewBatch(agent, key, conversation(), [turnOf(first), ...rest.map(turnOf)], signal)
      this.commit(agent, through)
    }
  }
}
