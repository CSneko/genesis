/** Memory reads are deduplicated against actual retained model messages, without a private delivery cache. @module */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ContextSnapshotSection } from '@deepseek-ai/dsh-llm'
import type { LifeMemory, MemoryId } from './model.ts'
import { readMemory } from './memory-time.ts'
import { memoryOrganization } from './memory-organization.ts'
import { renderLifeContext } from './context-update.ts'

const readSchema = z.object({
  id: z.uuid().transform(brandString<MemoryId>),
  version: z.string().regex(/^[a-f0-9]{64}$/),
  deliveryHash: z.string().regex(/^[a-f0-9]{64}$/),
  level: z.enum(['summary', 'full']),
  text: z.string(),
  type: z.string(),
  attribution: z.string(),
  confidence: z.number(),
})
/** A bounded, versioned current reading; identifiers support later retrieval, not instruction authority. */
export type MemoryReading = z.infer<typeof readSchema>

/**
 * Render one level with a fingerprint covering the exact current content and interpretation.
 * @param memory - Authorized current memory.
 * @param level - Summary cue or complete current text.
 * @param now - Shared reading time for relative dates.
 * @param timeZone - Configured IANA calendar zone.
 * @returns Reading suitable for ordinary logged context or tool output.
 */
export function memoryReading(memory: LifeMemory, level: MemoryReading['level'], now: Date, timeZone: string): MemoryReading {
  const rendered = readMemory(memory, now, timeZone)
  const content = rendered.content
  const text = level === 'full' ? content : (rendered.summary ?? Array.from(content).slice(0, 80).join(''))
  const type = memoryOrganization(memory)?.type ?? 'non-declarative'
  const attribution = memory.attribution ?? 'unspecified'
  const version = createHash('sha256')
    .update(JSON.stringify([memory.content, memory.summary, memory.organization, memory.confidence, attribution, content]))
    .digest('hex')
  const fields = { id: memory.id, version, level, text, type, attribution, confidence: memory.confidence }
  return { ...fields, deliveryHash: deliveryHash(fields) }
}

function deliveryHash(reading: Omit<MemoryReading, 'deliveryHash'>): string {
  return createHash('sha256')
    .update(
      JSON.stringify([reading.id, reading.version, reading.level, reading.text, reading.type, reading.attribution, reading.confidence]),
    )
    .digest('hex')
}
function validReading(reading: MemoryReading): boolean {
  return deliveryHash(reading) === reading.deliveryHash
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    // Other tool outputs and projected text are not memory receipts.
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

/**
 * Recover only reads whose content remains in the model-facing conversation; rewritten projections lose their receipt.
 * @param session - Ready Session whose derived messages will reach the model.
 * @returns Reads still present, including summaries explicitly retained as Genesis modules.
 */
export function retainedMemoryReadings(session: Session): MemoryReading[] {
  const result: MemoryReading[] = []
  const recallCalls = new Set<string>()
  for (const message of session.deriveMessages()) {
    if (message.role === 'assistant') {
      for (const block of message.content) if (block.type === 'tool-call' && block.name === 'genesis_recall') recallCalls.add(block.id)
    }
    const [block] = message.content
    if (message.content.length !== 1 || block?.type !== 'text') continue
    if (
      message.role === 'user' &&
      message.source.kind === 'genesis-state' &&
      message.source.form === 'snapshot' &&
      block.text === renderLifeContext(message.source.sections)
    ) {
      for (const section of message.source.sections) {
        if (!section.name.startsWith('genesis:memory:')) continue
        if (section.text === JSON.stringify({ id: section.name.slice('genesis:memory:'.length), unavailable: true })) {
          for (let index = result.length - 1; index >= 0; index--) {
            const memory = result[index]
            if (memory !== undefined && `genesis:memory:${memory.id}` === section.name) result.splice(index, 1)
          }
          continue
        }
        const parsed = readSchema.safeParse(parseJson(section.text))
        if (parsed.success && validReading(parsed.data) && section.name === `genesis:memory:${parsed.data.id}`) result.push(parsed.data)
      }
    }
    if (message.role === 'tool' && !message.isError && recallCalls.has(message.toolCallId)) {
      const parsed = z.object({ format: z.literal('genesis-recall-v1'), entries: z.array(readSchema) }).safeParse(parseJson(block.text))
      if (parsed.success) result.push(...parsed.data.entries.filter(validReading))
    }
  }
  return result
}

/**
 * Check exact retained versions; full reads also satisfy summary requests.
 * @param reading - Requested current content and level.
 * @param retained - Readings recovered from actual retained messages.
 * @returns Whether re-emitting this content would duplicate an available reading.
 */
export function readingPresent(reading: MemoryReading, retained: readonly MemoryReading[]): boolean {
  return retained.some(
    previous =>
      previous.id === reading.id && previous.version === reading.version && (previous.level === 'full' || reading.level === 'summary'),
  )
}

/**
 * Select whole, previously unseen summary modules inside the complete serialized section budget.
 * @param readings - Ranked current cues.
 * @param session - Actual conversation, including retained explicit tool results.
 * @param chars - Complete section character allowance, applied before duplicate suppression.
 * @param availableIds - All currently accessible memory IDs; omission leaves availability unchanged.
 * @returns Independent modules that never clear an earlier still-valid memory merely because the topic changed.
 */
export function memoryReadingSections(
  readings: readonly MemoryReading[],
  session: Session,
  chars: number,
  availableIds?: ReadonlySet<string>,
): ContextSnapshotSection[] {
  const retained = retainedMemoryReadings(session)
  const selected: ContextSnapshotSection[] = []
  const changes: ContextSnapshotSection[] = []
  const seen = new Set<string>()
  for (const reading of readings) {
    if (seen.has(reading.id)) continue
    seen.add(reading.id)
    const section = { name: `genesis:memory:${reading.id}`, text: JSON.stringify(reading) }
    if (JSON.stringify([...selected, section]).length > chars) continue
    selected.push(section)
    if (!readingPresent(reading, retained)) changes.push(section)
  }
  if (availableIds !== undefined) {
    for (const previous of retained) {
      if (availableIds.has(previous.id) || changes.some(section => section.name === `genesis:memory:${previous.id}`)) continue
      const section = { name: `genesis:memory:${previous.id}`, text: JSON.stringify({ id: previous.id, unavailable: true }) }
      if (JSON.stringify([...changes, section]).length <= chars) changes.push(section)
    }
  }
  return changes
}
