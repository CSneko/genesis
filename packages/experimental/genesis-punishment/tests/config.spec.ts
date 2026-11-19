/** Browser settings must validate the serialized schema without Host callbacks. @module */
import { expect, it } from 'vitest'
import Schema from '@deepseek-ai/schemastery'
import { Config } from '../src/index.ts'

it('round-trips editable webhook settings through the browser schema', () => {
  const field = Config.dict?.webhookUrl
  if (field === undefined) throw new Error('Missing webhook URL schema')
  const serialized = JSON.parse(JSON.stringify(field.toJSON()))
  const browser = new Schema(serialized)
  expect(() => browser('')).not.toThrow()
  expect(() => browser('https://receiver.example/punishment?token=example')).not.toThrow()
  for (const value of ['file:///tmp/receiver', 'https://user:password@example.com', 'https://example.com/#fragment']) {
    expect(() => browser(value)).toThrow()
  }
})
