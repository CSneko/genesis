/** Bounded mining and pickup; inventory updates establish acquisition independently of digging animations. @module */
import type { Bot } from 'mineflayer'
import navigation from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import { digTarget } from './dig.ts'
import { failure } from './settings.ts'
import type { MinecraftAction, RuntimeConfig } from './runtime.ts'
import type { MinecraftCollectionProgress } from './types.ts'

/**
 * Count an exact Minecraft item across every inventory stack.
 * @param bot - Connected inventory owner.
 * @param item - Exact registry item name.
 * @returns Current item count, including stacks omitted from bounded observations.
 */
export function inventoryCount(bot: Bot, item: string): number {
  return bot.inventory.items().filter(stack => stack.name === item).reduce((count, stack) => count + stack.count, 0)
}

function changed(bot: Bot, item: string, before: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { bot.removeListener('itemDrop', update); bot.removeListener('entityMoved', update); bot.inventory.removeListener('updateSlot', update); signal.removeEventListener('abort', abort) }
    const update = () => { cleanup(); resolve() }
    const abort = () => { cleanup(); reject(signal.reason instanceof Error ? signal.reason : failure('collection-interrupted')) }
    bot.on('itemDrop', update); bot.on('entityMoved', update); bot.inventory.on('updateSlot', update); signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else if (inventoryCount(bot, item) > before) update()
  })
}

async function pickup(bot: Bot, item: string, before: number, anchor: Vec3, config: RuntimeConfig, signal: AbortSignal) {
  const deadline = AbortSignal.timeout(config.collectPickupTimeoutMs)
  const owned = AbortSignal.any([signal, deadline])
  const stop = () => { bot.pathfinder.setGoal(null); bot.clearControlStates() }
  owned.addEventListener('abort', stop, { once: true })
  const attempted = new Set<number>()
  try {
    while (inventoryCount(bot, item) <= before) {
      owned.throwIfAborted()
      const drop = Object.values(bot.entities).filter(entity => entity.getDroppedItem()?.name === item
        && entity.position.distanceTo(anchor) <= config.collectPickupRadius && !attempted.has(entity.id))
        .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0]
      if (drop === undefined) { await changed(bot, item, before, owned); continue }
      attempted.add(drop.id)
      try { await bot.pathfinder.goto(new navigation.goals.GoalFollow(drop, 0)) }
      catch (_error: unknown) { owned.throwIfAborted(); continue }
      owned.throwIfAborted()
      if (inventoryCount(bot, item) <= before) await changed(bot, item, before, owned)
    }
  } catch (error) {
    signal.throwIfAborted()
    if (deadline.aborted) throw failure('collection-pickup-timeout', { cause: error })
    throw error
  } finally { owned.removeEventListener('abort', stop) }
}

/**
 * Mine matching known blocks and approach their drops until the inventory gains the requested count.
 * @param bot - Connected bot with exclusive skill control.
 * @param action - Exact output item, block hint and requested inventory gain; coordinates optionally restrict the source.
 * @param config - Search, mining, pickup and action budgets.
 * @param progress - Mutable evidence owned by the runtime, retained even after partial failure.
 * @param signal - Skill cancellation; the runtime also stops active movement and digging.
 * @returns After verified inventory acquisition; missing sources, pickup failure or exhausted bounds reject without erasing partial gains.
 */
export async function collectBlocks(bot: Bot, action: MinecraftAction, config: RuntimeConfig,
  progress: MinecraftCollectionProgress, signal: AbortSignal): Promise<void> {
  if (action.item === undefined || action.blockName === undefined || bot.registry.itemsByName[action.item] === undefined) {
    throw failure('collection-item-and-block-required')
  }
  if ((action.x !== undefined || action.y !== undefined || action.z !== undefined)
    && (action.x === undefined || action.y === undefined || action.z === undefined)) throw failure('target-required')
  const anchor = action.x === undefined || action.y === undefined || action.z === undefined
    ? bot.entity.position.clone() : new Vec3(action.x, action.y, action.z)
  try {
    while (progress.minedBlocks < config.collectBlockLimit) {
      signal.throwIfAborted()
      progress.current = inventoryCount(bot, progress.item); progress.gained = progress.current - progress.before
      if (progress.gained >= progress.requested) return
      const before = progress.current
      const target = await digTarget(bot, { ...action, x: anchor.x, y: anchor.y, z: anchor.z }, config, signal)
      progress.minedBlocks++
      await pickup(bot, progress.item, before, new Vec3(target.position.x, target.position.y, target.position.z), config, signal)
    }
    if (inventoryCount(bot, progress.item) - progress.before < progress.requested) throw failure('collection-block-limit')
  } finally { progress.current = inventoryCount(bot, progress.item); progress.gained = progress.current - progress.before }
}
