/** Bounded target matching and reach-aware mining using the existing pathfinder and raycast digging. @module */
import type { Bot } from 'mineflayer'
import navigation from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import type { MinecraftAction, RuntimeConfig } from './runtime.ts'
import { failure } from './settings.ts'
import { selectBlocks, withinReach } from './blocks.ts'

/** Actual matched block reported after confirmed digging. */
export type MinecraftDigTarget = {
  name: string
  position: { x: number; y: number; z: number }
}

/**
 * Select an exact-coordinate block or rank bounded nearby matches, approach a visible face, then dig it.
 * @param bot - Connected bot whose controls are owned by this skill.
 * @param action - Name and property hints; supplied coordinates rank matches, otherwise distance from the bot does.
 * @param config - Operator deployment limits for search, candidate count and reach.
 * @param signal - Skill cancellation; callers stop the pathfinder and digging when it aborts.
 * @returns The block after a client-known change; acquisition requires inventory evidence. Never mines intervening blocks.
 */
export async function digTarget(bot: Bot, action: MinecraftAction, config: RuntimeConfig,
  signal: AbortSignal): Promise<MinecraftDigTarget> {
  const assisted = action.blockName !== undefined || action.blockProperties !== undefined
    || action.visible !== undefined || action.withinReach !== undefined
  if (!assisted && action.x === undefined && action.y === undefined && action.z === undefined) throw failure('target-required')
  const candidates = selectBlocks(bot, action, config, true)
  if (candidates.length === 0) throw failure('block-not-found')
  // Vanilla standing and crouching player eye heights since Java 1.14.
  const eyeHeight = () => {
    if (bot.entity.height === 1.8) return 1.62
    if (bot.entity.height === 1.5) return 1.27
    throw failure('mining-posture-unsupported')
  }
  const reachable = (block: NonNullable<ReturnType<Bot['blockAt']>>) => withinReach(bot, block, config.digReach, true)
  for (const candidate of candidates) {
    signal.throwIfAborted()
    if (!reachable(candidate)) {
      try { await bot.pathfinder.goto(new navigation.goals.GoalLookAtBlock(candidate.position, bot.world, {
        reach: config.digReach, entityHeight: eyeHeight(),
      })) } catch (error) { signal.throwIfAborted(); if (!assisted) throw error; continue }
    }
    signal.throwIfAborted()
    const current = bot.blockAt(candidate.position)
    if (current === null || current.stateId !== candidate.stateId || !reachable(current)) {
      if (!assisted) throw failure('block-changed-or-unreachable')
      continue
    }
    if (current.shapes.length > 0) {
      // Test collision-face centers so aiming at a partial block's empty center cannot start an air swing.
      const eye = bot.entity.position.offset(0, eyeHeight(), 0)
      const points = current.shapes.flatMap((shape) => {
        const [x0, y0, z0, x1, y1, z1] = shape
        return [
          new Vec3(x0, (y0 + y1) / 2, (z0 + z1) / 2), new Vec3(x1, (y0 + y1) / 2, (z0 + z1) / 2),
          new Vec3((x0 + x1) / 2, y0, (z0 + z1) / 2), new Vec3((x0 + x1) / 2, y1, (z0 + z1) / 2),
          new Vec3((x0 + x1) / 2, (y0 + y1) / 2, z0), new Vec3((x0 + x1) / 2, (y0 + y1) / 2, z1),
        ].map(point => current.position.plus(point))
      }).sort((a, b) => a.distanceTo(eye) - b.distanceTo(eye))
      let aimed = false
      for (const point of points) {
        const hit = bot.world.raycast(eye, point.minus(eye).normalize(), config.digReach)
        if (hit === null) continue
        await bot.lookAt(hit.intersect, true)
        signal.throwIfAborted()
        const cursor = bot.blockAtCursor(config.digReach)
        if (cursor !== null && cursor.position.equals(current.position) && cursor.stateId === current.stateId) { aimed = true; break }
      }
      if (!aimed) {
        if (!assisted) throw failure('dig-aim-mismatch')
        continue
      }
    }
    const ready = bot.blockAt(current.position)
    if (ready === null || ready.stateId !== current.stateId) throw failure('block-changed-or-unreachable')
    await bot.dig(ready, true, 'raycast')
    signal.throwIfAborted()
    const after = bot.blockAt(current.position)
    if (after === null || after.stateId === current.stateId) throw failure('dig-not-confirmed')
    return { name: current.name, position: { x: current.position.x, y: current.position.y, z: current.position.z } }
  }
  throw failure('block-unreachable')
}
