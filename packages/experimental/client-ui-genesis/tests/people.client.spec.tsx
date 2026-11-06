import type { PersonId } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { SessionId } from '@deepseek-ai/dsh-session'
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { PersonSummary, PersonDetail } from '@deepseek-ai/dsh-experimental-genesis/types'
import { PeoplePanel } from '../src/client/PeoplePanel.tsx'
import { en } from '../src/client/locales.ts'
import { globalProps } from './global-props.client.ts'

type RelationshipId = NonNullable<PersonSummary['relationship']>['id']
type LifeEventId = PersonDetail['events'][number]['id']

afterEach(cleanup)
const t = (key: keyof typeof en, params?: Record<string, unknown>) => en[key]
  .replace(/\{(\w+)\}/gu, (_match: string, name: string) => String(params?.[name] ?? ''))
const person: PersonSummary = { id: brandString<PersonId>('person:' + 'a'.repeat(64)), name: '小明', accountId: '12345', operator: false,
  updatedAt: '2026-11-04T00:00:00.000Z', evidenceCount: 1, relationship: {
    id: brandString<RelationshipId>('1c03b9b0-ddb7-4fc1-9e70-c435eac370bd'), scope: 'person', personId: brandString<PersonId>('person:' + 'a'.repeat(64)), label: '小明',
    values: { affection: 0.2, trust: 0.5, attachment: 0, familiarity: 0.3, feltSecurity: 0.5 },
    confidence: { affection: 0.6, trust: 0, attachment: 0, familiarity: 0.5, feltSecurity: 0 },
    origins: { affection: 'model-inference', trust: 'unknown', attachment: 'unknown', familiarity: 'model-inference', feltSecurity: 'unknown' },
    updatedAt: '2026-11-04T00:00:00.000Z' } }
it('shows sourced people, preserves failed deletion, and requires explicit confirmation before forgetting', async () => {
  const detail: PersonDetail = { person, total: 1, nextOffset: null, events: [{ id: brandString<LifeEventId>('e47f3471-453d-4c61-beb0-54ab2695baed'),
    timestamp: person.updatedAt, kind: 'appraisal', reason: '一起完成工作', summary: '共同交流让彼此更熟悉',
    sources: [{ id: brandString<LifeEventId>('3ccceade-f826-45d4-afac-c21ed5bdc337'), sessionId: brandString<SessionId>('qq-private'), eventId: '2' }] }] }
  const forget = vi.fn().mockResolvedValueOnce({ ok: false, error: new Error('changed') }).mockResolvedValue({ ok: true, value: undefined })
  const props = { ...globalProps, t, forget, adjust: vi.fn(), refresh: vi.fn(), openSession: vi.fn(),
    useResource: (address: string) => ({ status: 'live', value: address.includes('genesis-person/') ? detail
      : address.includes('genesis-people/') ? { items: [person], total: 1, nextOffset: null } : undefined }),
  } as ComponentProps<typeof PeoplePanel>
  render(<PeoplePanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: en.peopleDetails }))
  expect(screen.getAllByRole('meter')).toHaveLength(2)
  expect(screen.getByText('共同交流让彼此更熟悉')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en.peopleForget }))
  expect(forget).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: en.cancel }))
  expect(forget).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: en.peopleForget }))
  fireEvent.click(screen.getByRole('button', { name: en.peopleForget }))
  await waitFor(() => { expect(forget).toHaveBeenCalledOnce() })
  await waitFor(() => { expect(screen.getByRole('button', { name: en.peopleForget })).toHaveProperty('disabled', false) })
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en.peopleForget }))
  await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  expect(forget).toHaveBeenLastCalledWith(person.id, person.updatedAt, expect.any(AbortSignal))
})

it('distinguishes an empty people catalogue from a failed query', () => {
  let failed = false
  const props = { ...globalProps, t, forget: vi.fn(), adjust: vi.fn(), refresh: vi.fn(), openSession: vi.fn(),
    useResource: (address: string) => ({ status: failed ? 'failed' : 'live', value: !failed && address.includes('genesis-people/')
      ? { items: [], total: 0, nextOffset: null } : undefined }),
  } as ComponentProps<typeof PeoplePanel>
  const view = render(<PeoplePanel {...props} />)
  expect(screen.getByText(en.peopleEmpty)).toBeTruthy()
  failed = true; view.rerender(<PeoplePanel {...props} />)
  expect(screen.getByText(en.peopleQueryFailed)).toBeTruthy()
  expect(screen.queryByText(en.peopleEmpty)).toBeNull()
})
