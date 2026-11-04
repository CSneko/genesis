/** Connection-local event buffering and active-handler deadlines for resident scripts. @module */
import { z } from 'zod'
import { failure } from './settings.ts'
import type { MinecraftScriptEvent } from './types.ts'

/** Supported script events; all payloads are observed game data, never instruction authority. */
export const scriptEventNames = ['chat', 'health', 'blockUpdate', 'inventory', 'tick'] as const
/** Validate subscriptions arriving from executable script code. */
export const eventSubscriptionSchema = z.strictObject({ types: z.array(z.enum(scriptEventNames)).min(1).max(scriptEventNames.length) })

/** One bounded queue; callbacks run serially in the child and never in Mineflayer event listeners. */
export class ScriptEvents {
  private queue: MinecraftScriptEvent[] = []
  private types = new Set<string>(scriptEventNames)
  private waiter: { resolve: (event: MinecraftScriptEvent & { omitted: number }) => void; reject: (error: Error) => void } | undefined
  private deadline: ReturnType<typeof setTimeout> | undefined
  private readonly ticks: ReturnType<typeof setInterval>
  private omitted = 0
  private closed = false
  /** Number of audited events delivered to the script. */
  delivered = 0
  /** Whether initialization or the active handler exhausted its elapsed budget. */
  timedOut = false
  /**
   * @param limit - Maximum retained events; overflow discards the oldest and reports omissions.
   * @param tickMs - Minimum interval between generated tick events.
   * @param handlerMs - Maximum active initialization or callback time; idle event waits do not expire.
   * @param timeout - Stops the owning script and its game actions on active execution expiry.
   * @param record - Synchronous event audit; audit failure rejects delivery and stops the script.
   */
  constructor(private readonly limit: number, tickMs: number, private readonly handlerMs: number,
    private readonly timeout: () => void, private readonly record: (event: MinecraftScriptEvent & { omitted: number }) => void) {
    this.arm()
    this.ticks = setInterval(() => { this.emit({ type: 'tick', time: new Date().toISOString() }) }, tickMs)
    this.ticks.unref()
  }
  /** Whether the script has yielded until another matching event. @returns Current idle wait state. */
  get waiting(): boolean { return this.waiter !== undefined }
  /** Retained event count. @returns Queue occupancy within the configured limit. */
  get queued(): number { return this.queue.length }
  /**
   * Buffer observed game data; repeated ticks and inventory changes coalesce while busy.
   * @param event - Bounded detached payload from the connection owner.
   */
  emit(event: MinecraftScriptEvent): void {
    if (this.closed || !this.types.has(event.type)) return
    if (this.waiter !== undefined) { this.deliver(event); return }
    if (event.type === 'tick' || event.type === 'inventory') {
      const index = this.queue.findIndex(previous => previous.type === event.type)
      if (index >= 0) { this.queue.splice(index, 1); this.omitted++ }
    }
    if (this.queue.length >= this.limit) { this.queue.shift(); this.omitted++ }
    this.queue.push(structuredClone(event))
  }
  /**
   * Suspend until a subscribed event; active callback time restarts only on delivery.
   * @param types - Validated event names currently registered in the child.
   * @returns Audited event with an omission count; close rejects pending waits.
   */
  next(types: string[]): Promise<MinecraftScriptEvent & { omitted: number }> {
    if (this.closed) return Promise.reject(failure('script-stopped'))
    if (this.waiter !== undefined) return Promise.reject(failure('script-event-wait-pending'))
    clearTimeout(this.deadline)
    this.types = new Set(types)
    this.queue = this.queue.filter(event => this.types.has(event.type))
    const promise = new Promise<MinecraftScriptEvent & { omitted: number }>((resolve, reject) => { this.waiter = { resolve, reject } })
    const event = this.queue.shift()
    if (event !== undefined) this.deliver(event)
    return promise
  }
  private deliver(event: MinecraftScriptEvent) {
    const waiter = this.waiter
    if (waiter === undefined) return
    this.waiter = undefined
    const delivered = { ...event, omitted: this.omitted }
    this.omitted = 0
    try { this.record(delivered) }
    catch (error) { waiter.reject(error instanceof Error ? error : failure('script-event-audit-failed')); this.close(); return }
    this.delivered++; this.arm(); waiter.resolve(delivered)
  }
  private arm() {
    clearTimeout(this.deadline)
    this.deadline = setTimeout(() => { this.timedOut = true; this.timeout() }, this.handlerMs)
    this.deadline.unref()
  }
  /** Remove timers and reject the event wait before releasing the process. */
  close(): void {
    this.closed = true; clearTimeout(this.deadline); clearInterval(this.ticks)
    this.queue = []; this.waiter?.reject(failure('script-stopped')); this.waiter = undefined
  }
}
