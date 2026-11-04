/** Main-hand item activation and bounded block/entity interaction. @module */
import { setTimeout } from 'node:timers/promises'
import type { Bot } from 'mineflayer'
import navigation from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import type { MinecraftAction, RuntimeConfig } from './runtime.ts'
import { selectBlocks, withinReach } from './blocks.ts'
import { failure } from './settings.ts'

/** Deployment bounds for held-item activation; server effects require subsequent observation. */
export interface UseConfig {
  /** Default milliseconds to hold item activation before releasing it. */
  useHoldMs: number
  /** Maximum requested item activation duration in milliseconds. */
  useHoldLimitMs: number
}
type UseSpec = { target: 'item' | 'block' | 'entity'; durationMs: number }
function resolveUse(action: MinecraftAction, config: UseConfig): UseSpec {
  const block = action.blockName !== undefined || action.blockProperties !== undefined || action.x !== undefined
    || action.y !== undefined || action.z !== undefined || action.visible !== undefined || action.withinReach !== undefined
  if (block && action.entityId !== undefined) throw failure('use-target-ambiguous')
  const target = action.useTarget ?? (block ? 'block' : action.entityId === undefined ? 'item' : 'entity')
  if ((target !== 'block' && block) || (target !== 'entity' && action.entityId !== undefined)) throw failure('use-target-ambiguous')
  if (target === 'block' && !block) throw failure('target-required')
  const durationMs = action.durationMs ?? config.useHoldMs
  if (durationMs > config.useHoldLimitMs) throw failure('use-duration-limit', {
    guidance: `Request durationMs at most ${config.useHoldLimitMs}; inspect the result before another use.`,
  })
  return { target, durationMs }
}

/**
 * Equip an optional item and use it in air, or interact with a fresh nearby block/entity.
 * @param bot - Connected bot with exclusive skill control.
 * @param action - Explicit target type or one inferred from block selectors/entityId; no selectors uses the held item.
 * @param config - Reach, search and item-hold limits.
 * @param signal - Caller cancellation; releasing held activation is guaranteed on interruption.
 * @returns After activation/release or interaction dispatch; completion does not assert a door, container or entity changed.
 */
export async function useTarget(bot: Bot, action: MinecraftAction, config: RuntimeConfig, signal: AbortSignal): Promise<void> {
  const spec = resolveUse(action, config)
  signal.throwIfAborted()
  if (action.item !== undefined) {
    const item = bot.inventory.items().find(stack => stack.name === action.item)
    if (item === undefined) throw failure('item-missing')
    await bot.equip(item, 'hand'); signal.throwIfAborted()
  }
  switch (spec.target) {
    case 'item':
      if (bot.heldItem === null) throw failure('use-held-item-required')
      bot.activateItem()
      try { await setTimeout(spec.durationMs, undefined, { signal }) } finally { bot.deactivateItem() }
      return
    case 'entity': {
      const entity = bot.entities[action.entityId ?? -1]
      if (entity === undefined || entity.position.distanceTo(bot.entity.position) > 3) throw failure('entity-unreachable')
      await bot.activateEntity(entity)
      signal.throwIfAborted()
      return
    }
    case 'block': {
      if (bot.entity.height !== 1.8 && bot.entity.height !== 1.5) throw failure('use-posture-unsupported')
      const block = selectBlocks(bot, action, config, false)[0]
      if (block === undefined) throw failure('block-not-found')
      const near = () => withinReach(bot, block, config.digReach, false)
      if (!near()) await bot.pathfinder.goto(new navigation.goals.GoalLookAtBlock(block.position, bot.world, {
        reach: config.digReach, entityHeight: bot.entity.height === 1.5 ? 1.27 : 1.62,
      }))
      signal.throwIfAborted()
      const current = bot.blockAt(block.position)
      if (current === null || current.stateId !== block.stateId || !near()) throw failure('block-changed-or-unreachable')
      const faces = { up: new Vec3(0, 1, 0), down: new Vec3(0, -1, 0), north: new Vec3(0, 0, -1),
        south: new Vec3(0, 0, 1), east: new Vec3(1, 0, 0), west: new Vec3(-1, 0, 0) }
      await bot.activateBlock(current, faces[action.face]); signal.throwIfAborted()
    }
  }
}
