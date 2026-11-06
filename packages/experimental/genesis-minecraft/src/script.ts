import { dispatchGameTool } from './tool-dispatch.ts'
/** One-shot and event-driven Minecraft programs reuse PTC confinement and dispatch every game operation through guarded tools. @module */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import type { PtcRuntime, PtcRunRequest, PtcRunResult, PtcJsonValue } from '@deepseek-ai/dsh-ptc-runtime'
import { z } from 'zod'
import { actionSchema } from './runtime.ts'
import { blockQuerySchema } from './blocks.ts'
import { ScriptEvents, eventSubscriptionSchema, scriptEventNames } from './script-events.ts'
import type { MinecraftScriptEvent } from './types.ts'
import { failure } from './settings.ts'

/** Async TypeScript source; resident mode uses a deadline per initialization or event handler. */
export const scriptSchema = z.strictObject({ code: z.string().trim().min(1), mode: z.enum(['once', 'event']).default('once'), timeoutMs: z.number().int().min(100).max(300000).optional() })
/** Parsed source and optional elapsed deadline. */
export type MinecraftScriptRequest = z.infer<typeof scriptSchema>
/** Existing code, output and task time bounds plus the script binding-call limit. */
export interface ScriptConfig {
  /** Maximum serialized script audit input; source is bounded to half this value. */
  inputChars: number
  /** Maximum serialized audit record; script output is bounded to half this value. */
  resultChars: number
  /** Maximum elapsed milliseconds for tasks and finite Minecraft scripts. */
  taskTimeoutLimitMs: number
  /** Maximum guarded tool dispatches per one-shot run or resident handler; each action uses two calls. */
  scriptCallLimit: number
  /** Maximum queued observed events for a resident script. */
  scriptEventQueueLimit: number
  /** Milliseconds between generated tick events; busy callbacks coalesce ticks. */
  scriptTickMs: number
}
/** Bound PTC provider and standing Session authority; the script cannot request escalation. */
export interface ScriptEnvironment {
  runtime: PtcRuntime
  cwd: string
  sandboxPolicy: NonNullable<PtcRunRequest['sandboxPolicy']>
}
type ScriptOutcome = {
  outcome: 'completed' | 'failed' | 'interrupted' | 'timed-out'
  calls: number
  mode: 'once' | 'event'
  events: number
  budget: { requestedTimeoutMs: number; timeoutMs: number | null; handlerTimeoutMs: number; callLimit: number }
  result: PtcRunResult
}
type Running = {
  lifetime: AbortController
  done: Promise<ScriptOutcome>
  events?: ScriptEvents
  status: () => object
}
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Script source, binding arguments/results and final outcome; records never execute during replay. */
    'plugin:genesis-minecraft/script': { version: 1; phase: 'start' | 'call' | 'event' | 'end'; data: object }
  }
}

