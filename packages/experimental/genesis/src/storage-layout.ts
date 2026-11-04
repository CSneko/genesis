/** Content-addressed life records and the atomic manifest shared by storage and backups. @module */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'

/** SHA-256 identifier of one immutable life component. */
export type LifeRecordKey = Branded<'GenesisLifeRecordKey'>

/** Independent record directories; values are validated again after life reconstruction. */
export const recordTableSchema = z.enum(['identity', 'events', 'memories_episodic', 'memories_semantic',
  'memories_self', 'memories_procedural', 'embeddings', 'memory_history', 'memory_revisions', 'growth', 'capabilities', 'projections', 'indexes'])
/** JSON values accepted at the component storage parser. */
export const recordValueSchema = z.json()
/** One content-addressed data component or immutable index page. */
export const recordRefSchema = z.strictObject({ table: recordTableSchema,
  key: z.string().regex(/^[a-f0-9]{64}$/).transform(brandString<LifeRecordKey>) })
/** References preserve source order; legacy flat manifests remain readable for migration. */
export const manifestSchema = z.discriminatedUnion('format', [
  z.strictObject({ format: z.literal('genesis-split-v1'), records: z.array(recordRefSchema) }),
  z.strictObject({ format: z.literal('genesis-tree-v2'), records: z.array(recordRefSchema).max(4096) }),
])
/** Immutable index pages contain only ordered references, never dialogue or vectors. */
export const indexPageSchema = z.strictObject({ format: z.literal('genesis-index-v1'), records: z.array(recordRefSchema).min(1).max(4096) })
/** An ordered reference used by commit retention and backup verification. */
export type LifeRecordReference = z.infer<typeof recordRefSchema>
/** Committed references; missing or changed records make the whole life unreadable. */
export type LifeManifest = z.infer<typeof manifestSchema>
/** One immutable record to publish before its manifest. */
export interface LifeRecord {
  table: z.infer<typeof recordTableSchema>
  key: LifeRecordKey
  value: z.infer<typeof recordValueSchema>
}
/**
 * Hash the exact JSON value used by both storage media.
 * @param value - JSON-serializable life component.
 * @returns SHA-256 content key.
 */
export function recordHash(value: unknown): LifeRecordKey {
  return brandString<LifeRecordKey>(createHash('sha256').update(JSON.stringify(value)).digest('hex'))
}
