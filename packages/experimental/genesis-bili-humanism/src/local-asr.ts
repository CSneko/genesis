/** Learnable local ASR through the pinned reader's public maintenance commands and managed subprocesses. @module */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-subprocess'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { mkdtemp, writeFile, rm, lstat } from 'node:fs/promises'
import { dirname, join, relative, isAbsolute, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

/** Trusted budgets for one audio download and CPU transcription. */
export interface LocalAsrConfig {
  /** Shared deadline for both maintenance commands, including CPU transcription. */
  timeoutMs: number
  /** Grace period before managed subprocess termination escalates. */
  graceMs: number
  /** Per-stream collection limit; truncated results are refused. */
  maxOutputBytes: number
}
/** Parent-resolved deployment; callers cannot select executable, credentials, paths or budgets. */
export interface Config extends LocalAsrConfig {
  dataDir: string
  credentialPath: string
  pythonPath: string
  asrModelPath: string
  maxReadTokens: number
  maxMediaSeconds?: number
}

const audioSchema = z.object({ result: z.object({ path: z.string() }) })
const sourceSchema = z.object({ result: z.object({ id: z.uuid(), bvid: z.string().max(32), page: z.number().int().positive(),
  title: z.string().max(1000), author: z.string().max(300), url: z.url().max(1000), route: z.literal('A3'),
  duration: z.number().positive(), coverage: z.json(), segments: z.array(z.object({ start: z.number().nonnegative(),
    end: z.number().nullable(), text: z.string(), source: z.string() })) }) })
const faultSchema = z.object({ error: z.string().min(1).max(128), message: z.string().max(2000) })

/** Local transcription failure; raw child stderr and private configuration are not exposed. */
export class LocalAsrError extends Error {
  /** @param code - Stable upstream or adapter failure code. @param message - Safe recovery guidance. */
  constructor(readonly code: string, message: string) { super(message); this.name = 'LocalAsrError' }
}

/** Child plugin identifier. */
export const name = 'genesis-bili-local-asr'
/** Managed process ownership is required before exposing transcription. */
export const inject = ['subprocess', 'tools']

/**
 * Register a reading-ID-only tool; downloads never install packages or models and never write to the platform.
 * @param ctx - Injected process and tool owner; unloading aborts and joins accepted operations.
 * @param config - Parent-resolved private paths and execution budgets.
 */
export function apply(ctx: Context, config: Config): void {
  const cli = fileURLToPath(new URL('bin/cli.mjs', import.meta.resolve('dsh-bili-humanism')))
  const lifetime = new AbortController()
  const active = new Set<Promise<unknown>>()
  const transcribe = async (readingId: string, signal: AbortSignal) => {
    using timeout = deadline(AbortSignal.any([signal, lifetime.signal]), config.timeoutMs, 'ASR_TIMEOUT')
    timeout.signal.throwIfAborted()
    const directory = await mkdtemp(join(config.dataDir, 'asr-operation-'))
    try {
      const path = join(directory, 'config.json')
      await writeFile(path, JSON.stringify({ dataDir: config.dataDir, credentialPath: config.credentialPath,
        pythonPath: config.pythonPath, asrModelPath: config.asrModelPath, maxReadTokens: config.maxReadTokens,
        ...(config.maxMediaSeconds === undefined ? {} : { maxMediaSeconds: config.maxMediaSeconds }),
        enablePersonalityLearning: false, enableDailyFetching: false,
        enableHistoryWrites: false, enableFavoriteWrites: false, enableLikeWrites: false, enableCoinWrites: false,
      }), { flag: 'wx', mode: 0o600 })
      const run = async (args: string[]): Promise<unknown> => {
        timeout.signal.throwIfAborted()
        const child = ctx.subprocess.spawn({ argv: [process.execPath, cli, ...args], cwd: dirname(cli),
          graceMs: config.graceMs, signal: timeout.signal,
          env: { BILI_HUMANISM_CONFIG_FILE: path, BILI_HUMANISM_HOME: config.dataDir,
            BILI_HUMANISM_CREDENTIAL_FILE: undefined, BILI_HUMANISM_PYTHON: config.pythonPath || undefined,
            ELECTRON_RUN_AS_NODE: '1' },
          stdio: { stdin: 'ignore', stdout: { maxBytes: config.maxOutputBytes }, stderr: { maxBytes: config.maxOutputBytes } },
        })
        try {
          const outcome = await child.done
          timeout.signal.throwIfAborted()
          const stdout = child.collected.stdout?.readFrom(0)
          const stderr = child.collected.stderr?.readFrom(0)
          if (stdout === undefined || stderr === undefined || stdout.lossy || stderr.lossy) {
            throw new LocalAsrError('ASR_OUTPUT_LIMIT', 'Local ASR output exceeded maxOutputBytes. Inspect the source ledger before retrying.')
          }
          if (outcome.exitCode !== 0) {
            for (const line of stderr.text.trim().split('\n').reverse()) {
              let failure: unknown
              try { failure = JSON.parse(line) } catch (_error) { continue /* Node warnings are not upstream failure records. */ }
              const parsed = faultSchema.safeParse(failure)
              if (parsed.success) throw new LocalAsrError(parsed.data.error, parsed.data.message)
            }
            throw new LocalAsrError('ASR_FAILED', 'Local ASR failed. Check the media environment with the trusted local doctor command.')
          }
          try { return JSON.parse(stdout.text) } catch (_error) {
            throw new LocalAsrError('ASR_OUTPUT_INVALID', 'Local ASR returned invalid JSON. Inspect the private ledger before retrying.')
          }
        } finally { child.terminate(); await child.waitForExit() }
      }
      const audio = audioSchema.parse(await run(['audio', readingId])).result.path
      const rel = relative(join(config.dataDir, 'assets'), audio)
      if (!isAbsolute(audio) || !rel || rel.startsWith('..') || isAbsolute(rel) || extname(audio) !== '.m4s'
        || !(await lstat(audio)).isFile() || (await lstat(audio)).isSymbolicLink()) {
        throw new LocalAsrError('ASR_AUDIO_INVALID', 'The reader returned an invalid private audio asset. Stop and inspect the ledger.')
      }
      const source = sourceSchema.parse(await run(['local-asr', readingId, audio])).result
      const { segments, ...metadata } = source
      return { result: { ...metadata, segment_count: segments.length, next_offset: 0,
        localEvidence: 'Local machine ASR; not verified verbatim. Read transcript pages with bili_humanism_source and check names against the source.' } }
    } finally { await rm(directory, { recursive: true, force: true }) }
  }
  ctx.tools.register(defineTool({
    name: 'bili_humanism_transcribe',
    description: 'Download audio for an existing Bilibili reading and transcribe it locally with the already installed CPU ASR model. Supply only the saved reading ID, including from an unconfirmed subtitle result. No credential, executable or local path parameters; no dependency installation or platform writes. Returns an A3 source ID and coverage; call bili_humanism_source with that ID to read machine-transcribed text pages. ASR can mishear names and does not establish full visual viewing.',
    parameters: { readingId: { type: 'string', required: true, description: 'Existing saved reading UUID.' } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const id = z.uuid().parse(args.readingId)
      const operation = transcribe(id, exec.signal)
      active.add(operation)
      try { return await operation } finally { active.delete(operation) }
    },
    presentCall: () => ({ card: 'generic', title: 'Bilibili ASR', kind: 'read' }),
  }))
  ctx.effect(() => async () => { lifetime.abort(); await Promise.allSettled(active) })
}
