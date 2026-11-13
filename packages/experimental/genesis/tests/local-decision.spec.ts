/** Local deployment owns verified downloads and the actual child lifecycle; only inference is a fixture. */
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { afterEach, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalDecision } from '../src/local-decision.ts'
import { Config } from '../src/config.ts'
import { resolveLocalRuntime } from '../src/local-runtime.ts'

const disposers: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose() })

it('verifies local assets, restores without downloading, authenticates its server and joins it on shutdown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-decision-'))
  disposers.push(() => rm(root, { recursive: true, force: true }))
  const binary = join(root, 'fixture-server.mjs')
  await writeFile(binary, `#!${process.execPath}
import { createServer } from 'node:http'
const port = Number(process.env.OLLAYA_HOST.split(':').at(-1))
const key = process.env.OLLAYA_API_KEY
createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  if (req.url === '/v1/systemone') {
    const input = JSON.parse(body)
    if (input.questions.remember.type !== 'noul' || input.state === undefined || input.messages !== undefined) {
      res.writeHead(400).end(); return
    }
  }
  if (req.headers.authorization !== 'Bearer ' + key) { res.writeHead(401).end(); return }
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(req.url === '/api/version' ? { version: 'fixture' }
    : { answers: { remember: { type: 'noul', noul: 0.01 } } }))
}).listen(port, '127.0.0.1')
`, { mode: 0o700 })
  const body = 'fixture-decision-weights'
  const digest = createHash('sha256').update(body).digest('hex')
  let manifest = ''
  let downloads = 0
  const server = createServer((req, res) => { downloads++; res.end(req.url === '/manifest' ? manifest : body) })
  disposers.push(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => { server.close(() => resolve()) }) })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing asset fixture listener')
  const ctx = new Context()
  disposers.push(() => ctx.fiber.dispose())
  await ctx.plugin(LocalSubprocessRuntime)
  // Node supplies the fixture inference process on every host; the actual provider still owns its lifecycle.
  const subprocess = ctx.subprocess
  const spawn = subprocess.spawn.bind(subprocess)
  const launcher = vi.spyOn(subprocess, 'spawn').mockImplementation(spec => spawn({ ...spec,
    argv: [process.execPath, binary, ...spec.argv.slice(1)] }))
  disposers.push(async () => { launcher.mockRestore() })
  const descriptor = { digest: `sha256:${digest}`, size: body.length, urls: [`http://127.0.0.1:${address.port}/weights`] }
  manifest = JSON.stringify({ schemaVersion: 2, config: descriptor, layers: [descriptor] })
  const config = Config({ leasePath: join(root, 'life.lock'), localDecision: { ...Config({ leasePath: join(root, 'defaults.lock') }).localDecision, binary: process.execPath,
    modelUrl: `http://127.0.0.1:${address.port}/manifest`, modelSha256: createHash('sha256').update(manifest).digest('hex') } })
  const first = new LocalDecision(ctx, config)
  disposers.push(() => first.close())
  const signal = new AbortController().signal
  await first.start(true, signal)
  expect(first.status().phase).toBe('ready')
  expect(downloads).toBe(2)
  const route = first.route()
  expect((await fetch(new URL('/api/version', route.url))).status).toBe(401)
  expect((await fetch(new URL('/api/version', route.url), { headers: first.headers(route.url) })).status).toBe(200)
  expect(() => first.headers('https://external.invalid')).toThrow('unavailable')
  await first.close()
  await expect(fetch(new URL('/api/version', route.url))).rejects.toThrow()
  const second = new LocalDecision(ctx, config)
  disposers.push(() => second.close())
  await second.start(false, signal)
  expect(second.status().phase).toBe('ready')
  expect(downloads).toBe(2)
  await second.close()
  await writeFile(join(root, 'genesis-local-decision', 'models', 'blobs', `sha256-${digest}`), 'damaged')
  const damaged = new LocalDecision(ctx, config)
  disposers.push(() => damaged.close())
  await expect(damaged.start(false, signal)).rejects.toThrow('SHA-256')
  expect(damaged.status().phase).toBe('failed')
  expect(downloads).toBe(2)
})

it('selects the official Windows x64 Ollaya ZIP', () => {
  const policy = Config({ leasePath: 'fixture.lock' }).localDecision
  const runtime = resolveLocalRuntime(policy, 'win32', 'x64')
  expect(runtime.url).toContain('ollaya-windows-amd64.zip')
  expect(runtime.sha256).toBe(policy.windowsRuntimeSha256)
  expect(runtime.executable).toBe('bin/ollaya.exe')
  expect(runtime.extractionOptions).toEqual([])
})

it('selects Linux Ollaya and rejects unsupported hosts before download', () => {
  const policy = Config({ leasePath: 'fixture.lock' }).localDecision
  expect(resolveLocalRuntime(policy, 'linux', 'x64')).toMatchObject({
    url: policy.runtimeUrl, sha256: policy.runtimeSha256, executable: 'bin/ollaya', extractionOptions: [],
  })
  expect(() => resolveLocalRuntime(policy, 'win32', 'arm64')).toThrow('localDecision.binary')
  expect(() => resolveLocalRuntime(policy, 'darwin', 'arm64')).toThrow('localDecision.binary')
})
