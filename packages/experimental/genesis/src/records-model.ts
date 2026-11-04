/** Versioned writing records, independently stored from life facts and candidate memories. @module */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { LifeId } from './model.ts'

/** Stable identity of one authored text; also identifies a repeated creation request. */
export type WritingId = Branded<'GenesisWritingId'>
/** Stable category identity, independent of its editable display name. */
export type WritingTypeId = Branded<'GenesisWritingTypeId'>
/** Adapter-namespaced identity of an imported writing, independent of migration Session or call. */
export type WritingImportId = Branded<'GenesisWritingImportId'>

/** Record lookup parsed at tool and Remote inputs. */
export const writingIdSchema = z.string().regex(/^[a-f0-9]{64}$/).transform(brandString<WritingId>)
/** Directory-safe type identity parsed at durable and external inputs. */
export const writingTypeIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).transform(brandString<WritingTypeId>)
const timestamp = z.iso.datetime()
const relativePath = z.string().regex(/^[a-z][a-z0-9-]{0,63}\/\d{4}\/\d{2}\/\d{8}T\d{9}Z_[a-f0-9]{64}\.md$/)
const typeSchema = z.strictObject({ id: writingTypeIdSchema, name: z.string().min(1), enabled: z.boolean(),
  revision: z.number().int().positive() })
const entrySchema = z.strictObject({
  id: writingIdSchema, title: z.string().min(1), content: z.string().min(1), typeId: writingTypeIdSchema,
  createdAt: timestamp, updatedAt: timestamp, revision: z.number().int().positive(), fileName: relativePath,
  source: z.strictObject({ sessionId: z.string().min(1).transform(brandString<SessionId>),
    callId: z.string().min(1).transform(brandString<ToolCallId>) }),
  updatedBy: z.enum(['agent', 'operator']),
})
const stateSchema = z.strictObject({
  schemaVersion: z.literal(1), lifeId: z.string().min(1).transform(brandString<LifeId>), root: z.string().min(1),
  revision: z.number().int().positive(), types: z.array(typeSchema), entries: z.array(entrySchema),
  receipts: z.array(z.strictObject({ id: writingIdSchema, fingerprint: z.string().regex(/^[a-f0-9]{64}$/) })),
  retiredPaths: z.array(relativePath), pendingFiles: z.boolean(),
})

/** Authoritative state; generated Markdown files are recoverable projections of this domain. */
export const writingsDomain = defineDomain({ name: 'genesis_writings', version: 1,
  tables: { states: domainTable<'catalog', z.infer<typeof stateSchema>>(stateSchema) },
})
/** Durable current records, creation receipts and pending file recovery. */
export type WritingState = z.infer<typeof stateSchema>
/** A title/body/type with immutable creation attribution and revisioned operator edits. */
export type WritingEntry = z.infer<typeof entrySchema>
/** Operator-managed category; disabling retains all historical records. */
export type WritingType = z.infer<typeof typeSchema>
/** Authored fields accepted from the model or operator editor. */
export interface WritingDraft { title: string; content: string; typeId: WritingTypeId }
/** Stable creation or migration receipt; deleted records retain only their identity and status. */
export interface WritingReceipt { id: WritingId; status: 'saved' | 'already-deleted'; createdAt?: string; fileName?: string }
/** Search filters; empty text browses, and time filters use inclusive ISO timestamps. */
export interface WritingQuery { text?: string; typeId?: WritingTypeId; after?: string; before?: string; offset?: number }
/** One bounded search match; content may be an excerpt, with full text available by id. */
export interface WritingMatch extends Omit<WritingEntry, 'source' | 'content'> {
  content: string
  truncated: boolean
  matchedFields: Array<'title' | 'content'>
}
/** Bounded, newest-first search page; null nextOffset means the selection is exhausted. */
export interface WritingSearch { items: WritingMatch[]; total: number; nextOffset: number | null; revision: number }
/** Bounded read chunk; offsets count UTF-16 code units and include the complete JSON response budget. */
export interface WritingRead extends Omit<WritingEntry, 'content'> { content: string; offset: number; nextOffset: number | null }
/** Operator-visible category catalog and effective validated limits. */
export interface WritingCatalog {
  types: WritingType[]
  count: number
  revision: number
  limits: { titleChars: number; contentChars: number; typeChars: number }
}
