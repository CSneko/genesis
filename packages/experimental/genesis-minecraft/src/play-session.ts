/** A connection-owned Life conversation for playing without an open chat window. @module */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-workspace'

/**
 * Create a visible workspace conversation using the configured Life preset and default chat model.
 * @param ctx - Connection owner, independent of an initiating chat.
 * @param preset - Validated Life preset.
 * @param directory - Operator-configured absolute workspace directory.
 * @param signal - Cancels creation and attachment before publication to the connection.
 * @returns An owned handle; the caller disposes it when the connection ends. History remains persisted.
 */
export async function createPlaySession(ctx: Context, preset: string, directory: string, signal: AbortSignal): Promise<AgentHandle> {
  signal.throwIfAborted()
  const workspace = await ctx.workspaceRegistry.create(directory)
  signal.throwIfAborted()
  const selection = ctx.agentDefaultModel.currentSelection()
  const handle = await ctx.agents.withoutInitiator(() => ctx.agents.create({
    sessionId: SessionId(`minecraft-${randomUUID()}`), signal,
    agentOptions: selection, meta: { cwd: workspace.path, agentPreset: preset },
    setup: async (child) => {
      await ctx.agentPresets.mount(child, preset)
    },
  }))
  try {
    signal.throwIfAborted()
    await workspace.attachSession(handle.agent.session.id)
    signal.throwIfAborted()
    return handle
  } catch (error) { await handle.dispose(); throw error }
}
