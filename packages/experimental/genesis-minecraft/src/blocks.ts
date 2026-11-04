/** Bounded condition-based block selection shared by observation and mining. @module */
import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { z } from 'zod'
import { failure } from './settings.ts'
import type { MinecraftBlockObservation } from './types.ts'

/** Model and script selectors; coordinates without conditions select one exact block. */
export const blockQuerySchema = z.strictObject({
  blockName: z.string().trim().min(1).max(100).regex(/^(?:minecraft:)?[a-z0-9_]+$/u).optional(),
  blockProperties: z.record(z.string().min(1).max(100), z.union([z.string().max(100), z.boolean(), z.number()]))
    .refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 16).optional(),
  x: z.number().optional(), y: z.number().optional(), z: z.number().optional(),
  matchRadius: z.number().min(1).max(32).optional(),
  maxDistance: z.number().min(1).max(32).optional(),
  visible: z.boolean().optional(), withinReach: z.boolean().optional(),
  limit: z.number().int().min(1).max(64).optional(),
})
/** Parsed selection conditions; missing coordinates use the bot as the search anchor. */
export type MinecraftBlockQuery = z.infer<typeof blockQuerySchema>
/** Deployment bounds for block searches and current reach checks. */
export interface BlockQueryConfig {
  digSearchRadius: number
  digCandidates: number
  digReach: number
}
type Block = NonNullable<ReturnType<Bot['blockAt']>>

/**
 * Check current visibility and reach, with optional mining eligibility.
 * @param bot - Connected player with a supported standing or crouching posture.
 * @param block - Client-known block.
 * @param reach - Deployment maximum eye-to-center distance.
 * @param diggableOnly - Mining/query callers require canDigBlock; interactions only require visibility and physical reach.
 * @returns Current visibility and reach, not a promise that a path exists.
 */
export function withinReach(bot: Bot, block: Block, reach: number, diggableOnly: boolean): boolean {
  if (bot.entity.height !== 1.8 && bot.entity.height !== 1.5) return false
  const eyeHeight = bot.entity.height === 1.5 ? 1.27 : 1.62
  return (!diggableOnly || bot.canDigBlock(block)) && bot.canSeeBlock(block)
    && block.position.offset(0.5, 0.5, 0.5).distanceTo(bot.entity.position.offset(0, eyeHeight, 0)) <= reach
}

/**
 * Select loaded blocks by conditions or one exact coordinate, optionally requiring diggability.
 * @param bot - Connected world and current position; unknown chunks are never searched remotely.
 * @param query - Optional name fragment, exact properties, visibility and reach; no coordinates defaults to condition search.
 * @param config - Hard search, candidate and reach limits; smaller query limits apply within them.
 * @param diggableOnly - Mining/query callers require diggable blocks; interaction callers also admit unbreakable blocks.
 * @returns Bounded matches ranked by exact name before fragments, then distance to coordinates or the bot.
 */
export function selectBlocks(bot: Bot, query: MinecraftBlockQuery, config: BlockQueryConfig, diggableOnly: boolean): Block[] {
  const hasCoordinates = query.x !== undefined || query.y !== undefined || query.z !== undefined
  if (hasCoordinates && (query.x === undefined || query.y === undefined || query.z === undefined)) throw failure('target-required')
  const anchor = query.x === undefined || query.y === undefined || query.z === undefined
    ? bot.entity.position.clone() : new Vec3(query.x, query.y, query.z)
  const radius = Math.min(query.maxDistance ?? config.digSearchRadius, config.digSearchRadius)
  const limit = Math.min(query.limit ?? config.digCandidates, config.digCandidates)
  const hint = query.blockName?.replace(/^minecraft:/u, '')
  const conditions = hint !== undefined || query.blockProperties !== undefined
    || query.visible !== undefined || query.withinReach !== undefined
  const exact = hasCoordinates && !conditions
  const score = (block: Block): number => {
    if ((diggableOnly && !block.diggable) || block.name === 'air' || ((!exact || query.maxDistance !== undefined) && block.position.distanceTo(bot.entity.position) > radius)
      || (query.matchRadius !== undefined && block.position.distanceTo(anchor) > query.matchRadius)) return Infinity
    if (hint !== undefined && !block.name.includes(hint)) return Infinity
    if (query.blockProperties !== undefined) {
      const properties = block.getProperties()
      if (Object.entries(query.blockProperties).some(([key, value]) => properties[key] !== value)) return Infinity
    }
    if (query.visible !== undefined && bot.canSeeBlock(block) !== query.visible) return Infinity
    if (query.withinReach !== undefined && withinReach(bot, block, config.digReach, diggableOnly) !== query.withinReach) return Infinity
    return hint === undefined || block.name === hint ? 0 : block.name.endsWith(`_${hint}`) ? 1 : 2
  }
  const positions = exact ? [anchor.floored()]
    : bot.findBlocks({ matching: block => Number.isFinite(score(block)), maxDistance: radius, count: limit, useExtraInfo: true })
  return positions.map(position => bot.blockAt(position))
    .filter((block): block is Block => block !== null && Number.isFinite(score(block)))
    .sort((a, b) => score(a) - score(b) || a.position.distanceTo(anchor) - b.position.distanceTo(anchor)).slice(0, limit)
}

/**
 * Describe one selected block without granting an action or asserting navigability.
 * @param bot - Position and visibility owner.
 * @param block - Selected client-known block.
 * @param reach - Deployment digging reach.
 * @returns Name, coordinates, properties and present visibility/reach evidence.
 */
export function describeBlock(bot: Bot, block: Block, reach: number): MinecraftBlockObservation {
  return { name: block.name, position: { x: block.position.x, y: block.position.y, z: block.position.z },
    stateId: block.stateId, properties: block.getProperties(),
    distance: Math.round(block.position.distanceTo(bot.entity.position) * 10) / 10,
    visible: bot.canSeeBlock(block), withinReach: withinReach(bot, block, reach, true),
  }
}
