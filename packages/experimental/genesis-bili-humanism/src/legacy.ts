/** Bounded, read-only migration input from the pinned upstream v1 ledger. @module */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { z } from 'zod'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'

const noteSchema = z.object({ encounter: z.string(), facts: z.string().default(''), author_view: z.string().default(''),
  inference: z.string().default(''), previous_judgment: z.string().default(''), revision: z.string().default(''),
  missing: z.string(), next_response: z.string().default(''),
  evidence: z.array(z.object({ at: z.number().nonnegative(), claim: z.string(), url: z.url().optional() })) })
const rowSchema = z.object({ id: z.uuid(), reading_id: z.uuid(), created: z.iso.datetime(), body: z.string(), source: z.string() })
const sourceSchema = z.object({ bvid: z.string(), page: z.number().int().positive(), title: z.string(),
  author: z.string(), url: z.url(), route: z.string(), coverage: z.json() })
const labels = { encounter: '遇见与处境', facts: '材料明示', author_view: '作者观点', inference: '我的推测',
  previous_judgment: '先前判断', revision: '认识修正', missing: '覆盖限度与遗漏', next_response: '下一次如何回应' }

/**
 * Read one complete bounded page without changing the upstream ledger or exporting its private media.
 * @param dataDir - Trusted upstream private directory.
 * @param offset - Stable-order record offset, initially zero; repeat from zero after external ledger edits.
 * @param limit - Maximum journals per explicit migration call.
 * @param chars - Complete JSON size limit per source record and its metadata.
 * @returns Complete original writings and continuation; malformed, missing or incompatible ledger data rejects before any import.
 */
export function legacyPage(dataDir: string, offset: number, limit: number, chars: number) {
  const db = new DatabaseSync(join(dataDir, 'ledger.sqlite'), { readOnly: true })
  try {
    db.exec('BEGIN')
    if (db.prepare('PRAGMA user_version').get()?.['user_version'] !== 1) throw new GenesisError('invalid-state', 'Legacy Bilibili ledger version is unsupported. Restore the pinned v1 ledger before migrating.')
    const total = z.number().int().nonnegative().parse(db.prepare('SELECT count(*) AS total FROM notes').get()?.['total'])
    const rows = db.prepare(`SELECT n.id,n.reading_id,n.created,
      CASE WHEN length(CAST(n.body AS BLOB)) <= ? THEN n.body END AS body,
      CASE WHEN length(CAST(r.body AS BLOB)) <= ? THEN json_object(
        'bvid',r.bvid,'page',r.page,'title',json_extract(r.body,'$.title'),'author',json_extract(r.body,'$.author'),
        'url',json_extract(r.body,'$.url'),'route',json_extract(r.body,'$.route'),'coverage',json_extract(r.body,'$.coverage')) END AS source
      FROM notes n LEFT JOIN readings r ON r.id=n.reading_id ORDER BY n.created,n.id LIMIT ? OFFSET ?`).all(chars, chars, limit, offset)
    const entries = rows.map((raw) => {
      if (raw['body'] === null || raw['source'] === null) throw new GenesisError('invalid-source', 'A legacy journal or source is missing or exceeds sourceChars. Inspect the ledger and trusted budget before retrying.')
      const row = rowSchema.parse(raw)
      const note = noteSchema.parse(JSON.parse(row.body))
      const source = sourceSchema.parse(JSON.parse(row.source))
      if (row.created > new Date().toISOString()) throw new GenesisError('invalid-source', 'A legacy journal has a future creation time. Verify its timestamp before migrating.')
      const metadata = { journalId: row.id, readingId: row.reading_id, originalCreatedAt: row.created, ...source }
      if (JSON.stringify({ ...metadata, note }).length > chars) throw new GenesisError('capacity', 'Legacy journal exceeds sourceChars. Increase the trusted budget before retrying.')
      const content = ['B 站观影札记（旧手账迁移；模型整理，未经核实，不代表完整观看）。', JSON.stringify(metadata),
        ...Object.entries(labels).flatMap(([key, label]) => {
          const value = note[key as keyof typeof labels]
          return value ? [`## ${label}`, value] : []
        }), '## 时间点依据', ...note.evidence.map(item => `${item.at}s · ${item.url ?? source.url} · ${item.claim}`)].join('\n\n')
      return { journalId: row.id, createdAt: row.created, title: source.title, content }
    })
    return { entries, total, nextOffset: offset + entries.length < total ? offset + entries.length : null }
  } catch (error) {
    if (error instanceof GenesisError) throw error
    throw new GenesisError('invalid-state', 'Legacy Bilibili journals could not be validated. This page was not imported. Restore a verified ledger before retrying.', { cause: error })
  } finally { db.close() }
}
