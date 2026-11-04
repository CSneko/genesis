/** Authenticated operator views and controls for persistent life deliberation. @module */
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { Config } from './config.ts'
import type { AgencyStatus } from './status-types.ts'
import type { LifeGoalId } from './agency-state.ts'
import { motivationStrength } from './agency-state.ts'
import { GenesisError } from './error.ts'
import { statusFailure } from './status-error.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { genesisAgency: GenesisAgencyGateway }
}

/** Bounded agency inspection and explicit operator actions; no completion or permission mutation. */
export class GenesisAgencyGateway extends TypertRemoteService {
  static inject = ['genesis', 'agents']
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()

  /**
   * @param ctx - Persistent life and live Agent services.
   * @param options - Deployment limits and character preset selection.
   */
  constructor(ctx: Context, private readonly options: { config: Config; lifeMode: (agent: Agent | undefined) => boolean }) {
    super(ctx, 'genesisAgency')
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.operations) })
  }

  private async operation<T>(signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const owned = AbortSignal.any([signal, this.lifetime.signal])
    owned.throwIfAborted()
    const task = run(owned)
    this.operations.add(task)
    try { return await task } catch (error) { throw statusFailure(error) } finally { this.operations.delete(task) }
  }

  /**
   * Read current motivations, goals and recent decisions under complete response and item limits.
   * @param signal - Caller cancellation; previous UI samples may be retained on failure.
   * @returns Detached state with explicit omission counts and eligible live character Sessions.
   */
  @Remote('inspect')
  async inspect(signal: AbortSignal): Promise<AgencyStatus> {
    return this.operation(signal, async () => {
      const state = await this.ctx.genesis.snapshot()
      const { config } = this.options
      const settings = config.deliberation
      const agency = state.agency
      const sampledAt = new Date().toISOString()
      const motivations = (agency?.motivations ?? []).map(item => ({ ...item,
        currentStrength: settings === undefined ? null : motivationStrength(item, sampledAt, settings.motivationHalfLifeMs) }))
      const goals = [...(agency?.goals ?? [])].sort((a, b) => b.priority - a.priority)
      const decisions = [...(agency?.decisions ?? [])].reverse()
      const result: AgencyStatus = { enabled: settings !== undefined, sampledAt, revision: agency?.revision ?? 0,
        motivations: [], goals: [], decisions: [], sessions: [],
        omitted: { motivations: motivations.length, goals: goals.length, decisions: decisions.length, sessions: 0 } }
      const fits = () => JSON.stringify(result).length <= config.resultChars
      const sessions = this.ctx.agents.list().filter(agent => config.awakening === undefined || this.options.lifeMode(agent))
      result.omitted.sessions = sessions.length
      for (const agent of sessions.slice(0, config.queryLimit)) {
        result.sessions.push({ id: agent.session.id, idle: agent.status === 'idle' })
        if (!fits()) { result.sessions.pop(); break }
        result.omitted.sessions--
      }
      for (const item of motivations.slice(0, config.queryLimit)) {
        result.motivations.push(item)
        if (!fits()) { result.motivations.pop(); break }
        result.omitted.motivations--
      }
      for (const goal of goals.slice(0, config.queryLimit)) {
        result.goals.push({ ...goal, history: goal.history.slice(-config.queryLimit),
          historyOmitted: Math.max(0, goal.history.length - config.queryLimit) })
        if (!fits()) { result.goals.pop(); break }
        result.omitted.goals--
      }
      for (const item of decisions.slice(0, config.queryLimit)) {
        result.decisions.push(item)
        if (!fits()) { result.decisions.pop(); break }
        result.omitted.decisions--
      }
      if (!fits()) throw new GenesisError('capacity', 'Agency status exceeds resultChars. Increase the response budget.')
      return result
    })
  }

  /**
   * Pause, resume or abandon a life goal with a visible operator reason; terminal goals cannot reopen.
   * @param id - Stable life goal identifier.
   * @param status - Allowed operator transition; completion is deliberately excluded.
   * @param revision - Displayed agency revision; concurrent changes are refused.
   * @param reason - Human explanation retained in life history.
   * @param signal - Caller cancellation; an admitted commit still drains.
   * @returns After the sourced state transition commits.
   */
  @Remote('setGoalStatus')
  async setGoalStatus(id: LifeGoalId, status: 'active' | 'paused' | 'abandoned', revision: number,
    reason: string, signal: AbortSignal): Promise<void> {
    return this.operation(signal, async () => {
      if (this.options.config.deliberation === undefined) throw new GenesisError('invalid-state', 'Enable deliberation before editing life goals.')
      await this.ctx.genesis.setLifeGoalStatus(id, status, revision, reason)
    })
  }

  /**
   * Ask the main model in an idle character conversation to consider its plans and choose its next action.
   * @param sessionId - Live idle Session selected explicitly by the operator.
   * @param signal - Caller cancellation; committed choices remain auditable.
   * @returns After the planning opportunity is reserved and enqueued without an auxiliary choice.
   */
  @Remote('deliberate')
  async deliberate(sessionId: SessionId, signal: AbortSignal): Promise<void> {
    return this.operation(signal, async (signal) => {
      const engine = this.ctx.get('genesisDeliberation')
      const agent = this.ctx.agents.list().find(item => item.session.id === sessionId)
      if (engine === undefined || agent === undefined) throw new GenesisError('invalid-state', 'Choose a live Life conversation with deliberation enabled.')
      const state = await this.ctx.genesis.snapshot()
      const event = state.events.at(-1)
      if (event === undefined) throw new GenesisError('invalid-state', 'Life event evidence is unavailable.')
      await engine.deliberate(agent, { key: `operator:${randomUUID()}`, sourceEventId: event.id }, signal)
    })
  }
}
