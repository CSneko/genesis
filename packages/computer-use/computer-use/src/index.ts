/**
 * Exclusive named registration for the computer-use capability.
 * @module @deepseek-ai/dsh-computer-use
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ComputerUseProviderName } from './brand.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    computerUse: ComputerUseRegistry
  }
}

/** One current PNG observation; callers own attachment storage and model admission. */
export interface ScreenCapture {
  /** Encoded current PNG; sharing tokens and local paths are excluded. */
  png: Uint8Array
  /** ISO 8601 timestamp assigned when the source observed this frame. */
  capturedAt: string
}

/** Read-only source; acquisition must enforce its own sharing grants on every call. */
export interface ScreenCaptureSource {
  /** Stable source name; independent of the exclusive input provider. */
  name: ComputerUseProviderName
  /**
   * Capture one current frame without requesting or restoring sharing permission.
   * @param owner - Calling Session; never substitute another Session's manual grant.
   * @param signal - Cancellation; settle owned work before rejecting.
   * @returns PNG bytes and their observation timestamp; reject when access is unavailable.
   */
  capture(owner: SessionId, signal: AbortSignal): Promise<ScreenCapture>
}

/** Read-only capture failure; it never implies that permission was granted. */
export class ScreenCaptureError extends Error {
  /**
   * @param code - Stable failure category.
   * @param message - Safe diagnosis and recovery action.
   * @param options - Optional underlying failure.
   */
  constructor(readonly code: 'source-unavailable' | 'capture-failed', message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ScreenCaptureError'
  }
}

/** Owns one optional provider registration in the shared computer-use service. */
export class ComputerUseRegistry extends Service {
  private readonly captures = new Map<ComputerUseProviderName, ScreenCaptureSource>()
  private registration: ComputerUseProviderName | undefined

  constructor(ctx: Context) {
    super(ctx, 'computerUse')
  }

  /** Name of the registered provider, including while its resources are closing. */
  get providerName(): ComputerUseProviderName | undefined {
    return this.registration
  }

  /**
   * Contribute a read-only source independently of keyboard and pointer control.
   * @param source - Provider-owned capture and permission enforcement.
   * @returns Disposer; the provider must drain captures before releasing its resources.
   */
  registerCapture(source: ScreenCaptureSource): () => Promise<void> {
    if (this.captures.has(source.name)) throw new Error(`screen capture source "${source.name}" is already registered`)
    return this.ctx.effect(() => {
      this.captures.set(source.name, source)
      return () => { this.captures.delete(source.name) }
    }, 'computerUse.registerCapture()')
  }

  /** @returns Registered source names; registration alone establishes neither permission nor successful use. */
  captureSources(): ComputerUseProviderName[] {
    return [...this.captures.keys()]
  }

  /**
   * Request one current frame from an explicitly selected source.
   * @param name - Registered source; missing providers fail without fallback.
   * @param owner - Session whose sharing grant applies.
   * @param signal - Caller cancellation.
   * @returns Current PNG observation after the provider checks access.
   */
  async capture(name: ComputerUseProviderName, owner: SessionId, signal: AbortSignal): Promise<ScreenCapture> {
    signal.throwIfAborted()
    const source = this.captures.get(name)
    if (source === undefined) throw new ScreenCaptureError('source-unavailable', `Screen source "${name}" is unavailable. Enable its capture provider.`)
    const frame = await source.capture(owner, signal)
    signal.throwIfAborted()
    return frame
  }

  /**
   * Reserve the sole provider slot until the contribution is disposed.
   * A second registration fails even when it repeats the current name. Providers
   * must stop their tools and await owned work before releasing this registration.
   * @param name - provider-owned name used in registration diagnostics.
   * @returns the effect disposer for this exact registration.
   */
  register(name: ComputerUseProviderName): () => Promise<void> {
    if (this.registration !== undefined) {
      throw new Error(`computer use provider "${this.registration}" is already registered`)
    }
    return this.ctx.effect(() => {
      this.registration = name
      return () => {
        this.registration = undefined
      }
    }, 'computerUse.register()')
  }
}

export default ComputerUseRegistry
