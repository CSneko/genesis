/** Private artifact owner and sandboxed managed Remotion CLI jobs; restart never replays executable work. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { JobId } from '@deepseek-ai/dsh-jobs'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import { writableRoots } from '@deepseek-ai/dsh-sandbox'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, lstat, realpath, writeFile, rm } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { compositionSource, timelineSource } from './composition.ts'
import { playerSource, playerHtml, type PlayerAsset } from './player.ts'
import type { FsWriteIntent } from '@deepseek-ai/dsh-fs'
import { idSchema, projectIdSchema, revisionIdSchema, jobIdSchema, saveSchema, revisionSchema, jobSchema, resultSchema,
  type VideoJob, type VideoRevision, type VideoProjectId, type VideoRevisionId, type VideoJobId } from './model.ts'
import type { Config } from './index.ts'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-attachment'

/** Structured operation failure; uncertain file publication requires inspection before dependent work. */
export class VideoError extends Error {
  /**
   * @param code - Stable failure classification.
   * @param message - Operation impact and safe next action.
   * @param options - Original diagnostic cause, when present.
   */
  constructor(readonly code: string, message: string, options?: ErrorOptions) { super(message, options); this.name = 'VideoError' }
}
type Invocation = {
  agent: Agent
  callId: ToolCallId
  rootCallId: ToolCallId
  signal: AbortSignal
  policy: SandboxExecutionPolicy
}
type Running = {
  agent: Agent
  abort: AbortController
  done: Promise<unknown>
  progress: () => string
  projectId: VideoProjectId
  runtimeJobId: JobId
}
const assetSchema = z.string().regex(/^[0-9a-f-]{36}\.(mp4|webm|mov|mp3|wav|m4a|ogg|png|jpg|jpeg|webp)$/)
const locate = z.strictObject({ projectId: projectIdSchema, revisionId: revisionIdSchema })
const jobLocate = z.strictObject({ projectId: projectIdSchema, jobId: jobIdSchema })
const page = { offset: z.number().int().nonnegative().default(0), limit: z.number().int().positive().optional() }
const contained = (root: string, path: string) => { const rel = relative(root, path); return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)) }

