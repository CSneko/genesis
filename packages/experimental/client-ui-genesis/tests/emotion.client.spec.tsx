// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { EmotionPanel } from '../src/client/EmotionPanel.tsx'
import { en, zh } from '../src/client/locales.ts'
import { emotionFixture as fixture } from './emotion-fixture.client.ts'
import type { LifeStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import type {} from '../src/client/mount.ts'

afterEach(cleanup)

it('shows localized current and mood meters, safe appraisal failures and attributed history while retaining a failed-refresh sample', () => {
  const { props, status } = fixture(true)
  status.emotion!.review = {
    state: 'failed',
    sessionId: 'emotion-ui' as NonNullable<LifeStatus['review']>['sessionId'],
    turn: 1,
    failure: { stage: 'writer', code: 'genesis/operation', message: 'HTTP 429' },
  }
  status.emotion!.history = [
    {
      id: 'emotion-history' as NonNullable<LifeStatus['emotion']>['history'][number]['id'],
      kind: 'adjusted',
      timestamp: '2026-10-24T00:00:00.000Z',
      source: 'user',
      reason: 'An explicit adjustment.',
      current: status.emotion!.current,
      mood: status.emotion!.mood,
      needs: status.emotion!.needs,
      sourceEventIds: [],
    },
  ]
  render(
    <EmotionPanel
      {...props}
      useResource={
        (() => ({
          status: 'failed',
          value: status,
          failure: new RemoteError('gateway/internal', 'unavailable', {}),
        })) as typeof props.useResource
      }
    />,
  )
  expect(screen.getAllByRole('meter')).toHaveLength(20)
  expect(screen.getByText(zh.emotionCurrent)).toBeTruthy()
  expect(screen.getByText(zh.emotionMood)).toBeTruthy()
  expect(screen.getByText('An explicit adjustment.')).toBeTruthy()
  expect(screen.getByText(/情绪更新模型：HTTP 429/u)).toBeTruthy()
  expect(screen.getByRole('button', { name: zh.emotionAdjust }).hasAttribute('disabled')).toBe(false)
})

it('shows that a no-change emotion appraisal ran, with a localized threshold and completion time', () => {
  const { props, status } = fixture(true)
  status.emotion!.review = {
    state: 'skipped',
    sessionId: 'emotion-ui' as NonNullable<LifeStatus['review']>['sessionId'],
    turn: 8,
    completedAt: '2026-10-24T00:00:00.000Z',
    decision: { probability: 0.05, threshold: 0.5 },
  }
  render(<EmotionPanel {...props} />)
  expect(screen.getByText(zh.emotionReviewSkipped)).toBeTruthy()
  expect(screen.getByText(/已评估第 8 轮/u).querySelector('time')).toHaveProperty('dateTime', '2026-10-24T00:00:00.000Z')
  expect(screen.getByText('更新概率 5.0%；触发阈值 50.0%')).toBeTruthy()
})

it('retains manual drafts after a stale write and background refresh, and only reloads the revision on explicit request', async () => {
  const { props, status, adjust } = fixture()
  adjust.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'Emotion changed; reload before saving.', {}) })
  const view = render(<EmotionPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: en.emotionAdjust }))
  const label = `${en.emotionCurrent} · ${en['emotion.happiness']}`
  fireEvent.change(screen.getByLabelText(label), { target: { value: '0.8' } })
  fireEvent.change(screen.getByLabelText(en.emotionReason), { target: { value: 'A deliberate correction.' } })
  fireEvent.click(screen.getByRole('button', { name: en.emotionSaveAdjustment }))
  await screen.findByRole('alert')
  status.emotion!.revision = 7
  status.emotion!.current = { ...status.emotion!.current, happiness: 0.4 }
  view.rerender(<EmotionPanel {...props} />)
  expect(screen.getByLabelText(label)).toHaveProperty('value', '0.8')
  fireEvent.click(screen.getByRole('button', { name: en.emotionReload }))
  expect(screen.getByLabelText(label)).toHaveProperty('value', '0.4')
  expect(screen.getByLabelText(en.emotionReason)).toHaveProperty('value', 'A deliberate correction.')
  fireEvent.click(screen.getByRole('button', { name: en.emotionSaveAdjustment }))
  await vi.waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  expect(adjust).toHaveBeenLastCalledWith(
    { current: status.emotion!.current, mood: status.emotion!.mood, needs: status.emotion!.needs, reason: 'A deliberate correction.' },
    7,
    expect.any(AbortSignal),
  )
})

