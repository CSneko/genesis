/** Persistent Chinese-time sleep policy, sampled windows and waking-cycle work. @module */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { LifeId, MemoryId } from './model.ts'

/** Identity of a scheduled sleep interval, unrelated to conversation identity. */
export type SleepWindowId = Branded<'GenesisSleepWindowId'>
/** Operator settings; intervals use minutes after midnight in Asia/Shanghai. */
export const sleepSettingsSchema = z.strictObject({ enabled: z.boolean(), jitterMs: z.number().int().min(0).max(300000),
  temporaryIdleMs: z.number().int().min(1000).max(86400000), holidayExempt: z.boolean(), greetings: z.boolean(),
  exemptDates: z.array(z.iso.date()).max(366),
  schedule: z.array(z.strictObject({ days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    start: z.number().int().min(0).max(1439), end: z.number().int().min(1).max(1440) })).max(28),
}).superRefine((settings, ctx) => {
  for (let day = 1; day <= 7; day++) {
    const periods = settings.schedule.filter(item => item.days.includes(day)).sort((a, b) => a.start - b.start)
    if (periods.some((period, i) => period.end <= period.start || (i > 0 && period.start < periods[i - 1]!.end))) {
      ctx.addIssue({ code: 'custom', message: 'Sleep intervals must end later on the same day and cannot overlap.' })
    }
  }
})
/** Persisted complete operator schedule. */
export type SleepSettings = z.infer<typeof sleepSettingsSchema>
const windowSchema = z.strictObject({ id: z.string().transform(brandString<SleepWindowId>), date: z.iso.date(),
  start: z.number().int(), end: z.number().int() }).refine(row => row.start < row.end, 'Invalid sampled sleep window')
/** Actual sampled window; its absolute boundaries survive restart. */
export type SleepWindow = z.infer<typeof windowSchema>
const cycleSchema = z.strictObject({ id: z.string(), from: z.number().int(), until: z.number().int(),
  sessionId: z.string().transform(SessionId).nullable(), pending: z.array(z.uuid().transform(brandString<MemoryId>)),
  summaries: z.array(z.uuid().transform(brandString<MemoryId>)), stage: z.enum(['pending', 'running', 'failed', 'completed']),
  batch: z.number().int().nonnegative(), rounds: z.number().int().nonnegative(), failure: z.string().nullable() })
/** A frozen waking-period selection; all batches must settle before completion. */
export type SleepCycle = z.infer<typeof cycleSchema>
/** Versioned life-bound sleep state. Unknown writes stop its owner until verified reload. */
export const sleepStateSchema = z.strictObject({ schemaVersion: z.literal(1), lifeId: z.uuid().transform(brandString<LifeId>),
  transitionSeq: z.number().int().nonnegative(), seed: z.string().regex(/^[a-f0-9]{64}$/u), revision: z.number().int().nonnegative(), settings: sleepSettingsSchema,
  mode: z.enum(['awake', 'asleep', 'temporary', 'keep-awake']), windowId: z.string().transform(brandString<SleepWindowId>).nullable(),
  temporaryUntil: z.number().int().nullable(), awakeSince: z.number().int(), windows: z.array(windowSchema),
  lastTransition: z.strictObject({ seq: z.number().int().positive(), previous: z.enum(['awake', 'asleep', 'temporary', 'keep-awake']),
    mode: z.enum(['awake', 'asleep', 'temporary', 'keep-awake']), windowId: z.string().nullable(), at: z.number().int(), announced: z.boolean() }).optional(),
  cycles: z.array(cycleSchema),
  receipts: z.array(z.strictObject({ key: z.string(), fingerprint: z.string(), state: z.enum(['requested', 'yes', 'no', 'done']) })),
})
/** Authoritative current projection and receipts. */
export type SleepState = z.infer<typeof sleepStateSchema>
/** Independent domain shares the single-life writer lease. */
export const sleepDomain = defineDomain({ name: 'genesis_sleep', version: 1,
  tables: { state: domainTable<'current', SleepState>(sleepStateSchema) } })
/** Operator sample with explicitly covered calendar years. */
export interface SleepStatus {
  backlog: { pending: number; uncertain: number }
  pollMs: number
  revision: number
  settings: SleepSettings
  mode: SleepState['mode']
  temporaryUntil: number | null
  current: SleepWindow | null
  next: SleepWindow | null
  calendarYears: number[]
  calendarCovered: boolean
  cycles: Array<Omit<SleepCycle, 'pending' | 'summaries'> & { pendingCount: number; summaryCount: number }>
  cyclesOmitted: number
  failure: string | null
}
