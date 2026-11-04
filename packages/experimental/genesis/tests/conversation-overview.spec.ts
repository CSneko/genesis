/** Oversized evidence is read completely within real endpoint-body limits. @module */
import { expect, it } from 'vitest'
import { z } from 'zod'
import { Config } from '../src/config.ts'
import { overviewReferences, prepareConversationOverview } from '../src/conversation-overview.ts'
import { randomUUID } from 'node:crypto'
import { endpointRequest } from '../src/model-endpoint.ts'
import { PARTICIPANT_GUIDANCE } from '../src/participants.ts'
import { MEMORY_TIME_GUIDANCE } from '../src/memory-time.ts'
import { memoryModels } from '../src/model-preferences.ts'
import type { MemoryModelsSettings } from '../src/status-types.ts'

const config = Config({ leasePath: 'unused-overview-test.lock', memory: { inputChars: 12000,
  decisionProvider: 'fixture', decisionModel: 'decision', writerProvider: 'fixture', writerModel: 'writer' } }).memory!
const models: MemoryModelsSettings = { ...memoryModels(config),
  writer: { kind: 'openai', url: 'https://overview.invalid/chat/completions', model: 'writer' } }
const text = '带引号"、换行\n和🌱的完整原文。'.repeat(1600)
const input = { purpose: 'conversation-overview', conversation: [{ seq: 4, role: 'user' as const,
  timestamp: '2026-10-31T00:00:00.000Z', text }], memories: [], participants: {},
clock: { now: '2026-10-31T00:00:00.000Z', timeZone: 'Asia/Manila' } }
const signal = new AbortController().signal

it('accepts more than one hundred unique chat and memory citations and bounds unique references', () => {
  const schema = z.object(overviewReferences(150))
  const sourceSeqs = Array.from({ length: 150 }, (_, seq) => seq)
  const memoryIds = sourceSeqs.map(() => randomUUID())
  expect(schema.parse({ sourceSeqs: [...sourceSeqs, ...sourceSeqs], memoryIds: [...memoryIds, ...memoryIds] }))
    .toEqual({ sourceSeqs, memoryIds })
  expect(schema.safeParse({ sourceSeqs: [...sourceSeqs, 150], memoryIds }).success).toBe(false)
  expect(schema.safeParse({ sourceSeqs, memoryIds: [...memoryIds, randomUUID()] }).success).toBe(false)
})

it('reads every Unicode source segment within the complete HTTP budget and preserves its final citations', async () => {
  const parts: string[] = []
  const prepared = await prepareConversationOverview(input, 'Final overview', models, config, signal, async (system, value) => {
    if (models.writer.kind === 'provider') throw new Error('Expected HTTP fixture')
    const body = endpointRequest(models.writer, `${system}\n\n${PARTICIPANT_GUIDANCE}\n\n${MEMORY_TIME_GUIDANCE}`, value, config.maxTokens)
    expect(JSON.stringify(body).length).toBeLessThanOrEqual(config.inputChars)
    const evidence = z.object({ evidence: z.array(z.object({ seq: z.literal(4), text: z.string() })) }).parse(value).evidence
    for (const part of evidence) {
      expect(part.text).not.toMatch(/[\uD800-\uDFFF]/u)
      parts.push(part.text)
    }
    return { text: '用户谈到了带引号、换行与植物图案的原文。', sourceSeqs: [4], memoryIds: [] }
  })
  expect(parts.length).toBeGreaterThan(1)
  expect(parts.join('')).toBe(text)
  expect(prepared.summarized).toBe(true)
  expect(prepared.sourceSeqs).toEqual(new Set([4]))
  expect(prepared.input['overview']).toMatchObject({ sourceSeqs: [4] })
  if (models.writer.kind === 'provider') throw new Error('Expected HTTP fixture')
  const final = endpointRequest(models.writer, `Final overview\n\n${PARTICIPANT_GUIDANCE}\n\n${MEMORY_TIME_GUIDANCE}`, prepared.input, config.maxTokens)
  expect(JSON.stringify(final).length).toBeLessThanOrEqual(config.inputChars)
})

it('refuses forged intermediate citations and stops before exceeding the overview call limit', async () => {
  await expect(prepareConversationOverview(input, 'Final overview', models, config, signal, async () =>
    ({ text: '无效引用', sourceSeqs: [999], memoryIds: [] }))).rejects.toThrow('not supplied')
  let calls = 0
  await expect(prepareConversationOverview(input, 'Final overview', models,
    { ...config, overview: { ...config.overview, maxCalls: 2 } }, signal, async () => {
      calls += 1
      return { text: '临时提要', sourceSeqs: [4], memoryIds: [] }
    })).rejects.toThrow('maxCalls')
  expect(calls).toBe(1)
})