/** One script owns serial game dispatch; the PTC provider owns process isolation and hard cancellation. */
export class MinecraftScripts {
  private current: Running | undefined
  private last: ScriptOutcome | undefined
  private readonly calls = new Set<ToolCallId>()
  /**
   * @param ctx - Existing guarded executor, audit and lifetime owner.
   * @param config - Validated code, result, elapsed and binding-call bounds.
   */
  constructor(private readonly ctx: Context, private readonly config: ScriptConfig) {}
  /** Read current execution or its last terminal result. @returns Detached status without resuming code. */
  status(): object | null { return structuredClone(this.current?.status() ?? this.last ?? null) }
  /**
   * Queue bounded observed game data for a resident script.
   * @param event - Detached payload owned by the current connection.
   */
  emit(event: MinecraftScriptEvent): void { this.current?.events?.emit(event) }
  /**
   * Identify a script-owned game action.
   * @param id - Actual executor call identifier, absent for ordinary callers.
   * @returns Whether this script owns that subordinate call.
   */
  owns(id: ToolCallId | undefined): boolean { return id !== undefined && this.calls.has(id) }
  /** Stop accepting script operations and abort its PTC process; game controls are stopped by the controller. */
  stop(): void { this.current?.lifetime.abort(); this.current?.events?.close() }
  /**
   * Admit one one-shot or resident script; return its completion separately so game command serialization is released.
   * @param request - Parsed async function body and requested duration; omission uses the deployment limit, per handler in event mode.
   * @param agent - Connection-owning Life Agent whose permissions govern every subordinate operation.
   * @param environment - Provider, current directory and standing file policy captured at admission.
   * @param signal - Admission and one-shot cancellation; admitted event scripts use the connection lifetime.
   * @param admitted - Controller callback after validation, before execution; replaces prior game activity.
   * @returns Admission status and completion with actual budgets and partial logs. Restart never resumes code.
   */
  start(request: MinecraftScriptRequest, agent: Agent, environment: ScriptEnvironment, signal: AbortSignal,
    admitted: () => void): { completion: Promise<ScriptOutcome>; status: object } {
    signal.throwIfAborted()
    if (this.current !== undefined) throw failure('script-already-running', { guidance: 'Stop the current Minecraft script before starting another.' })
    if (environment.runtime.language !== 'typescript') throw failure('script-typescript-required', { guidance: 'Configure a TypeScript PTC runtime for Minecraft scripts.' })
    if (request.code.length > this.config.inputChars / 2) throw failure('script-code-too-large', { guidance: `Limit source to ${Math.floor(this.config.inputChars / 2)} characters and split larger programs.` })
    const lifetime = new AbortController()
    const resident = request.mode === 'event'
    const owned = resident ? lifetime.signal : AbortSignal.any([signal, lifetime.signal])
    const requestedTimeoutMs = request.timeoutMs ?? this.config.taskTimeoutLimitMs
    const stateOwner = {}
    const handlerMs = Math.min(requestedTimeoutMs, this.config.taskTimeoutLimitMs,
      environment.runtime.timeout?.maxMs ?? this.config.taskTimeoutLimitMs)
    const budget = { requestedTimeoutMs, timeoutMs: resident ? null : handlerMs, handlerTimeoutMs: handlerMs,
      callLimit: this.config.scriptCallLimit }
    let count = 0
    let handlerCalls = 0
    let events: ScriptEvents | undefined
    let callLimitFailure: string | undefined
    let chain = Promise.resolve()
    const pending = new Set<Promise<PtcJsonValue>>()
    const dispatch = async (name: string, args: PtcJsonValue): Promise<PtcJsonValue> => {
      owned.throwIfAborted()
      if (handlerCalls >= budget.callLimit) {
        const error = failure('script-call-limit', { guidance: `Limit each script initialization or handler to ${budget.callLimit} underlying tool calls. Each mc.act uses two calls; split longer work into smaller scripts.` })
        callLimitFailure = error.message; lifetime.abort(); throw error
      }
      count++; handlerCalls++
      const callId = ToolCallId(`minecraft-script-${randomUUID()}`)
      this.calls.add(callId)
      try {
        const result = await dispatchGameTool(this.ctx, { name, arguments: args, callId, agent, signal: owned })
        const data = { name, arguments: args, isError: result.isError,
          ...(result.value === undefined ? {} : { value: result.value }), ...(result.isError ? { error: result.error } : {}) }
        this.record(agent, 'call', data)
        owned.throwIfAborted()
        if (result.isError) throw failure('script-tool-rejected', { guidance: result.error.message })
        return z.json().parse(result.value)
      } finally { this.calls.delete(callId) }
    }
    const enqueue = (operation: () => Promise<PtcJsonValue>): Promise<PtcJsonValue> => {
      const work = chain.then(() => { owned.throwIfAborted(); return operation() })
      chain = work.then(() => {}, (_error: unknown) => { /* A program may catch tool failures; cancellation closes the script. */ })
      pending.add(work)
      void work.then(() => { pending.delete(work) }, () => { pending.delete(work) })
      return work
    }
    const act = actionSchema.omit({ observationId: true, waitForCompletion: true })
    const program = `
      const handlers = new Map();
      const exitToken = Symbol('Minecraft exit');
      let exitValue = null;
      const mc = Object.freeze({
        observe: (query = {}) => __minecraft.observe(query),
        findBlocks: (query = {}) => __minecraft.findBlocks(query),
        act: action => __minecraft.act(action),
        on: (type, handler) => {
          if (!${resident} || !${JSON.stringify(scriptEventNames)}.includes(type) || typeof handler !== 'function')
            throw new Error('mc.on requires event mode, a supported event and a function');
          handlers.set(type, handler);
        },
        exit: (value = null) => { exitValue = value; throw exitToken; },
      });
      try {
        ${request.code}
        ${resident ? `while (handlers.size) {
          const event = await __minecraft.nextEvent({ types: [...handlers.keys()] });
          await handlers.get(event.type)(event);
        }` : ''}
      } catch (error) { if (error !== exitToken) throw error; }
      return exitValue;
    `
    const spec = environment.runtime.resolve({ program: environment.runtime.programFormat === 'function-body'
      ? program : `await (async () => {\n${program}\n})()`, stateOwner,
    cwd: environment.cwd, sandboxPolicy: environment.sandboxPolicy, signal: owned, timeoutMs: budget.timeoutMs,
    bindings: [{ global: '__minecraft', functions: {
      nextEvent: async (args) => {
        if (events === undefined) throw failure('script-events-unavailable')
        const subscription = eventSubscriptionSchema.parse(args)
        await chain
        const event = await events.next(subscription.types)
        handlerCalls = 0
        return z.json().parse(event)
      },
      observe: args => enqueue(async () => {
        const query = z.object({ blockName: z.string().max(100).optional() }).parse(args ?? {})
        const observed = await dispatch('minecraft_observe', z.json().parse(query))
        return z.object({ observation: z.json() }).parse(observed).observation
      }),
      findBlocks: args => enqueue(() => dispatch('minecraft_find_blocks', z.json().parse(blockQuerySchema.parse(args ?? {})))),
      act: args => enqueue(async () => {
        const action = act.parse(args)
        if (action.action === 'follow') throw failure('script-finite-actions-required')
        const observed = z.object({ observationId: z.string() }).parse(await dispatch('minecraft_find_blocks', { limit: 1 }))
        const result = await dispatch('minecraft_act', z.json().parse({ ...action, observationId: observed.observationId, waitForCompletion: true }))
        const outcome = z.object({ outcome: z.string() }).parse(result)
        if (outcome.outcome === 'interrupted' || outcome.outcome === 'timed-out') lifetime.abort()
        return result
      }),
    } }],
    })
    if (resident && spec.timeoutMs !== null) throw failure('script-resident-runtime-required')
    if (!resident && spec.timeoutMs === null) throw failure('script-deadline-required')
    budget.timeoutMs = spec.timeoutMs
    this.record(agent, 'start', { code: request.code, mode: request.mode, budget })
    admitted()
    if (resident) events = new ScriptEvents(this.config.scriptEventQueueLimit, this.config.scriptTickMs, handlerMs, () => {
      lifetime.abort(); events?.close()
    }, (event) => { this.record(agent, 'event', event) })
    const status = () => ({ outcome: 'running', mode: request.mode, budget, calls: count,
      events: events?.delivered ?? 0, waitingForEvent: events?.waiting ?? false, queuedEvents: events?.queued ?? 0 })
    const running: Running = { lifetime, ...(events === undefined ? {} : { events }), status,
      done: Promise.resolve({ outcome: 'failed', calls: 0, mode: request.mode, events: 0, budget, result: { logs: [] } }) }
    this.current = running
    running.done = (async () => {
      try {
        let result = await environment.runtime.run(spec)
        // Dropped binding promises cannot continue game work after the program returns.
        const unfinished = pending.size > 0
        const cancelled = owned.aborted
        lifetime.abort(); events?.close()
        await Promise.allSettled([...pending])
        if ((unfinished || cancelled) && result.error === undefined) result = { ...result,
          error: { kind: 'abort', message: unfinished ? 'Script returned before all game operations settled. Await every operation and inspect the world before continuing.' : 'Minecraft script was stopped. Inspect the world before continuing.' } }
        if (callLimitFailure !== undefined) result = { ...result, error: { kind: 'exception', message: callLimitFailure } }
        if (JSON.stringify(result).length > this.config.resultChars / 2) result = { logs: [],
          error: { kind: 'output-limit', message: 'Minecraft script output exceeded its limit. Return a smaller result.' } }
        if (events?.timedOut === true) result = { ...result, error: { kind: 'timeout',
          message: `Minecraft script initialization or event handler exceeded ${handlerMs} ms. Shorten the handler before restarting.` } }
        const outcome: ScriptOutcome = { outcome: result.error === undefined ? 'completed' : result.error.kind === 'timeout'
          ? 'timed-out' : result.error.kind === 'abort' ? 'interrupted' : 'failed', calls: count, mode: request.mode,
        events: events?.delivered ?? 0, budget, result }
        this.record(agent, 'end', outcome)
        this.last = outcome
        return outcome
      } finally {
        lifetime.abort(); events?.close()
        await Promise.allSettled([...pending])
        await environment.runtime.release(stateOwner)
        if (this.current === running) this.current = undefined
      }
    })()
    return { completion: running.done, status: status() }
  }
  private record(agent: Agent, phase: 'start' | 'call' | 'event' | 'end', data: object) {
    if (JSON.stringify(data).length > this.config.resultChars) { this.stop(); throw failure('script-audit-too-large') }
    try { appendPluginRecord(agent.session, 'plugin:genesis-minecraft/script', { version: 1, phase, data }) }
    catch (error) { this.stop(); throw error }
  }
  /** Stop and drain execution before dependencies or the connection are released. @returns After PTC and subordinate calls settle. */
  async close(): Promise<void> { this.stop(); await this.current?.done }
}