it('edits persisted appraisal settings and validates recovery units before sending a revision-fenced save', async () => {
  const { props, saveSettings, status } = fixture()
  render(<EmotionPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: en.emotionSettings }))
  fireEvent.click(screen.getByRole('switch', { name: en.emotionOfflineChanges }))
  fireEvent.click(screen.getByRole('switch', { name: en.emotionAutomatic }))
  const sensitivity = screen.getByLabelText<HTMLInputElement>(en['emotionSetting.sensitivity'])
  expect(sensitivity.value).toBe('1')
  fireEvent.change(sensitivity, { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: en.emotionSaveSettings }))
  expect(saveSettings).not.toHaveBeenCalled()
  fireEvent.change(sensitivity, { target: { value: '0.5' } })
  fireEvent.change(screen.getByLabelText(en['emotionSetting.moodEmotionScale']), { target: { value: '0.4' } })
  fireEvent.change(screen.getByLabelText(en['emotionSetting.emotionMoodInfluence']), { target: { value: '0.6' } })
  fireEvent.click(screen.getByRole('button', { name: en.emotionSaveSettings }))
  expect(saveSettings).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText(en['emotionSetting.emotionMoodInfluence']), { target: { value: '0.3' } })
  fireEvent.change(screen.getByLabelText(en['emotionSetting.windowTurns']), { target: { value: '6' } })
  fireEvent.change(screen.getByLabelText('Happiness immediate half-life (minutes)'), { target: { value: '60' } })
  fireEvent.change(screen.getByLabelText('Valence mood half-life (hours)'), { target: { value: '0.5' } })
  fireEvent.click(screen.getByRole('button', { name: en.emotionSaveSettings }))
  expect(screen.getByRole('alert').textContent).toContain(en.emotionRecoveryInvalid)
  expect(saveSettings).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Valence mood half-life (hours)'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: en.emotionSaveSettings }))
  await vi.waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  expect(saveSettings).toHaveBeenLastCalledWith(
    {
      ...status.emotion!.settings,
      offlineChanges: false,
      moodEmotionScale: 0.4,
      emotionMoodInfluence: 0.3,
      sensitivity: 0.5,
      enabled: false,
      windowTurns: 6,
      shortHalfLifeMs: { ...status.emotion!.shortHalfLifeMs, happiness: 3600000 },
      moodHalfLifeMs: { ...status.emotion!.moodHalfLifeMs, valence: 7200000 },
    },
    4,
    expect.any(AbortSignal),
  )
})

it('keeps empty numeric drafts invalid and cancels an in-flight mutation when its editor closes', async () => {
  const { props, adjust } = fixture()
  const pending = Promise.withResolvers<{ ok: true; value: number }>()
  adjust.mockReturnValueOnce(pending.promise)
  render(<EmotionPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: en.emotionAdjust }))
  const field = screen.getByLabelText<HTMLInputElement>('Immediate emotion · Happiness')
  fireEvent.change(field, { target: { value: '' } })
  expect(field).toHaveProperty('value', '')
  expect(field.checkValidity()).toBe(false)
  fireEvent.change(field, { target: { value: '0.7' } })
  fireEvent.change(screen.getByLabelText(en.emotionReason), { target: { value: 'Review adjustment.' } })
  fireEvent.click(screen.getByRole('button', { name: en.emotionSaveAdjustment }))
  const signal: AbortSignal = adjust.mock.calls[0]![2]
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: en.close }))
  expect(signal.aborted).toBe(true)
  pending.resolve({ ok: true, value: 5 })
  await pending.promise
})

it('shows boredom separately from loneliness without changing the editable immediate emotions', () => {
  const { props, status } = fixture(true)
  status.emotion!.boredom = { level: 0.7, mode: 'idle', riseHalfLifeMs: 1800000, fallHalfLifeMs: 300000 }
  render(<EmotionPanel {...props} />)
  expect(screen.getAllByRole('meter', { name: '无聊' })[0]?.getAttribute('value')).toBe('0.7')
  expect(screen.getByRole('meter', { name: zh['emotion.loneliness'] }).getAttribute('value')).toBe('0')
  expect(screen.getByText(zh.emotionBoredomHint)).toBeTruthy()
})

it('shows intimacy readings only while enabled and preserves independent emotion readings', () => {
  const { props, status } = fixture(true)
  const view = render(<EmotionPanel {...props} />)
  expect(screen.queryByRole('meter', { name: zh.intimacyDesire })).toBeNull()
  status.emotion!.intimacy = {
    version: 1,
    desire: 0.7,
    attraction: 0.2,
    selfUnderstanding: 'An uncertain preference.',
    settings: {
      enabled: true,
      influenceExpression: true,
      baseline: 0.5,
      halfLifeMs: 3600000,
      maxDelta: 0.15,
      genderIdentity: 'unspecified',
      sexualOrientation: 'unknown',
      romanticOrientation: 'unknown',
      boundaries: 'Adults only.',
    },
  }
  view.rerender(<EmotionPanel {...props} />)
  expect(screen.getByRole('meter', { name: zh.intimacyDesire })).toHaveProperty('value', 0.7)
  expect(screen.getByRole('meter', { name: zh.intimacyAttraction })).toHaveProperty('value', 0.2)
  expect(screen.getByText(/An uncertain preference/u)).toBeTruthy()
  status.emotion!.intimacy.settings.enabled = false
  view.rerender(<EmotionPanel {...props} />)
  expect(screen.queryByRole('meter', { name: zh.intimacyDesire })).toBeNull()
  expect(screen.getByText(zh.emotionCurrent)).toBeTruthy()
})
