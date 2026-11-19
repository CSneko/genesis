import { expect, it } from 'vitest'
import { z } from 'zod'
import { statusFailure, reviewFailure } from '../src/status-error.ts'
import { GenesisError } from '../src/error.ts'
import { deliberationPlanSchema } from '../src/agency-state.ts'

it('retains the HTTP diagnostic and configuration conflict without leaking the contained response cause', () => {
  const failure = statusFailure(new GenesisError('memory-provider', 'Embedding request failed (HTTP 401). Check the API key.',
    { cause: new Error('private provider response') }))
  expect(failure).toMatchObject({ code: 'genesis/operation', details: { reason: 'memory-provider' } })
  expect(failure.message).toContain('HTTP 401')
  expect(failure.message).not.toContain('private provider response')
  expect(statusFailure(new GenesisError('configuration-conflict', 'Settings changed; reload before saving.')).message).toContain('Settings changed')
})

it('reports the field and numeric constraint without copying untrusted field names or input values', () => {
  const result = z.strictObject({ dimensions: z.number().min(1) }).safeParse({ dimensions: 0, 'private-secret': 'private-value' })
  if (result.success) throw new Error('Expected invalid fixture')
  const failure = statusFailure(result.error)
  expect(failure.message).toContain('dimensions: too_small; minimum=1')
  expect(failure.message).not.toContain('private-secret')
  expect(failure.message).not.toContain('private-value')
})

it('exposes transport cause codes and timeout separately from the fetch wrapper', () => {
  const cause = Object.assign(new Error('private connection diagnostic'), { code: 'ECONNREFUSED' })
  expect(statusFailure(new TypeError('fetch failed', { cause })).message).toContain('ECONNREFUSED')
  expect(statusFailure(new DOMException('private timeout diagnostic', 'TimeoutError')).message).toContain('timed out')
  expect(statusFailure(new GenesisError('storage', 'Write outcome is uncertain.', {
    cause: Object.assign(new Error('private storage path'), { code: 'EACCES' }),
  })).message).toContain('EACCES')
  expect(statusFailure(new SyntaxError('private malformed JSON')).message).toContain('invalid JSON')
})

it('identifies the deliberation collection and unknown-field count while retaining raw keys only in the cause', () => {
  const result = deliberationPlanSchema.safeParse({ motivations: [{ 'private-key': 'private-value' }] })
  if (result.success) throw new Error('Expected invalid fixture')
  const failure = statusFailure(result.error)
  expect(failure.message).toContain('motivations.0: unrecognized_keys; unknown fields=1')
  expect(failure.message).toContain('inspect the logged auxiliary response')
  expect(failure.message).not.toContain('private-key')
  expect(failure.message).not.toContain('private-value')
  expect(failure.cause).toBe(result.error)
})

it.each([
  [{}, 'missing (required field)'],
  [{ changes: null }, 'null'],
  [{ changes: 'private conversation text' }, 'string'],
  [{ changes: { 'private-key': 'private-value' } }, 'object'],
  [{ changes: 42 }, 'number'],
])('explains the required changes array and received type without exposing response values: %j', (input, received) => {
  const result = z.strictObject({ changes: z.array(z.unknown()) }).safeParse(input, { reportInput: true })
  if (result.success) throw new Error('Expected invalid memory plan')
  const failure = reviewFailure('writer', result.error)
  expect(failure.message).toContain('Memory writer response failed validation')
  expect(failure.message).toContain(`changes: invalid_type; expected=array; received=${received}`)
  expect(failure.message).toContain('"changes": [] when no item changes are needed')
  expect(failure.details).toMatchObject({ stage: 'writer' })
  expect(JSON.stringify(failure)).not.toMatch(/private conversation text|private-key|private-value/u)
})

it('reports nested field types, permitted memory categories and formats without echoing supplied text', () => {
  const schema = z.object({ changes: z.array(z.object({ sourceSeqs: z.array(z.number()),
    memory: z.object({ category: z.enum(['episodic', 'semantic', 'self', 'procedural']), id: z.uuid() }) })) })
  const result = schema.safeParse({ changes: [{ sourceSeqs: 'private source text',
    memory: { category: 'private category', id: 'private invalid id' } }] }, { reportInput: true })
  if (result.success) throw new Error('Expected invalid fields')
  const message = statusFailure(result.error).message
  expect(message).toContain('changes.0.sourceSeqs: invalid_type; expected=array; received=string')
  expect(message).toContain('changes.0.memory.category: invalid_value; allowed=episodic|semantic|self|procedural')
  expect(message).toContain('changes.0.memory.id: invalid_format; expected format=uuid')
  expect(message).not.toContain('private')
})

it('does not guess the received type when the parser did not retain it, or echo dynamic enum values', () => {
  const result = z.object({ changes: z.array(z.unknown()), model: z.enum(['private-model-id']) }).safeParse({ changes: null, model: 'private-input' })
  if (result.success) throw new Error('Expected invalid fields')
  const message = statusFailure(result.error).message
  expect(message).toContain('changes: invalid_type; expected=array')
  expect(message).not.toContain('received=')
  expect(message).not.toContain('private')
})
