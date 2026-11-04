/** Bounded private worker transport; serial calls never replay interrupted input. @module */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { z } from 'zod'
import type { Config } from './config.ts'
import type {} from '@deepseek-ai/dsh-subprocess'

const Reply = z.union([
  z.strictObject({ ready: z.literal(true) }),
  z.strictObject({ id: z.number().int(), result: z.unknown() }),
])

/** Owns one local helper, its request queue, and shutdown through process quiescence. */
export class PortalClient {
  private readonly lifetime = new AbortController()
  private tail: Promise<unknown> = Promise.resolve()
  private handle: SubprocessHandle | undefined
  private requestId = 0
  private receive: ((value: z.infer<typeof Reply>) => void) | undefined
  private reject: ((error: Error) => void) | undefined

  /**
   * @param ctx - Local subprocess execution owner.
   * @param config - Validated executable and operation budgets.
   */
  constructor(private readonly ctx: Context, private readonly config: Config) {}

  /**
   * Start the worker, validate dependencies, and obtain configured startup desktop access.
   * @returns After the private readiness response.
   */
  async start(): Promise<void> {
    this.lifetime.signal.throwIfAborted()
    if (this.handle !== undefined) return
    const executable = await this.ctx.subprocess.resolveExecutable(this.config.python, {}, this.lifetime.signal)
    const root = dirname(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-experimental-computer-use-portal/package.json')))
    const handle = this.handle = this.ctx.subprocess.spawn({
      argv: [executable, '-u', join(root, 'assets/portal.py'), JSON.stringify(this.config)],
      cwd: root,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: 4096 } },
      graceMs: this.config.processGraceMs,
      signal: this.lifetime.signal,
    })
    let buffered = ''
    const ready = Promise.withResolvers<void>()
    this.reject = ready.reject
    this.receive = (value) => {
      if (!('ready' in value)) { this.fail(new Error('Desktop worker sent a response before readiness.')); return }
      ready.resolve()
    }
    const stdout = handle.stdout
    if (stdout === undefined) throw new Error('Desktop worker requires piped stdout.')
    handle.stdin?.on('error', (error) => { this.fail(error) })
    stdout.on('error', (error) => { this.fail(error) })
    stdout.setEncoding('utf8')
    stdout.on('data', (chunk: string) => {
      buffered += chunk
      if (Buffer.byteLength(buffered) > this.config.maxResponseBytes) {
        this.fail(new Error('Desktop worker response exceeds maxResponseBytes. Lower maxImageDimension.'))
        return
      }
      let end: number
      while ((end = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, end)
        buffered = buffered.slice(end + 1)
        try {
          const reply = Reply.parse(JSON.parse(line))
          if (this.receive === undefined) throw new Error('Desktop worker sent an unsolicited response.')
          this.receive(reply)
        } catch (error) {
          this.fail(new Error('Desktop worker returned invalid JSON data. Restart desktop access.', { cause: error }))
        }
      }
    })
    void handle.done.then(() => {
      const diagnostic = handle.collected.stderr?.readFrom(0).text ?? ''
      if (this.handle === handle) this.handle = undefined
      this.reject?.(new Error(`Desktop worker stopped. Reconnect and inspect before retrying input. ${diagnostic}`))
    }, (error: unknown) => {
      if (this.handle === handle) this.handle = undefined
      this.reject?.(new Error('Desktop worker failed. Reconnect before acting.', { cause: error }))
    })
    const timeout = setTimeout(() => { this.fail(new Error('Desktop worker startup timed out. Check Python/GI and portal availability.')) }, this.config.autoConnect ? this.config.startupTimeoutMs + this.config.consentTimeoutMs + this.config.callTimeoutMs : this.config.startupTimeoutMs)
    try {
      await ready.promise
    } catch (error) {
      handle.terminate()
      await handle.done
      throw error
    } finally {
      clearTimeout(timeout)
      this.receive = undefined
      this.reject = undefined
    }
  }

  /**
   * Serialize a tool operation for an authenticated Session; active cancellation closes the grant.
   * A later call can create a worker but must explicitly reconnect. Queued cancellation sends no input.
   * @param owner - Calling Agent's Session, supplied outside model arguments.
   * @param args - Validated tool parameters.
   * @param signal - Caller cancellation.
   * @returns Canonical MCP content for the shared attachment and tool-result adapter.
   */
  call(owner: SessionId, args: { action: string; appId?: string }, signal: AbortSignal): Promise<unknown> {
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    const operation = this.tail.catch((_reportedFailure: unknown) => {
      // The preceding caller owns its failure; its worker has already settled.
    }).then(async () => {
      combined.throwIfAborted()
      if (args.action === 'release' && this.handle === undefined) return undefined
      await this.start()
      combined.throwIfAborted()
      const handle = this.handle
      if (handle === undefined || handle.stdin === undefined) throw new Error('Desktop worker stopped before dispatch. Reconnect before acting.')
      const stdin = handle.stdin
      const id = ++this.requestId
      const response = Promise.withResolvers<unknown>()
      this.reject = response.reject
      this.receive = (value) => {
        if (!('id' in value) || value.id !== id) { this.fail(new Error('Desktop worker response ID mismatch. Reconnect before acting.')); return }
        response.resolve(value.result)
      }
      const abort = () => { this.fail(new Error('Desktop operation interrupted; delivered input is not rolled back. Reconnect and inspect before retrying.')) }
      combined.addEventListener('abort', abort, { once: true })
      const timeoutMs = args.action === 'connect' ? this.config.consentTimeoutMs + this.config.callTimeoutMs : this.config.callTimeoutMs
      const timeout = setTimeout(() => {
        const diagnostic = handle.collected.stderr?.readFrom(0).text ?? ''
        this.fail(new Error(`Desktop ${args.action} timed out after ${timeoutMs} ms; desktop access was closed. Reconnect and inspect before retrying input. ${diagnostic}`))
      }, timeoutMs)
      try {
        stdin.write(JSON.stringify({ id, owner, args }) + '\n', (error) => { if (error) this.fail(error) })
        return await response.promise
      } catch (error) {
        handle.terminate()
        await handle.done
        throw error
      } finally {
        clearTimeout(timeout)
        combined.removeEventListener('abort', abort)
        this.receive = undefined
        this.reject = undefined
      }
    })
    this.tail = operation
    return operation
  }

  /**
   * End a disposed Agent's grant without affecting another Session or starting a worker.
   * @param owner - Session whose Agent has completed disposal.
   * @returns After its queued release completes; rejects when shutdown prevents admission.
   */
  async release(owner: SessionId): Promise<void> {
    await this.call(owner, { action: 'release' }, this.lifetime.signal)
  }

  private fail(error: Error): void {
    this.handle?.terminate()
    this.reject?.(error)
  }

  /**
   * Stop admission, cancel active work, and drain queued calls.
   * @returns After the owned worker exits.
   */
  async close(): Promise<void> {
    this.lifetime.abort()
    const handle = this.handle
    handle?.terminate()
    await Promise.allSettled([this.tail])
    if (handle !== undefined) {
      await handle.done
      if (!await handle.waitForExit()) throw new Error('Desktop worker exit could not be confirmed. Restart the host before mounting another provider.')
    }
  }
}
