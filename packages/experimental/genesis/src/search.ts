/** Query-local multilingual full-text ranking; no durable index or provider is required. @module */
import type { LifeMemory } from './model.ts'

/** Searchable fields, ordered independently from the returned value. */
export interface SearchDocument<T> {
  /** Original caller-owned record. */
  value: T
  /** Exact identifier lookup ranks first. */
  id?: string
  /** Field weights express title, current-content and historical relevance. */
  fields: Array<{ text: string; weight: number }>
}

/** One matching record and the first matching position in each original field. */
export interface TextMatch<T> {
  /** Original record, never rewritten by search. */
  value: T
  /** Query-local BM25 score with coverage and phrase preference. */
  score: number
  /** UTF-16 positions, or -1 for fields without a match. */
  positions: number[]
}

function normalize(text: string): string { return text.normalize('NFKC').toLowerCase() }

function tokens(text: string, segmenter: Intl.Segmenter): string[] {
  const words: string[] = []
  for (const item of segmenter.segment(normalize(text))) if (item.isWordLike) words.push(item.segment)
  // Bigrams retain partial names and compounds that the dictionary splits differently.
  for (const run of normalize(text).matchAll(/\p{Script=Han}{2,}/gu)) {
    // Han-only bigrams require code points, including supplementary ideographs.
    // oxlint-disable-next-line typescript/no-misused-spread
    const chars = [...run[0]]
    for (let i = 1; i < chars.length; i++) words.push(chars.slice(i - 1, i + 1).join(''))
  }
  return words
}

/**
 * Rank eligible records by multilingual words, partial keywords, phrase matches and BM25.
 * @param query - Caller-bounded query; blank or punctuation-only queries match nothing.
 * @param documents - Already authorized and filtered records; statistics use only this corpus.
 * @returns Matching records in descending relevance, with input order breaking ties.
 */
export function searchText<T>(query: string, documents: SearchDocument<T>[]): TextMatch<T>[] {
  const phrase = normalize(query.trim())
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  const terms = [...new Set(tokens(phrase, segmenter))]
  if (!terms.length) return []
  const rows = documents.map(document => ({ document, fields: document.fields.map((field) => {
    const normalized = normalize(field.text)
    const counts = new Map<string, number>()
    const words = tokens(field.text, segmenter)
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)
    return { normalized, counts, length: words.length, weight: field.weight }
  }) }))
  const average = rows.reduce((sum, row) => sum + row.fields.reduce((n, field) => n + field.length, 0), 0) / Math.max(1, rows.length)
  const frequencies = terms.map(term => ({ term,
    count: rows.filter(row => row.fields.some(field => field.normalized.includes(term))).length }))
  const matches: TextMatch<T>[] = []
  for (const { document, fields } of rows) {
    let score = 0
    let covered = 0
    for (const { term, count } of frequencies) {
      let frequency = 0
      for (const field of fields) {
        const weight = field.weight
        const count = field.counts.get(term) ?? (field.normalized.includes(term) ? 1 : 0)
        frequency += weight * count
      }
      if (!frequency) continue
      covered++
      const idf = Math.log(1 + (rows.length - count + 0.5) / (count + 0.5))
      const length = fields.reduce((sum, field) => sum + field.length, 0)
      score += idf * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * length / Math.max(1, average)))
    }
    score *= covered / terms.length
    for (const field of fields) if (field.normalized.includes(phrase)) score += field.weight
    if (document.id !== undefined && normalize(document.id) === phrase) score = Number.MAX_SAFE_INTEGER
    if (score <= 0) continue
    const expression = new RegExp(terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'u')
    const positions = document.fields.map((field) => {
      const normalized = normalize(field.text)
      const offset = expression.exec(normalized)?.index ?? -1
      if (offset < 0 || normalized === field.text.toLowerCase()) return offset
      // Grapheme normalization maps expanded compatibility characters back to source offsets.
      let length = 0
      for (const part of new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(field.text)) {
        length += normalize(part.segment).length
        if (length > offset) return part.index
      }
      return -1
    })
    matches.push({ value: document.value, score, positions })
  }
  return matches.sort((a, b) => b.score - a.score)
}

/**
 * Expose current content and attributed historical wording for recall ranking.
 * @param memory - Eligible stored memory; vectors are not searched as text.
 * @returns Weighted fields with current content preferred over old interpretations.
 */
export function memoryDocument(memory: LifeMemory): SearchDocument<LifeMemory> {
  return { value: memory, id: memory.id, fields: [
    { text: memory.content, weight: 3 }, { text: memory.summary ?? '', weight: 2 },
    { text: (memory.experience?.topics ?? []).join(' '), weight: 2 },
    { text: (memory.history ?? []).map(version => version.content).join('\n'), weight: 0.5 },
  ] }
}
