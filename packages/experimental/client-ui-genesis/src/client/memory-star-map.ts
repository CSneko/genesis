/** Deterministic category clusters and perspective coordinates for the current memory page. @module */
import type { LifeMemory } from '@deepseek-ai/dsh-experimental-genesis/types'

/** Existing memory categories, in their orbital order. */
export const memoryClusters = ['episodic', 'semantic', 'self', 'procedural'] as const

/** A point in the memory scene, with an optional source memory. */
export interface MemoryStar {
  id: string
  category: LifeMemory['category']
  x: number
  y: number
  z: number
  memory?: LifeMemory
}

/**
 * Arrange only supplied records around their category hubs, without inferred relationships.
 * @param memories - One bounded browser page in its existing search order.
 * @returns Hubs followed by their source-backed memory nodes.
 */
export function memoryStars(memories: readonly LifeMemory[]): MemoryStar[] {
  return memoryClusters.flatMap((category, cluster) => {
    const angle = cluster * Math.PI / 2 + Math.PI / 4
    const hub = { id: category, category, x: Math.cos(angle) * 1.65, y: cluster % 2 === 0 ? -0.35 : 0.35, z: Math.sin(angle) * 1.65 }
    const entries = memories.filter(memory => memory.category === category)
    return [hub, ...entries.map((memory, index) => {
      const azimuth = index * Math.PI * (3 - Math.sqrt(5))
      const vertical = 1 - 2 * (index + 0.5) / entries.length
      const radius = Math.sqrt(1 - vertical * vertical) * 0.85
      return { id: memory.id, category, memory, x: hub.x + Math.cos(azimuth) * radius,
        y: hub.y + vertical * 0.85, z: hub.z + Math.sin(azimuth) * radius }
    })]
  })
}

/**
 * Rotate a point in three dimensions and project it onto the SVG viewport.
 * @param point - Scene point.
 * @param yaw - Horizontal rotation in radians.
 * @param pitch - Vertical rotation in radians.
 * @param zoom - User-selected magnification.
 * @returns Screen coordinates, depth and perspective size.
 */
export function projectMemoryStar(point: { x: number; y: number; z: number }, yaw: number, pitch: number, zoom: number) {
  const x = point.x * Math.cos(yaw) - point.z * Math.sin(yaw)
  const depth = point.x * Math.sin(yaw) + point.z * Math.cos(yaw)
  const y = point.y * Math.cos(pitch) - depth * Math.sin(pitch)
  const z = point.y * Math.sin(pitch) + depth * Math.cos(pitch)
  const scale = 5 / (6 + z)
  return { x: 400 + x * 113 * scale * zoom, y: 240 + y * 113 * scale * zoom, z, scale }
}
