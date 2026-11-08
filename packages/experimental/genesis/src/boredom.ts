/** Online engagement accounting, independent of social fulfillment and loneliness. @module */
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { LifeCore } from './core.ts'
import { statusFailure } from './status-error.ts'

/** Deployment-selected engineering time scales, not psychological measurements. */
export const boredomSettingsSchema = z.strictObject({
  riseHalfLifeMs: z.number().min(1000).max(31536000000),
  fallHalfLifeMs: z.number().min(1000).max(31536000000),
})
/** Bounded online engagement state; resting excludes sleep and stopped-process time. */
export const boredomStateSchema = boredomSettingsSchema.extend({ level: z.number().min(0).max(1),
  mode: z.enum(['idle', 'engaged', 'resting']) })
/** Current boredom with explicit activity ownership and evolution settings. */
export type BoredomState = z.infer<typeof boredomStateSchema>

/**
 * Evolve toward boredom while idle and toward engagement while occupied; resting freezes it.
 * @param state - Validated anchor.
 * @param elapsed - Nonnegative sensitivity-scaled online milliseconds.
 * @returns Detached state; splitting an interval preserves the result.
 */
export function evolveBoredom(state: BoredomState, elapsed: number): BoredomState {
  if (state.mode === 'resting') return { ...state }
  const target = state.mode === 'idle' ? 1 : 0
  const halfLife = state.mode === 'idle' ? state.riseHalfLifeMs : state.fallHalfLifeMs
  return { ...state, level: target + (state.level - target) * 2 ** (-Math.max(0, elapsed) / halfLife) }
}

/**
 * Account for real conversation and exploration activity without model calls or foreground waits.
 * @param ctx - Owner of subscriptions and shutdown.
 * @param core - Durable affect owner retained through drain.
 * @param participates - Character selection excluding ordinary task presets.
 */
export function installBoredom(ctx: Context, core: LifeCore, participates: (agent: Agent | undefined) => boolean): void {
  let pending = Promise.resolve()
  let stopped = false
  let failed = false
  const refresh = () => {
    if (stopped || failed) return
    pending = pending.then(async () => {
      if (stopped || failed) return
      const resting = ctx.get('genesisSleep')?.autonomousAllowed() === false
      const engaged = ctx.agents.list().some(agent => participates(agent) && !core.isSpontaneitySession(agent.id)
        && agent.status === 'running') || ctx.get('genesisSpontaneity')?.isExploring() === true
      await core.setBoredomMode(resting ? 'resting' : engaged ? 'engaged' : 'idle')
    }).catch((error: unknown) => {
      failed = true
      ctx.logger.error(`Genesis engagement accounting stopped. Inspect life storage before reloading. ${statusFailure(error).message}`)
    })
  }
  ctx.on('agent/status', refresh, { global: true })
  ctx.on('agent/disposed', refresh, { global: true })
  ctx.inject(['genesisSleep'], (child) => { child.effect(() => ctx.genesisSleep.onTransition(refresh)); refresh() })
  ctx.effect(() => async () => { stopped = true; await pending })
  refresh()
}
