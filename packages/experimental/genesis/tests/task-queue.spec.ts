/** Task journal recovery and uncertain-write containment using real storage backends. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { TaskQueue, taskQueueDomain, taskSessionId, taskFingerprint, type TaskSubmission } from '../src/task-queue.ts'
import { openCore } from './harness.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  const errors: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) {
    try { await close() } catch (error) { errors.push(error) }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Task queue cleanup')
})

async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-task-queue-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return root
}

async function open(root: string, medium: 'json' | 'sqlite' = 'json') {
  const fixture = await openCore(root, medium)
  cleanup.push(() => fixture.close())
  const domain = await new DomainFacility(fixture.ctx, { backend: medium }).open(taskQueueDomain)
  cleanup.push(() => domain.close())
  const lifeId = (await fixture.core.snapshot()).identity.id
  const queue = new TaskQueue(domain, lifeId, fixture.config)
  cleanup.push(() => queue.close())
  const row = (requestId = 'first'): TaskSubmission => ({ schemaVersion: 1, lifeId,
    sessionId: taskSessionId(lifeId, requestId), requester: SessionId('original-requester'),
    workspaceId: WorkspaceId('workspace'), workspacePath: root, mode: 'standard', requestId,
    fingerprint: taskFingerprint(WorkspaceId('workspace'), 'standard', 'Private assignment.'),
    sandbox: 'read-only', denyApproval: true, delivery: 'pending', prompt: 'Private assignment.' })
  return { ...fixture, domain, queue, row }
}

it.each(['json', 'sqlite'] as const)('restores pending work and acknowledges it without retaining its body in %s', async (medium) => {
  const root = await directory()
  const first = await open(root, medium)
  const row = first.row()
  await Promise.all([first.queue.reserve(row), first.queue.reserve(row)])
  expect(first.queue.pending(row.workspaceId)).toEqual([row])
  await expect(first.queue.reserve({ ...row, fingerprint: '0'.repeat(64) })).rejects.toMatchObject({ code: 'invalid-source' })
  await first.queue.close()
  await first.close()
  const second = await open(root, medium)
  expect(second.queue.get(row.sessionId)).toEqual(row)
  await second.queue.delivered(row.sessionId)
  expect(second.queue.get(row.sessionId)).toEqual({ ...row, delivery: 'delivered', prompt: null })
  expect(second.queue.pending(row.workspaceId)).toEqual([])
  const withdrawn = second.row('withdrawn')
  await second.queue.reserve(withdrawn)
  expect(await second.queue.withdraw(withdrawn.sessionId)).toBe(true)
  expect(await second.queue.withdraw(row.sessionId)).toBe(false)
  await second.queue.close()
  await second.close()
  const third = await open(root, medium)
  expect(third.queue.get(withdrawn.sessionId)).toEqual({ ...withdrawn, delivery: 'withdrawn', prompt: null })
})

it('stops task reads and submissions after an uncertain write, then recovers confirmed storage on reopen', async () => {
  const root = await directory()
  const first = await open(root)
  const row = first.row()
  await first.queue.reserve(row)
  const saved = await readFile(join(root, 'genesis_tasks.json'), 'utf8')
  vi.spyOn(first.domain.table('submissions'), 'put').mockRejectedValueOnce(new Error('disk interrupted'))
  await expect(first.queue.delivered(row.sessionId)).rejects.toMatchObject({ code: 'storage' })
  expect(() => first.queue.get(row.sessionId)).toThrow('uncertain outcome')
  expect(() => first.queue.reserve(first.row('different-key'))).toThrow('uncertain outcome')
  expect(await readFile(join(root, 'genesis_tasks.json'), 'utf8')).toBe(saved)
  await first.queue.close()
  await first.close()
  const second = await open(root)
  expect(second.queue.get(row.sessionId)).toEqual(row)
})

it('refuses damaged task storage without replacing the life or the journal', async () => {
  const root = await directory()
  const first = await open(root)
  await first.queue.reserve(first.row())
  const identity = (await first.core.snapshot()).identity
  await first.queue.close()
  await first.close()
  const file = join(root, 'genesis_tasks.json')
  const damaged = (await readFile(file, 'utf8')).replace(/("fingerprint"\s*:\s*")/, '$1invalid-')
  expect(damaged).toContain('invalid-')
  await writeFile(file, damaged)
  await expect(open(root)).rejects.toThrow()
  expect(await readFile(file, 'utf8')).toBe(damaged)
  const state = await openCore(root)
  cleanup.push(() => state.close())
  expect((await state.core.snapshot()).identity).toEqual(identity)
})

it('keeps control receipts and stop state across restart without replaying a superseded request', async () => {
  const root = await directory()
  const first = await open(root)
  const row = first.row()
  await first.queue.reserve(row)
  await first.queue.delivered(row.sessionId)
  const stop = { id: MessageId('stop-1'), requestId: 'stop-1', kind: 'stop' as const, expectedTurn: 1,
    requester: row.requester, callId: ToolCallId('stop-call'), sandbox: row.sandbox, denyApproval: row.denyApproval, status: 'pending' as const }
  await first.queue.control(row.sessionId, stop)
  expect(first.queue.get(row.sessionId)?.controls?.paused).toBe(true)
  const resume = { ...stop, id: MessageId('resume-1'), requestId: 'resume-1', kind: 'resume' as const }
  await first.queue.control(row.sessionId, resume)
  await expect(first.queue.control(row.sessionId, stop)).rejects.toMatchObject({ code: 'configuration-conflict' })
  await first.queue.settleControl(row.sessionId, resume.id)
  await first.queue.close()
  await first.close()
  const second = await open(root)
  expect(second.queue.get(row.sessionId)?.controls).toEqual({ paused: false, requests: [stop, { ...resume, status: 'done' }] })
  await second.queue.control(row.sessionId, { ...stop, id: MessageId('stop-2'), requestId: 'stop-2', expectedTurn: 2 })
  await second.queue.operatorResume(row.sessionId, MessageId('actual-operator-input'), 3)
  expect(second.queue.get(row.sessionId)?.controls?.paused).toBe(false)
})