/** One plugin owns admitted work, immutable revisions and the project's explicit file grant. */
export class VideoController {
  private root: string
  private readonly lifetime = new AbortController()
  private readonly running = new Map<VideoJobId, Running>()
  private readonly operations = new Set<Promise<unknown>>()
  private mutationTail: Promise<void> = Promise.resolve()
  private storageFailure: VideoError | undefined
  private readonly cli = fileURLToPath(new URL('remotion-cli.js', import.meta.resolve('@remotion/cli/package.json')))
  /**
   * @param ctx - Actual local file, sandbox, process and attachment owners.
   * @param config - Trusted deployment budgets and private root.
   */
  constructor(private readonly ctx: Context, readonly config: Config) { this.root = config.dataDir }
  /** Prepare a private non-symlink artifact root. @returns Canonical root to register as an operator-only writable directory. */
  async prepare(): Promise<string> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const info = await lstat(this.root)
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32' && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()))) {
      throw new VideoError('private-directory', 'Video dataDir must be a private directory without a symbolic-link endpoint. Correct its path and permissions before loading.')
    }
    const canonical = await realpath(this.root)
    if (this.ctx.fs.processPathFromHostPath(canonical) !== canonical) throw new VideoError('local-provider-required', 'Video requires filesystem and subprocess providers on this host. Configure local providers before loading.')
    this.root = canonical
    const owner = await this.ctx.fs.resolve(await this.path('owner.json'))
    const lifeId = (await this.ctx.genesis.snapshot()).identity.id
    if (await this.ctx.fs.stat(owner) === undefined) {
      if ((await this.ctx.fs.listDir(await this.ctx.fs.resolve(canonical))).length !== 0) {
        throw new VideoError('owner-missing', 'Video dataDir contains artifacts but its life ownership receipt is missing. Restore the verified receipt; existing projects are not adopted automatically.')
      }
      await this.ctx.fs.writeText(owner, JSON.stringify({ version: 1, lifeId }), { kind: 'createIfAbsent' }, this.lifetime.signal,
        { mode: 'danger-full-access', workspaceRoot: canonical })
    } else {
      const receipt = z.strictObject({ version: z.literal(1), lifeId: z.string() }).parse(await this.read(await this.path('owner.json'), 1024))
      if (receipt.lifeId !== lifeId) throw new VideoError('life-mismatch', 'Video dataDir belongs to another life. Select the matching life/project directory; ownership is never replaced automatically.')
    }
    return canonical
  }
  /**
   * Check live execution ownership.
   * @param agent - Actual calling Agent.
   * @returns Whether it belongs to the configured Life preset and authenticated operator.
   */
  participates(agent: Agent | undefined): agent is Agent {
    return agent !== undefined && this.ctx.agentPresets.composedPreset(agent.ctx) === this.config.lifePreset
      && this.ctx.genesis.isOperatorSession(agent.id)
  }
  /**
   * Execute one bounded tool operation and retain it through unload.
   * @param action - Requested operation.
   * @param input - Untrusted model JSON.
   * @param agent - Calling Life Agent.
   * @param callId - Logged tool call.
   * @param rootCallId - Model invocation that owns this call, including PTC dispatch.
   * @param signal - Caller cancellation.
   * @returns Operation result, or a structured failure with no claimed success.
   */
  execute(action: string, input: unknown, agent: Agent, callId: ToolCallId, rootCallId: ToolCallId, signal: AbortSignal): Promise<unknown> {
    const invocation = { agent, callId, rootCallId, signal: AbortSignal.any([signal, this.lifetime.signal]),
      policy: this.ctx.sandboxPolicy.resolve({ session: agent.session }) }
    const run = () => this.dispatch(action, input, invocation)
    const operation = ['save', 'import', 'preview', 'render', 'delete'].includes(action) ? this.mutationTail.then(run) : run()
    if (['save', 'import', 'preview', 'render', 'delete'].includes(action)) {
      this.mutationTail = operation.then(() => {}, (_error: unknown) => {
        /* The caller reports failures; later admissions recheck storage and cancellation. */
      })
    }
    this.operations.add(operation)
    void operation.finally(() => this.operations.delete(operation)).catch((_error: unknown) => {
      /* The caller receives operation failures. */
    })
    return operation
  }
  /**
   * Abort all render jobs owned by a stopping conversation.
   * @param agent - Actual owner.
   * @returns After all owned managed process ranges settle.
   */
  async stop(agent: Agent): Promise<void> {
    const jobs = [...this.running.values()].filter(job => job.agent === agent)
    for (const job of jobs) job.abort.abort()
    await Promise.allSettled(jobs.map(job => job.done))
  }
  /** Abort accepted operations and render jobs, then await their completion before releasing dependencies. */
  async close(): Promise<void> {
    this.lifetime.abort()
    for (const job of this.running.values()) job.abort.abort()
    await Promise.allSettled([...this.operations, ...[...this.running.values()].map(job => job.done)])
  }
  private async path(...parts: string[]): Promise<string> {
    const root = await this.ctx.fs.resolve(this.root)
    if (this.ctx.fs.processPath(root) !== this.root) throw new VideoError('directory-replaced', 'Video dataDir now resolves to another directory. Stop and restore the configured private directory before continuing.')
    const target = await this.ctx.fs.resolve(join(this.root, ...parts))
    if (!this.ctx.fs.contains(root, target)) throw new VideoError('artifact-path', 'Video artifact escaped dataDir. Stop and inspect symbolic links before retrying.')
    const canonical = this.ctx.fs.processPath(target)
    if (canonical !== join(this.root, ...parts)) {
      throw new VideoError('artifact-alias', 'Video artifact paths cannot contain symbolic links. Restore the project directory before retrying.')
    }
    return canonical
  }
  private writable(inv: Invocation): void {
    inv.signal.throwIfAborted()
    if (inv.policy.mode !== 'danger-full-access' && !writableRoots(inv.policy).some(root => contained(root, this.root))) {
      throw new VideoError('write-denied', 'Video changes require a writable Session policy for dataDir. Ask the operator to configure workspace-write access; this tool cannot expand permissions.')
    }
  }
  private write(path: string, value: unknown, inv: Invocation): Promise<void> {
    return this.publishText(path, JSON.stringify(value), inv, { kind: 'createIfAbsent' }, this.config.inputChars * 4)
  }
  private async publishText(path: string, text: string, inv: Invocation, intent: FsWriteIntent | undefined,
    maxBytes: number): Promise<void> {
    this.writable(inv)
    const target = await this.ctx.fs.resolve(path)
    const root = await this.ctx.fs.resolve(this.root)
    if (this.ctx.fs.processPath(root) !== this.root || !this.ctx.fs.contains(root, target) || this.ctx.fs.processPath(target) !== path) {
      throw new VideoError('artifact-path', 'Video write escaped its private directory. Stop and inspect symbolic links before continuing.')
    }
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new VideoError('artifact-limit', 'The complete video artifact exceeds its byte budget. Shorten the revision or embedded media before retrying.')
    try { await this.ctx.fs.writeText(target, text, intent, inv.signal, inv.policy) }
    catch (error) {
      this.storageFailure = new VideoError('storage-uncertain', 'Video artifact publication has an uncertain outcome. Editing and rendering are stopped; inspect storage and reload before continuing.', { cause: error })
      throw this.storageFailure
    }
  }
  private async read(path: string, maxBytes = this.config.inputChars * 4): Promise<unknown> {
    const target = await this.ctx.fs.resolve(path)
    const bytes = await this.ctx.fs.readBytes(target, this.lifetime.signal, maxBytes)
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch (error) {
      throw new VideoError('damaged-artifact', 'Video artifact is unreadable JSON. Stop using this artifact and restore a verified copy; no replacement is created.', { cause: error })
    }
  }
  private async revision(projectId: VideoProjectId, revisionId: VideoRevisionId): Promise<VideoRevision> {
    const value = revisionSchema.parse(await this.read(await this.path(projectId, 'revisions', revisionId + '.json')))
    if (value.projectId !== projectId || value.revisionId !== revisionId) throw new VideoError('artifact-mismatch', 'Video revision identifiers disagree. Stop and inspect the project before rendering.')
    return value
  }
  private async job(projectId: VideoProjectId, jobId: VideoJobId): Promise<VideoJob> {
    const value = jobSchema.parse(await this.read(await this.path(projectId, 'jobs', jobId, 'job.json')))
    if (value.projectId !== projectId || value.jobId !== jobId) throw new VideoError('artifact-mismatch', 'Video job identifiers disagree. Stop and inspect the project before rendering.')
    return value
  }
  private async dispatch(action: string, input: unknown, inv: Invocation): Promise<unknown> {
    inv.signal.throwIfAborted()
    if (this.storageFailure !== undefined && action !== 'status' && action !== 'cancel') throw this.storageFailure
    if (!this.participates(inv.agent)) throw new VideoError('operator-required', 'Video tools require the configured operator Life conversation.')
    if (action === 'save') {
      this.writable(inv)
      const request = saveSchema.parse(input)
      if (request.duration > this.config.maxDurationSeconds) throw new VideoError('duration-limit', 'Video duration exceeds maxDurationSeconds. Shorten the composition or ask the operator to change the budget.')
      const projectId = request.projectId ?? brandString<VideoProjectId>(randomUUID())
      if (request.parentRevision !== undefined) await this.revision(projectId, request.parentRevision)
      else {
        const projects = await this.entries([])
        if (projects.length >= this.config.maxProjects) throw new VideoError('project-limit', 'Video project capacity reached. Delete an unused project before creating another.')
      }
      const revisions = request.projectId === undefined ? [] : await this.entries([projectId, 'revisions'])
      if (revisions.length >= this.config.maxRevisions) throw new VideoError('revision-limit', 'Video revision capacity reached. Export this project and start a new project.')
      if (request.timeline !== undefined) {
        for (const item of [...request.timeline.clips, ...request.timeline.texts, ...request.timeline.audio]) {
          if (item.from + item.duration > request.duration + 1 / request.fps) throw new VideoError('timeline-range', 'A timeline item extends beyond the composition. Adjust its start/duration or extend the composition.')
          if ('asset' in item && item.asset !== undefined) {
            const target = await this.ctx.fs.resolve(await this.path(projectId, 'assets', item.asset))
            if ((await this.ctx.fs.stat(target))?.type !== 'file') throw new VideoError('asset-missing', 'A timeline asset is missing. Import it into this project before saving.')
          }
        }
      }
      const revisionId = brandString<VideoRevisionId>(randomUUID())
      const value: VideoRevision = { version: 1, projectId, revisionId, createdAt: new Date().toISOString(),
        sessionId: inv.agent.id, callId: inv.callId, request }
      await this.write(await this.path(projectId, 'revisions', revisionId + '.json'), value, inv)
      return { projectId, revisionId, title: request.title, duration: request.duration, saved: true }
    }
    if (action === 'list') {
      const request = z.strictObject({ projectId: projectIdSchema.optional(), kind: z.enum(['revisions', 'assets', 'jobs']).default('revisions'), ...page })
        .refine(v => v.projectId !== undefined || v.kind === 'revisions', 'Specify projectId when listing assets or jobs.').parse(input)
      const values = (await this.entries(request.projectId === undefined ? [] : [request.projectId, request.kind]))
        .map(name => request.projectId !== undefined && request.kind === 'revisions' ? name.replace(/\.json$/, '') : name)
      const limit = Math.min(request.limit ?? this.config.pageSize, this.config.pageSize)
      return { entries: values.slice(request.offset, request.offset + limit),
        nextOffset: Math.min(values.length, request.offset + limit), total: values.length }
    }
    if (action === 'read') {
      const request = locate.extend(page).parse(input)
      const revision = await this.revision(request.projectId, request.revisionId)
      const text = JSON.stringify(revision.request)
      const limit = Math.min(request.limit ?? this.config.pageChars, this.config.pageChars)
      return { projectId: revision.projectId, revisionId: revision.revisionId, createdAt: revision.createdAt,
        text: text.slice(request.offset, request.offset + limit),
        nextOffset: Math.min(text.length, request.offset + limit), totalChars: text.length }
    }
    if (action === 'import') {
      this.writable(inv)
      const request = z.strictObject({ projectId: projectIdSchema, path: z.string().min(1) }).parse(input)
      if (!(await this.entries([request.projectId, 'revisions'])).length) throw new VideoError('project-missing', 'Create the video project before importing assets.')
      if ((await this.entries([request.projectId, 'assets'])).length >= this.config.maxAssets) throw new VideoError('asset-limit', 'Video asset capacity reached. Use another project or ask the operator to change maxAssets.')
      const extension = extname(request.path).toLowerCase()
      const asset = assetSchema.parse(randomUUID() + extension)
      const source = await this.ctx.fs.resolve(request.path, { cwd: inv.policy.workspaceRoot, signal: inv.signal })
      const bytes = await this.ctx.fs.readBytes(source, inv.signal, this.config.maxAssetBytes)
      inv.signal.throwIfAborted()
      const path = await this.path(request.projectId, 'assets', asset)
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      await writeFile(path, bytes, { flag: 'wx', mode: 0o600, signal: inv.signal })
      return { projectId: request.projectId, asset, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }
    }
    if (action === 'probe') {
      const request = z.strictObject({ projectId: projectIdSchema, asset: assetSchema }).parse(input)
      const path = await this.path(request.projectId, 'assets', request.asset)
      const result = await this.command([this.config.ffprobeExecutable, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', path], this.root, inv.policy, AbortSignal.any([inv.signal, AbortSignal.timeout(this.config.probeTimeoutMs)]))
      if (result.exitCode !== 0) throw new VideoError('probe-failed', 'Media metadata could not be read. Check ffprobe configuration and the imported media file before retrying.')
      return { metadata: z.json().parse(JSON.parse(result.stdout)), evidence: 'Container and stream metadata only; no visual understanding or speech transcription.' }
    }
    if (action === 'render' || action === 'preview') {
      this.writable(inv)
      const request = action === 'preview'
        ? { ...locate.extend({ wait: z.boolean().default(true) }).parse(input), mode: 'player' as const, frame: 0 }
        : locate.extend({ mode: z.enum(['preview', 'final', 'still']),
          frame: z.number().int().nonnegative().default(0), wait: z.boolean().default(false) }).parse(input)
      if (this.running.size >= this.config.maxConcurrentRenders) throw new VideoError('render-busy', 'The render concurrency limit is reached. Wait for or cancel an active job before starting another.')
      if ((await this.entries([request.projectId, 'jobs'])).length >= this.config.maxJobs) throw new VideoError('job-limit', 'Video render history capacity reached. Export this project and start a new one or increase maxJobs.')
      if (request.mode !== 'player' && !this.config.browserExecutable) throw new VideoError('browser-unconfigured', 'Video rendering needs an installed Chromium executable. Set browserExecutable in the video plugin configuration; no browser is downloaded by this tool.')
      const revision = await this.revision(request.projectId, request.revisionId)
      if (request.frame >= Math.max(1, Math.round(revision.request.duration * revision.request.fps))) throw new VideoError('frame-range', 'Still frame lies beyond the composition. Choose a frame within its duration.')
      const job: VideoJob = { version: 1, projectId: request.projectId, revisionId: request.revisionId,
        jobId: brandString<VideoJobId>(randomUUID()),
        sessionId: inv.agent.id, callId: inv.callId, createdAt: new Date().toISOString(), mode: request.mode, frame: request.frame }
      const directory = await this.path(job.projectId, 'jobs', job.jobId)
      await this.write(join(directory, 'job.json'), job, inv)
      const abort = new AbortController()
      const background = { ...inv, signal: AbortSignal.any([abort.signal, this.lifetime.signal, ...(request.wait ? [inv.signal] : [])]) }
      let progress = ''
      const runtimeJobId = this.ctx.jobs.start({ kind: 'video', label: `Remotion: ${revision.request.title}`, owner: inv.agent.id,
        toolCall: { callId: inv.callId, rootCallId: inv.rootCallId }, outputLimitBytes: this.config.resultChars * 4,
        run: (handle) => {
          const done = this.render(job, revision, directory, background, (text) => {
            progress = text
            handle.updateProgress(text)
          })
          this.running.set(job.jobId, { agent: inv.agent, abort, done, progress: () => progress,
            projectId: job.projectId, runtimeJobId: handle.id })
          void done.finally(() => this.running.delete(job.jobId)).catch((error: unknown) => {
            this.ctx.logger.error('Video render receipt failed; job %s has an uncertain outcome. Inspect project files before retrying. %s',
              job.jobId, error instanceof Error ? error.message : String(error))
          })
          return { cancel: () => { abort.abort() }, done: done.then(result => ({
            status: result.state === 'completed' ? 'completed' as const : result.state === 'cancelled' ? 'killed' as const : 'failed' as const,
            detail: result.message, result: JSON.stringify({ projectId: job.projectId, jobId: job.jobId, state: result.state }),
          }), (_error: unknown) => ({ status: 'failed' as const, detail: 'Video outcome is uncertain. Inspect the project and reload verified storage.' })) }
        },
      })
      if (request.wait) {
        await this.ctx.jobs.wait(runtimeJobId, this.config.renderTimeoutMs + this.config.graceMs, inv.agent.id, inv.signal)
        await this.running.get(job.jobId)?.done
      }
      return this.status(job, false, inv)
    }
    if (action === 'status' || action === 'cancel') {
      const request = jobLocate.extend({ deliver: z.boolean().default(false) }).parse(input)
      const job = await this.job(request.projectId, request.jobId)
      if (action === 'cancel') {
        const current = this.running.get(job.jobId)
        if (current !== undefined) this.ctx.jobs.kill(current.runtimeJobId, current.agent.id, 'video cancel requested')
        await current?.done
      }
      return this.status(job, action === 'status' && request.deliver, inv)
    }
    if (action === 'delete') {
      this.writable(inv)
      const request = z.strictObject({ projectId: projectIdSchema, confirm: z.literal(true) }).parse(input)
      if ([...this.running.values()].some(job => job.projectId === request.projectId)) {
        throw new VideoError('render-active', 'Cancel this project’s active render before deleting it.')
      }
      await rm(await this.path(request.projectId), { recursive: true, force: false })
      return { deleted: request.projectId, retained: 'Previously delivered attachments and Session logs require separate deletion.' }
    }
    throw new VideoError('unknown-action', 'Unknown video action. Read the guide before retrying.')
  }
  private async entries(parts: string[]): Promise<string[]> {
    const path = await this.path(...parts)
    const target = await this.ctx.fs.resolve(path)
    if (await this.ctx.fs.stat(target) === undefined) return []
    const entries = await this.ctx.fs.listDir(target)
    return entries.map(entry => entry.name).filter(name => parts.at(-1) === 'revisions' ? idSchema.safeParse(name.replace(/\.json$/, '')).success : parts.at(-1) === 'assets' ? assetSchema.safeParse(name).success : idSchema.safeParse(name).success).sort()
  }
  private async command(argv: string[], cwd: string, policy: SandboxExecutionPolicy, signal: AbortSignal,
    progress?: (text: string) => void) {
    signal.throwIfAborted()
    const wrapped = policy.mode === 'danger-full-access' ? argv : (await this.ctx.sandbox.confine(argv, { ...policy, mode: policy.mode }, signal)).argv
    const child = this.ctx.subprocess.spawn({ argv: wrapped, cwd, signal, graceMs: this.config.graceMs,
      env: { ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: undefined },
      stdio: { stdin: 'ignore', stdout: { maxBytes: this.config.processOutputBytes }, stderr: { maxBytes: this.config.processOutputBytes } } })
    let timer: ReturnType<typeof setInterval> | undefined
    try {
      const stdoutReader = child.collected.stdout
      const stderrReader = child.collected.stderr
      if (stdoutReader === undefined || stderrReader === undefined) {
        throw new VideoError('process-collection-unavailable', 'The subprocess provider omitted collected video output. Correct the provider before retrying.')
      }
      if (progress !== undefined) timer = setInterval(() => {
        progress(stdoutReader.readFrom(0).text.slice(-this.config.progressChars))
      }, this.config.progressIntervalMs)
      const result = await child.done
      const stdout = stdoutReader.readFrom(0)
      const stderr = stderrReader.readFrom(0)
      if (progress === undefined && (stdout.lossy || stderr.lossy)) {
        throw new VideoError('process-output-limit', 'Video command output exceeded processOutputBytes. Inspect the media and increase the trusted budget before retrying.')
      }
      return { ...result, stdout: stdout.text, stderr: stderr.text }
    } finally {
      clearInterval(timer)
      child.terminate()
      await child.waitForExit()
    }
  }
  private async render(job: VideoJob, revision: VideoRevision, directory: string, inv: Invocation,
    progress: (text: string) => void): Promise<z.infer<typeof resultSchema>> {
    const deadline = AbortSignal.timeout(this.config.renderTimeoutMs)
    const signal = AbortSignal.any([inv.signal, deadline])
    const result: z.infer<typeof resultSchema> = { version: 1, state: 'failed', exitCode: null, signal: null, finishedAt: '', bytes: 0, sha256: null, diagnostics: '', message: '' }
    try {
      await mkdir(await this.path(job.projectId, 'assets'), { recursive: true, mode: 0o700 })
      for (const [file, content] of Object.entries({ 'index.tsx': compositionSource(revision), 'scene.tsx': revision.request.source ?? timelineSource,
        'props.json': JSON.stringify(revision.request.timeline === undefined ? {} : { timeline: revision.request.timeline }),
        'package.json': JSON.stringify({ private: true, type: 'module' }),
        'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx', esModuleInterop: true, module: 'ESNext', target: 'ES2020' } }),
      })) await writeFile(join(directory, file), content, { flag: 'wx', mode: 0o600, signal })
      // Remotion resolves scene imports from the job directory; aliases stay deployment-owned.
      const packages = Object.fromEntries(['react', 'react-dom', 'remotion'].map(name => [name, dirname(fileURLToPath(import.meta.resolve(name + '/package.json')))]))
      await writeFile(join(directory, 'remotion.config.js'), `import {Config} from ${JSON.stringify(fileURLToPath(import.meta.resolve('@remotion/cli/config')))};\nConfig.overrideWebpackConfig(config=>({...config,resolve:{...config.resolve,alias:{...config.resolve?.alias,...${JSON.stringify(packages)}}}}));\n`, { flag: 'wx', mode: 0o600, signal })
      const output = join(directory, job.mode === 'player' ? 'snapshot.genesis-remotion.html' : job.mode === 'still' ? 'output.png' : 'output.mp4')
      const outcome = job.mode === 'player' ? await this.buildPlayer(revision, directory, output, inv.policy, signal) : await this.command(
        [process.execPath, this.cli, job.mode === 'still' ? 'still' : 'render', join(directory, 'index.tsx'), 'GenesisVideo', output,
          '--props=' + join(directory, 'props.json'), '--public-dir=' + await this.path(job.projectId, 'assets'),
          '--browser-executable=' + this.config.browserExecutable, `--concurrency=${this.config.renderConcurrency}`,
          '--log=info', '--overwrite', '--config=' + join(directory, 'remotion.config.js'),
          ...(job.mode === 'still' ? [`--frame=${job.frame}`] : ['--codec=h264', '--pixel-format=yuv420p']),
          ...(job.mode === 'preview' ? [`--scale=${this.config.previewScale}`] : [])], directory, inv.policy, signal, progress)
      result.exitCode = outcome.exitCode; result.signal = outcome.signal
      result.diagnostics = (outcome.stdout + '\n' + outcome.stderr).slice(-this.config.progressChars)
      if (!signal.aborted && outcome.exitCode === 0) {
        const info = await lstat(output)
        if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > (job.mode === 'player' ? this.config.maxPreviewBytes : this.config.maxOutputBytes)) throw new VideoError('output-invalid', 'Rendered output is empty, exceeds maxOutputBytes or is not a regular file. Inspect the job; it will not be delivered.')
        const bytes = await this.ctx.fs.readBytes(await this.ctx.fs.resolve(output), signal, job.mode === 'player' ? this.config.maxPreviewBytes : this.config.maxOutputBytes)
        if (job.mode === 'player') {
          await this.publishText(await this.path(job.projectId, 'preview.genesis-remotion.html'), new TextDecoder().decode(bytes),
            inv, undefined, this.config.maxPreviewBytes)
        }
        result.sha256 = createHash('sha256').update(bytes).digest('hex')
        result.bytes = info.size; result.state = 'completed'; result.message = job.mode === 'player' ? 'Remotion Player compiled. Open previewPath to play and seek the live composition; compilation does not verify media decoding.'
          : 'Render completed. Inspect the delivered media before judging its visual or audio quality.'
      } else result.message = 'Remotion did not complete. Inspect the project and bounded progress, correct the source or environment, and explicitly start a new render.'
    } catch (error) {
      result.message = error instanceof VideoError ? error.message : 'Video rendering failed. Check Chromium, the Remotion source, imported media and Session sandbox permissions before starting a new render.'
      if (!signal.aborted) this.ctx.logger.warn('Video job %s failed: %s', job.jobId, error instanceof Error ? error.message : String(error))
    }
    if (signal.aborted) { result.state = deadline.aborted ? 'timed-out' : 'cancelled'; result.message = 'Rendering stopped; partial output is not a completed video. Start a new render explicitly when ready.' }
    result.finishedAt = new Date().toISOString()
    // Publication survives caller cancellation, but never expands the captured Session file policy.
    await this.write(join(directory, 'result.json'), result, { ...inv, signal: new AbortController().signal })
    return result
  }
  private async buildPlayer(revision: VideoRevision, directory: string, output: string,
    policy: SandboxExecutionPolicy, signal: AbortSignal) {
    const assets: PlayerAsset[] = []
    const names = revision.request.timeline === undefined ? await this.entries([revision.projectId, 'assets'])
      : [...new Set([...revision.request.timeline.clips, ...revision.request.timeline.audio]
        .flatMap(item => item.asset === undefined ? [] : [item.asset]))]
    const mediaTypes: Readonly<Record<string, string>> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
      mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
    let encodedBytes = 0
    for (const name of names) {
      signal.throwIfAborted()
      const target = await this.ctx.fs.resolve(await this.path(revision.projectId, 'assets', name))
      const bytes = await this.ctx.fs.readBytes(target, signal, Math.min(this.config.maxAssetBytes, this.config.maxPreviewBytes))
      encodedBytes += Math.ceil(bytes.byteLength / 3) * 4
      if (encodedBytes > this.config.maxPreviewBytes) throw new VideoError('preview-size', 'Embedded preview media exceeds maxPreviewBytes. Use shorter or smaller footage before rebuilding the Player.')
      assets.push({ name, src: `data:${mediaTypes[extname(name).slice(1)]};base64,${Buffer.from(bytes).toString('base64')}` })
    }
    const source = playerSource(revision, assets)
    if (Buffer.byteLength(source, 'utf8') > this.config.maxPreviewBytes) throw new VideoError('preview-size', 'The Player source exceeds maxPreviewBytes. Reduce source or embedded media before retrying.')
    await writeFile(join(directory, 'player.tsx'), source, { flag: 'wx', mode: 0o600, signal })
    const alias = Object.fromEntries(['react', 'react-dom', 'remotion', '@remotion/player'].map(name =>
      [name, dirname(fileURLToPath(import.meta.resolve(name + '/package.json')))]))
    const spec = {
      entryPoints: [join(directory, 'player.tsx')], outfile: join(directory, 'player.js'), bundle: true, platform: 'browser',
      format: 'iife', jsx: 'automatic', minify: true, alias, define: { 'process.env.NODE_ENV': '"production"' },
    }
    const build = `import {build} from ${JSON.stringify(import.meta.resolve('esbuild'))};\nawait build(${JSON.stringify(spec)});\n`
    const worker = join(directory, 'compile-player.mjs')
    await writeFile(worker, build, { flag: 'wx', mode: 0o600, signal })
    const outcome = await this.command([process.execPath, worker], directory, policy, signal)
    if (outcome.exitCode !== 0) return outcome
    const compiled = await this.ctx.fs.readBytes(await this.ctx.fs.resolve(join(directory, 'player.js')), signal, this.config.maxPreviewBytes)
    const html = playerHtml(new TextDecoder().decode(compiled))
    if (Buffer.byteLength(html, 'utf8') > this.config.maxPreviewBytes) throw new VideoError('preview-size', 'The compiled Player exceeds maxPreviewBytes. Use shorter or smaller footage before retrying.')
    await writeFile(output, html, { flag: 'wx', mode: 0o600, signal })
    return outcome
  }
  private async status(job: VideoJob, deliver: boolean, inv: Invocation): Promise<unknown> {
    const current = this.running.get(job.jobId)
    const resultPath = await this.path(job.projectId, 'jobs', job.jobId, 'result.json')
    const target = await this.ctx.fs.resolve(resultPath)
    const terminal = await this.ctx.fs.stat(target) === undefined ? undefined : resultSchema.parse(await this.read(resultPath))
    const status = { ...job, state: terminal?.state ?? (current === undefined ? 'interrupted' : 'running'), result: terminal ?? null, progress: current?.progress() ?? '', runtimeJobId: current?.runtimeJobId ?? null }
    const preview = job.mode === 'player' && terminal?.state === 'completed' ? {
      ...status, previewPath: await this.path(job.projectId, 'preview.genesis-remotion.html'),
      snapshotPath: await this.path(job.projectId, 'jobs', job.jobId, 'snapshot.genesis-remotion.html'),
    } : status
    if (!deliver) return preview
    if (terminal?.state !== 'completed') throw new VideoError('output-unconfirmed', 'This video has no confirmed completed output. Inspect status and explicitly render a new job; partial output cannot be delivered.')
    const output = await this.path(job.projectId, 'jobs', job.jobId, job.mode === 'player' ? 'snapshot.genesis-remotion.html' : job.mode === 'still' ? 'output.png' : 'output.mp4')
    const info = await lstat(output)
    if (!info.isFile() || info.isSymbolicLink() || info.size !== terminal.bytes) throw new VideoError('output-changed', 'Video output differs from its completion receipt. Stop and inspect the project before delivering it.')
    const file = await this.ctx.fs.resolve(output)
    const bytes = await this.ctx.fs.readBytes(file, inv.signal, job.mode === 'player' ? this.config.maxPreviewBytes : this.config.maxOutputBytes)
    if (createHash('sha256').update(bytes).digest('hex') !== terminal.sha256) throw new VideoError('output-changed', 'Video output digest differs from its completion receipt. Stop and inspect before delivering it.')
    if (job.mode === 'still') return { ...status, image: await this.ctx.attachments.saveImage({ data: bytes, mediaType: 'image/png', name: 'video-preview.png' }) }
    return { ...preview, attachment: await this.ctx.attachments.saveFile({ data: bytes, name: job.mode === 'player' ? 'preview.genesis-remotion.html' : job.mode === 'preview' ? 'video-preview.mp4' : 'video.mp4' }) }
  }
}
