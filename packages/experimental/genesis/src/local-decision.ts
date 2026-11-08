/** Operator-installed local decision runtime, isolated from conversation models and system services. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import type { Config } from './config.ts'
import type { MemoryModelsSettings, LocalDecisionStatus } from './status-types.ts'
import { GenesisError } from './error.ts'
import { resolveLocalRuntime } from './local-runtime.ts'

/** Internal credential reference; the ephemeral secret is never written to life history or settings. */
export const LOCAL_DECISION_KEY = 'GENESIS_MANAGED_LOCAL_DECISION'

declare module '@deepseek-ai/cordis' {
  interface Context { genesisLocalDecision: LocalDecision }
}

/** Owns one loopback server and awaits its process range before releasing files or dependencies. */
export class LocalDecision {
  private readonly lifetime = new AbortController()
  private readonly secret = randomBytes(32).toString('hex')
  private child: SubprocessHandle | undefined
  private pending: Promise<void> | undefined
  private deployment: AbortController | undefined
  private port = 0
  private state: LocalDecisionStatus = { phase: 'idle', downloadedBytes: 0 }
  private readonly root: string
  /** @param ctx - Managed host subprocess capability. @param config - Operator-owned runtime and download policy. */
  constructor(private readonly ctx: Context, private readonly config: Config) {
    this.root = join(dirname(config.leasePath), 'genesis-local-decision')
  }
  /** Read nonsecret deployment progress. @returns Detached state; failed deployments never select a cloud fallback. */
  status(): LocalDecisionStatus { return { ...this.state } }
  /** Resolve this process's endpoint. @returns Nonsecret route; requests fail visibly until the runtime is ready. */
  route(): Extract<MemoryModelsSettings['decision'], { kind: 'jev' }> {
    return { kind: 'jev', url: `http://127.0.0.1:${this.port}/v1/systemone`,
      model: this.config.localDecision.model, threshold: this.config.memory?.decisionThreshold ?? 0.5, keyRef: LOCAL_DECISION_KEY }
  }
  /** Authenticate only the owned server. @param url - Captured destination. @returns An ephemeral bearer header. */
  headers(url: string): Record<string, string> {
    if (this.state.phase !== 'ready' || this.route().url !== url) throw new GenesisError('memory-provider',
      'The local decision server is unavailable. Retry local deployment in Genesis model settings.')
    return { authorization: `Bearer ${this.secret}` }
  }
  /**
   * Start a verified installed runtime, optionally downloading missing assets after an operator click.
   * @param install - True permits downloads; false restores only existing verified files.
   * @param caller - Operator cancellation; an admitted running server belongs to Genesis afterwards.
   * @returns After a typed System One decision succeeds; concurrent callers share deployment work.
   */
  start(install: boolean, caller: AbortSignal): Promise<void> {
    this.lifetime.signal.throwIfAborted()
    if (this.state.phase === 'ready') return Promise.resolve()
    if (this.pending !== undefined) return this.pending
    this.deployment = new AbortController()
    const signal = AbortSignal.any([caller, this.lifetime.signal, this.deployment.signal, AbortSignal.timeout(this.config.localDecision.installTimeoutMs)])
    this.pending = this.launch(install, signal).catch(async (error: unknown) => {
      this.state = { ...this.state, phase: 'failed' }
      await this.stopChild()
      throw error
    }).finally(() => { this.pending = undefined; this.deployment = undefined })
    return this.pending
  }
  private async hash(path: string): Promise<string> {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) { this.lifetime.signal.throwIfAborted(); hash.update(chunk) }
    return hash.digest('hex')
  }
  private async asset(path: string, url: string, checksum: string, install: boolean, maxBytes: number, signal: AbortSignal): Promise<void> {
    let exists = true
    try { await access(path) } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      exists = false
    }
    if (exists) {
      if (await this.hash(path) !== checksum) throw new GenesisError('memory-provider',
        'A local decision asset failed SHA-256 verification. Remove the damaged asset in genesis-local-decision and retry deployment.')
      return
    }
    if (!install) throw new GenesisError('memory-provider', 'Local decision assets are missing. Click local deployment to download them again.')
    const temporary = `${path}.partial`
    const response = await fetch(url, { signal, redirect: 'follow' })
    if (!response.ok || response.body === null) {
      await response.body?.cancel()
      throw new GenesisError('memory-provider', `Local decision download failed (HTTP ${response.status}). Check the configured download source and retry.`)
    }
    const reader = response.body.getReader()
    const file = await open(temporary, 'w', 0o600)
    const hash = createHash('sha256')
    let bytes = 0
    let verified = false
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > maxBytes) throw new GenesisError('capacity', 'Local decision download exceeds localDecision.maxDownloadBytes.')
        hash.update(chunk.value)
        await file.writeFile(chunk.value)
        this.state.downloadedBytes += chunk.value.byteLength
      }
      if (hash.digest('hex') !== checksum) throw new GenesisError('memory-provider', 'Local decision download failed SHA-256 verification. Check the download source and retry.')
      await file.sync()
      verified = true
    } finally {
      await reader.cancel()
      await file.close()
      if (!verified) await rm(temporary, { force: true })
    }
    await rename(temporary, path)
  }
  private async model(install: boolean, signal: AbortSignal): Promise<void> {
    const policy = this.config.localDecision
    const store = join(this.root, 'models')
    const manifest = join(store, 'manifests', 'ollaya.dev', 'library', policy.model, 'latest')
    await mkdir(dirname(manifest), { recursive: true, mode: 0o700 })
    await this.asset(manifest, policy.modelUrl, policy.modelSha256, install, policy.outputChars * 4, signal)
    const descriptor = z.object({ digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      size: z.number().int().nonnegative().max(policy.maxDownloadBytes),
      urls: z.array(z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol))).min(1) })
    const data = z.object({ schemaVersion: z.literal(2), config: descriptor, layers: z.array(descriptor).min(1).max(64) })
      .parse(JSON.parse(await readFile(manifest, 'utf8')))
    const assets = [data.config, ...data.layers]
    if (assets.reduce((sum, asset) => sum + asset.size, 0) > policy.maxDownloadBytes) {
      throw new GenesisError('capacity', 'The decision model exceeds localDecision.maxDownloadBytes.')
    }
    await mkdir(join(store, 'blobs'), { recursive: true, mode: 0o700 })
    for (const asset of assets) {
      signal.throwIfAborted()
      await this.asset(join(store, 'blobs', asset.digest.replace(':', '-')), asset.urls[0]!, asset.digest.slice(7),
        install, asset.size, signal)
    }
  }
  private async launch(install: boolean, signal: AbortSignal): Promise<void> {
    const subprocess = this.ctx.get('subprocess')
    if (subprocess === undefined) throw new GenesisError('memory-provider', 'Load the host subprocess provider before deploying a local decision model.')
    const policy = this.config.localDecision
    const deployment = policy.binary ? undefined : resolveLocalRuntime(policy, process.platform, process.arch)
    await this.stopChild()
    this.state = { phase: 'downloading', downloadedBytes: 0 }
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    await this.model(install, signal)
    let binary = policy.binary
    if (deployment !== undefined) {
      const archive = join(this.root, deployment.archive)
      await this.asset(archive, deployment.url, deployment.sha256, install, policy.maxDownloadBytes, signal)
      const runtime = join(this.root, 'runtime')
      // Only a checksum-pinned official archive is extracted; install never executes a remote shell script.
      await rm(runtime, { recursive: true, force: true })
      await mkdir(runtime, { recursive: true, mode: 0o700 })
      const systemRoot = process.env['SystemRoot']
      if (process.platform === 'win32' && !systemRoot) throw new GenesisError('memory-provider', 'Windows SystemRoot is missing. Restore the host environment before deploying a local runtime.')
      const extractor = process.platform === 'win32' && systemRoot ? join(systemRoot, 'System32', 'tar.exe') : 'tar'
      const tar = await subprocess.resolveExecutable(extractor, {}, signal)
      const child = subprocess.spawn({ argv: [tar, '-xf', archive, '-C', runtime, ...deployment.extractionOptions], cwd: this.root,
        signal, graceMs: policy.graceMs, env: {}, stdio: { stdin: 'ignore', stdout: { maxBytes: policy.diagnosticBytes }, stderr: { maxBytes: policy.diagnosticBytes } } })
      const outcome = await child.done
      signal.throwIfAborted()
      if (outcome.exitCode !== 0) throw new GenesisError('memory-provider', 'Local runtime extraction failed. Check host tar support and available disk space, then retry.')
      binary = join(runtime, deployment.executable)
    }
    binary = await subprocess.resolveExecutable(binary, {}, signal)
    const reservation = createServer()
    await new Promise<void>((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve) })
    const address = reservation.address()
    if (address === null || typeof address === 'string') throw new GenesisError('memory-provider', 'Unable to allocate a local decision port.')
    this.port = address.port
    await new Promise<void>((resolve, reject) => { reservation.close(error => error ? reject(error) : resolve()) })
    signal.throwIfAborted()
    this.state.phase = 'starting'
    const child = subprocess.spawn({ argv: [binary, 'serve'], cwd: dirname(binary),
      signal: this.lifetime.signal, graceMs: policy.graceMs,
      env: { OLLAYA_HOST: `127.0.0.1:${this.port}`, OLLAYA_MODELS: join(this.root, 'models'),
        OLLAYA_API_KEY: this.secret, OLLAYA_DEVICE: 'cpu' },
      stdio: { stdin: 'ignore', stdout: { maxBytes: policy.diagnosticBytes }, stderr: { maxBytes: policy.diagnosticBytes } } })
    this.child = child
    void child.done.then(() => { if (this.child === child) this.state.phase = 'failed' }, () => {
      if (this.child === child) this.state.phase = 'failed'
    })
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(policy.startTimeoutMs)])
    const url = `http://127.0.0.1:${this.port}`
    while (true) {
      deadline.throwIfAborted()
      if (this.status().phase === 'failed') throw new GenesisError('memory-provider', process.platform === 'win32'
        ? 'The local decision process exited. Check the Microsoft Visual C++ Redistributable for this architecture, runtime compatibility and available memory, then retry.'
        : 'The local decision process exited. Check runtime compatibility and available memory, then retry.')
      let healthy = false
      try {
        const response = await fetch(`${url}/api/version`, { signal: AbortSignal.any([deadline, AbortSignal.timeout(policy.probeTimeoutMs)]),
          headers: { authorization: `Bearer ${this.secret}` }, redirect: 'error' })
        healthy = response.ok
        await response.body?.cancel()
      } catch (_error) { deadline.throwIfAborted() /* The owned server may still be loading its verified model. */ }
      if (healthy) break
      await delay(policy.pollMs, undefined, { signal: deadline })
    }
    const { modelJson, endpointRequest, endpointResult, reviewDecisionSchema } = await import('./model-endpoint.ts')
    const response = await fetch(this.route().url, { method: 'POST', signal: deadline, redirect: 'error',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.secret}` },
      body: JSON.stringify(endpointRequest(this.route(), 'Does the state request a memory update?',
        { message: 'No memory update is requested.' }, 0)) })
    reviewDecisionSchema.parse(endpointResult(this.route(), await modelJson(response, policy.outputChars, 'localDecision.outputChars')))
    deadline.throwIfAborted()
    this.state.phase = 'ready'
  }
  private async stopChild(): Promise<void> {
    const child = this.child
    this.child = undefined
    if (child !== undefined) { child.terminate(); await child.done.catch((_error: unknown) => { /* Spawn failures already settle the process range. */ }) }
  }
  /** Cancel installation and stop the owned server without deleting verified downloads. @returns After deployment and server exit settle. */
  async stop(): Promise<void> {
    this.deployment?.abort()
    await this.pending?.catch((_error: unknown) => { /* The original deployment caller owns its cancellation report. */ })
    await this.stopChild()
    this.state.phase = 'idle'
  }
  /** Delete only Genesis-managed assets after stopping its server. @returns After the private runtime directory is removed. */
  async uninstall(): Promise<void> { await this.stop(); await rm(this.root, { recursive: true, force: true }) }
  /** Stop admitted deployment and await the owned server's exit. @returns After downloads and process teardown settle. */
  async close(): Promise<void> {
    this.lifetime.abort()
    await this.pending?.catch((_error: unknown) => { /* The deployment caller owns the failure report. */ })
    await this.stopChild()
    this.state.phase = 'idle'
  }
}
