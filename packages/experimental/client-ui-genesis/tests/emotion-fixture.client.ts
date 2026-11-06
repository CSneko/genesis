/** Complete current-generation status samples shared by emotion and relationship UI tests. */
import { vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { LifeStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import { EmotionPanel } from '../src/client/EmotionPanel.tsx'
import { en, zh } from '../src/client/locales.ts'
import { statusFixture } from './status-fixture.client.ts'
import type {} from '../src/client/mount.ts'
import { globalProps } from './global-props.client.ts'

export function emotionFixture(chinese = false) {
  const current = { happiness: 0.6, sadness: 0.1, anger: 0, fear: 0, tenderness: 0, gratitude: 0, longing: 0, frustration: 0, disappointment: 0 }
  const mood = { valence: -0.2, arousal: 0.3 }
  const needs = { socialDesire: 0.5, socialSatisfaction: 0.5, relationshipQuality: 0.5, recentInteraction: 0, solitudePreference: 0.5,
    exploration: 0.5, autonomy: 0.5, creativity: 0.5, loneliness: 0 }
  const short = { happiness: 300000, sadness: 900000, anger: 300000, fear: 180000, tenderness: 900000, gratitude: 1200000,
    longing: 1800000, frustration: 300000, disappointment: 900000 }
  const long = { valence: 43200000, arousal: 43200000 }
  const status: LifeStatus = { ...statusFixture(), emotion: { version: 3, revision: 4, updatedAt: '2026-10-24T00:00:00.000Z',
    current, relationship: null, mood, needs, baseline: { ...mood }, shortHalfLifeMs: short, moodHalfLifeMs: long,
    sensitivity: 1, needsHalfLifeMs: 21600000, interactionHalfLifeMs: 21600000,
    settings: { enabled: true, offlineChanges: true, moodEmotionScale: 0.2, emotionMoodInfluence: 0.25,
      sensitivity: 1, maxNeedsDelta: 0.08, needsHalfLifeMs: 21600000, interactionHalfLifeMs: 21600000,
      relationshipEnabled: true, maxRelationshipDelta: 0.01, moodSupportTurns: 3, importantEventThreshold: 0.8, repetitionDiscount: 0.5,
      windowTurns: 4, maxDelta: 0.25, maxMoodDelta: 0.04, contextStep: 0.05,
      baseline: { ...mood }, shortHalfLifeMs: short, moodHalfLifeMs: long }, history: [], omitted: 0 } }
  const adjust = vi.fn().mockResolvedValue({ ok: true, value: 5 })
  const saveSettings = vi.fn().mockResolvedValue({ ok: true, value: 5 })
  const dictionary: Readonly<Record<string, string>> = chinese ? zh : en
  const props: ComponentProps<typeof EmotionPanel> = {
    ...globalProps, close() {},
    refresh: vi.fn(), adjust, saveSettings,
    t: (key, params) => (dictionary[key] ?? key).replace(/\{(\w+)\}/gu, (_match: string, name: string) => String(params?.[name] ?? '')),
    useResource: (() => ({ status: 'live', value: status, failure: undefined })) as ComponentProps<typeof EmotionPanel>['useResource'],
  }
  return { props, status, adjust, saveSettings }
}
