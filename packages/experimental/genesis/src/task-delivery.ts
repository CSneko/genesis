/**
 * Stable task messages and durability confirmation, adapted from dsh-superagent AgentDelivery.
 * Copyright (c) 2026 DeepSeek Harness Team. MIT; see ../LICENSE.superagent.
 * @module
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { MessageId, freezeMessage, boundContextSummary } from '@deepseek-ai/dsh-llm'
import type { TaskSubmission } from './task-queue.ts'
import { GenesisError } from './error.ts'
import type {} from './task-source.ts'

/**
 * Confirm a Session-specific durability barrier before acknowledging task delivery.
 * @param ctx - Session store with its persistence listener mounted.
 * @param agent - Live receiving Agent.
 * @returns After the Session writer acknowledges; failure leaves delivery pending.
 */
export async function flushTask(ctx: Context, agent: Agent): Promise<void> {
  try {
    if (!await ctx.sessions.flush(agent.session)) throw new GenesisError('storage', 'Task Session persistence did not acknowledge delivery.')
  } catch (error) {
    throw new GenesisError('storage', 'Task delivery is not confirmed durable. Retry identical work with the same request_id after checking Session storage.', { cause: error })
  }
}

/**
 * Deliver one assignment using the same message ID on every retry.
 * Projection evidence includes inbox admission, so canceled or consumed input is never resent.
 * @param ctx - Current registries and persistence.
 * @param agent - Receiving ordinary Agent, already configured and attached to its workspace.
 * @param row - Original persisted requester, text and fingerprint.
 * @param signal - Cancellation checked before enqueue; admitted input still receives a durability check.
 * @param authorize - Recheck actual permission ceilings immediately before enqueue.
 * @returns After delivery durability; does not report task completion.
 */
export async function deliverTask(ctx: Context, agent: Agent, row: TaskSubmission, signal: AbortSignal,
  authorize: () => void): Promise<void> {
  signal.throwIfAborted()
  if (ctx.agents.get(agent.id) !== agent) throw new GenesisError('invalid-state', 'Task Agent was disposed. Retry the same request after inspecting its Session.')
  const state = ctx.genesisSessionEvidence.taskOf(agent.session)
  if (state === undefined) throw new GenesisError('invalid-state', 'Task projection is unavailable. Reload the task integration.')
  authorize()
  if (state.assignment !== null) {
    if (state.assignment.fingerprint !== row.fingerprint) throw new GenesisError('invalid-source', 'Task Session already contains different work. Inspect it before retrying.')
  } else {
    if (row.prompt === null) throw new GenesisError('invalid-state', 'Acknowledged task has no Session receipt. Restore verified storage; do not resend it.')
    const message = freezeMessage({ id: MessageId(`genesis-task:${row.sessionId}`), role: 'user',
      source: { kind: 'genesis-task', requester: row.requester, requestId: row.requestId, fingerprint: row.fingerprint,
        form: 'notice', summary: boundContextSummary(`Task assigned by Life: ${row.prompt}`) },
      content: [{ type: 'text', text: row.prompt }] })
    agent.followup(message)
  }
  await flushTask(ctx, agent)
}
