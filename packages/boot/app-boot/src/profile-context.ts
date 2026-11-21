/** Launcher-owned profile locations and composition inputs. */
import { join } from 'node:path'
import { composeEntries, loadProfileDirectory, PROFILE_PATCH_FILENAME, type Profile } from './profile.ts'
import { loadOptionalPatches, loadOverlayPatches } from './index.ts'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

/** Application-owned package manager executable; environment applies only to package operations. */
export interface ProfilePnpmInvocation {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

/** Current profile facts; scheduling and mutation belong to their callers. */
export interface ProfileContext {
  readonly name: string
  /** Packaged applications supply their bundled runtime instead of a PATH executable. */
  readonly packageManager?: ProfilePnpmInvocation
  readonly dir: string
  readonly patchPath: string
  readonly installAnchor: string
  readonly cwd: string
  readonly home: string
  /** Bundle packages used to start this process, before any persisted edits. */
  readonly startedBundles: readonly string[]
  /** Shared writable overrides. Omit to keep every config edit profile-local. */
  readonly sharedConfig?: {
    readonly path: string
    readonly entryIds: readonly string[]
  }
  /** Parsed command-line overlays, applied above profile and home patches. */
  readonly overlays: readonly PatchOptions[]
  /** Launch-time DSH_TELEMETRY_DISABLED value; any non-empty value opts out. */
  readonly telemetryDisabledEnv: string | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Present only in a profile launched by dsh. */
    profileContext: ProfileContext
  }
}

const TELEMETRY_ROW_ID = 'session-telemetry-otel'

/**
 * Resolve the telemetry opt-out switch into its boot patch. ANY non-empty
 * value (including `'0'`/`'false'`) disables: a privacy switch prefers
 * off-by-mistake over on-by-mistake. A composition without the telemetry row
 * exports nothing, so the switch is then trivially satisfied and no patch is
 * generated — custom profiles need not mount telemetry to run with the
 * switch set.
 * @param disabledEnv - the raw `DSH_TELEMETRY_DISABLED` value (`undefined` when unset).
 * @param hasRow - whether the composition carries the telemetry row.
 * @returns the disable patch, or `undefined` when no hard-disable patch is required.
 */
export function resolveTelemetryPatch(disabledEnv: string | undefined, hasRow: boolean): PatchOptions | undefined {
  if ((disabledEnv ?? '') === '' || !hasRow) return undefined
  return { id: TELEMETRY_ROW_ID, disabled: true }
}

/** Read the selected bundles' patches, which apply before the profile patch file.
 * @param binName Diagnostic prefix for malformed or missing configuration.
 * @param context Data supplied by the profile launcher.
 * @param initialProfile Already loaded startup profile; omitted reads the current files.
 * @returns Bundle patches in application order.
 */
export function readBundlePatches(binName: string, context: ProfileContext, initialProfile?: Profile): PatchOptions[] {
  const profile = initialProfile ?? loadProfileDirectory(binName, context.dir, context.installAnchor, { userLayer: false })
  return profile.layers.flatMap(layer => layer.patches)
}

/**
 * Ignore legacy profile overrides for configs owned by the shared document.
 * @param shared Shared config ownership, if enabled for the profile.
 * @param patches Raw profile patch. Entry activation and unrelated fields are preserved.
 * @returns Profile patches used below the shared document.
 */
export function profileLocalConfigPatches(shared: ProfileContext['sharedConfig'], patches: PatchOptions[]): PatchOptions[] {
  if (shared === undefined) return patches
  return patches.map((patch) => {
    if (patch.insert !== undefined || patch.id === undefined || !shared.entryIds.includes(patch.id)) return patch
    const local = { ...patch }
    Reflect.deleteProperty(local, 'config')
    return local
  })
}

/**
 * Read the initialized shared document.
 * @param binName Diagnostic prefix.
 * @param shared Shared config ownership, if enabled for the profile.
 * @returns Only config overrides for the declared ids, or no patches if sharing is off.
 */
export function readSharedConfigPatches(binName: string, shared: ProfileContext['sharedConfig']): PatchOptions[] {
  if (shared === undefined) return []
  const patches = loadOverlayPatches(binName, shared.path)
  for (const patch of patches) {
    if (patch.id === undefined || !shared.entryIds.includes(patch.id) || !Object.hasOwn(patch, 'config')
      || Object.keys(patch).some(key => key !== 'id' && key !== 'config')) {
      throw new Error(`${binName}: ${shared.path} accepts only config overrides for ${shared.entryIds.join(', ')}`)
    }
  }
  return patches
}

/** Read current bundle and user layers with the launch-time overlays.
 * @param binName Diagnostic prefix for malformed or missing configuration.
 * @param context Data supplied by the profile launcher.
 * @param initialProfile Already loaded startup profile; omitted reads the current files.
 * @param sharedPatches Candidate edits to the shared document. Omit to read the current document.
 * @returns Detached ordered patches; this function does not update the Loader.
 */
export function readProfilePatches(
  binName: string, context: ProfileContext, initialProfile?: Profile, sharedPatches?: PatchOptions[],
): PatchOptions[] {
  const patches = structuredClone([
    ...readBundlePatches(binName, context, initialProfile),
    ...profileLocalConfigPatches(context.sharedConfig, initialProfile?.patches ?? loadOptionalPatches(binName, context.patchPath) ?? []),
    ...(sharedPatches ?? readSharedConfigPatches(binName, context.sharedConfig)),
    ...(loadOptionalPatches(binName, join(context.home, PROFILE_PATCH_FILENAME)) ?? []),
    ...context.overlays,
  ])
  const telemetryPatch = resolveTelemetryPatch(context.telemetryDisabledEnv,
    composeEntries([patches]).some(row => row.id === TELEMETRY_ROW_ID))
  if (telemetryPatch !== undefined) patches.push(telemetryPatch)
  return patches
}
