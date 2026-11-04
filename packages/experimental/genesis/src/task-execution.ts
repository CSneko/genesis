/** Task execution observation and cooperative stop, adapted from Super-Agent worker lifecycle handling. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-jobs'
import type {} from '@deepseek-ai/dsh-subagent'
import { GenesisError } from './error.ts'
import type { TaskQueue } from './task-queue.ts'

/**
 * Read actual activity without loading an Agent or treating a turn end as task completion.
 * @param ctx - Existing activity providers.
 * @param id - Task Session.
 * @returns Per-family counts, including separately owned background work.
 */
export async function taskActivity(ctx: Context, id: SessionId): Promise<Array<{ kind: string; count: number }>> {
  const activity = await ctx.waterfall('workspace/session-activity', { sessionId: id }, () => Promise.resolve([]))
  return activity.map(item => ({ kind: item.kind, count: item.items?.length ?? 1 }))
}

/**
 * Keep stopped tasks paused across Sessions and restarts; unknown task state refuses new steps and tools.
 * @param ctx - Effect owner; guards remain registered until admitted task controls drain.
 * @param queue - Durable task owner.
 * @returns Exact registered disposers for ordered teardown.
 */
export function guardStoppedTasks(ctx: Context, queue: TaskQueue): Array<() => void> {
  const paused = (id: SessionId) => {
    if (!queue.owns(id)) return false
    try { return queue.get(id)?.controls?.paused === true }
    catch (_error) { return true /* Task storage errors remain visible through task inspection and control failures. */ }
  }
  return [
    ctx.on('agent/pre-step', async ({ agent, turn }, next) => {
      const decision = await next()
      if (decision.kind === 'enter' && paused(agent.id)) {
        const operator = decision.messages.find(message => message.source.kind === 'user')
        if (operator !== undefined) await queue.operatorResume(agent.id, operator.id, turn)
      }
      return paused(agent.id) ? { kind: 'reject' } : decision
    }, { global: true }),
    ctx.tools.guard(exec => exec.agent !== undefined && paused(exec.agent.id)
      ? 'This task is stopped or its storage is unavailable. Inspect it before an explicit authorized resume.' : undefined),
  ]
}

/**
 * Stop the worker's turn, owned jobs and direct-child forests; observe settlement before reporting success.
 * @param ctx - Actual optional job and subagent providers; no service is installed by this operation.
 * @param agent - Live task Agent, if present.
 * @param id - Durable task identity, including when cold.
 * @param waitMs - Configured bound for job settlement waits.
 * @param signal - Caller and plugin lifetime; accepted cancellation still leaves the task paused.
 * @returns After compliant work settles; failure leaves the durable stop latch set.
 */
export async function stopTaskWork(ctx: Context, agent: Agent | undefined, id: SessionId,
  waitMs: number, signal: AbortSignal): Promise<void> {
  const failures: unknown[] = []
  const jobs = ctx.get('jobs')
  const owned = jobs?.list(id).filter(job => job.owner === id && ['running', 'stopping'].includes(job.status)) ?? []
  // A collected settlement cannot enqueue a background-result wake after the stop completes.
  const waits = jobs === undefined ? [] : owned.map(job => jobs.wait(job.id, waitMs, id, signal))
  const settled = Promise.allSettled(waits)
  agent?.cancel({ kind: 'hook', reason: 'Genesis task stop' })
  if (jobs !== undefined) for (const job of owned) {
    try { jobs.kill(job.id, id, 'Genesis task stop') } catch (error) { failures.push(error) }
  }
  const subagents = ctx.get('subagents')
  if (agent !== undefined && subagents !== undefined) {
    try {
      const children = await subagents.listChildren(id, signal)
      await subagents.drainChildren(agent, children.map(child => child.id))
    } catch (error) { failures.push(error) }
  }
  // Child completion can have queued input while its handles were being released.
  agent?.cancel({ kind: 'hook', reason: 'Genesis task stop' })
  await agent?.whenIdle()
  for (const result of await settled) {
    if (result.status === 'rejected') failures.push(result.reason)
    else if (['running', 'stopping'].includes(result.value.status)) failures.push(new GenesisError('invalid-state', 'A task job did not stop before taskStopWaitMs. Inspect it and retry stop.'))
  }
  signal.throwIfAborted()
  if (failures.length > 0) throw new GenesisError('invalid-state', 'Task remains paused; some background work has no confirmed stop. Inspect the task and retry stop.',
    { cause: new AggregateError(failures, 'Task stop did not settle') })
  const remaining = await taskActivity(ctx, id)
  if (remaining.some(item => item.count > 0)) throw new GenesisError('invalid-state', 'Task remains paused with active work. Inspect its activity before resuming.')
}
