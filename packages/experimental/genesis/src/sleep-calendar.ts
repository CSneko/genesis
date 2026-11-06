/** Versioned official vacation dates and reproducible bounded boundary variation. @module */
import { createHash } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SleepSettings, SleepWindow, SleepWindowId } from './sleep-model.ts'

/** State Council notice 国办发明电〔2025〕7号, published 2025-11-04. */
export const SLEEP_CALENDAR_SOURCE = 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm'
/** Years covered by the bundled official vacation table; weekends remain exempt from default rules. */
export const SLEEP_CALENDAR_YEARS = [2026]
const vacations = [ ['2026-01-01', '2026-01-03'], ['2026-02-15', '2026-02-23'], ['2026-04-04', '2026-04-06'],
  ['2026-05-01', '2026-05-05'], ['2026-06-19', '2026-06-21'], ['2026-09-25', '2026-09-27'], ['2026-10-01', '2026-10-07'] ]
/** China civil date at an actual instant.
 *
   * @param now - UTC epoch milliseconds.
 *
   * @returns ISO date in Asia/Shanghai.
 */
export function chinaDate(now: number): string { return new Date(now + 8 * 3600000).toISOString().slice(0, 10) }
/** Select complete, nonoverlapping sampled intervals for one civil date.
 *
   * @param date - ISO Chinese date.
 *
   * @param settings - Validated operator policy.
 *
   * @param seed - Life-owned persisted randomness.
 *
   * @returns Actual intervals; uncovered holiday calendars leave automatic sleep paused.
 */
export function sleepWindows(date: string, settings: SleepSettings, seed: string): SleepWindow[] {
  if (!settings.enabled || settings.exemptDates.includes(date)) return []
  if (settings.holidayExempt && (!SLEEP_CALENDAR_YEARS.includes(Number(date.slice(0, 4)))
    || vacations.some(([start, end]) => date >= start! && date <= end!))) return []
  const midnight = Date.parse(`${date}T00:00:00+08:00`)
  const day = new Date(`${date}T00:00:00Z`).getUTCDay() || 7
  const periods = settings.schedule.filter(period => period.days.includes(day)).sort((a, b) => a.start - b.start)
  const vary = (key: string, bound: number) => {
    const value = createHash('sha256').update(`${seed}:${date}:${key}`).digest().readUInt32BE(0) / 0xffffffff
    return Math.round((value * 2 - 1) * bound)
  }
  return periods.map((period, i) => {
    // One quarter of neighboring space preserves ordering even for very short custom intervals.
    const gapBefore = period.start - (periods[i - 1]?.end ?? 0)
    const gapAfter = (periods[i + 1]?.start ?? 1440) - period.end
    const duration = period.end - period.start
    const before = Math.min(settings.jitterMs, duration * 15000, gapBefore * 15000)
    const after = Math.min(settings.jitterMs, duration * 15000, gapAfter * 15000)
    return { id: brandString<SleepWindowId>(`${date}:${period.start}:${period.end}`), date,
      start: midnight + period.start * 60000 + vary(`${period.start}:start`, before),
      end: midnight + period.end * 60000 + vary(`${period.end}:end`, after) }
  })
}
