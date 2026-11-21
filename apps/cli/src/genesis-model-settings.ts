/** Home-wide model provider settings for the Genesis Web and Desktop compositions. */
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { dump } from 'js-yaml'
import { entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import {
  composeEntries, loadOptionalPatches, PROFILE_PATCH_FILENAME, type Profile, type ProfileContext,
} from '@deepseek-ai/dsh-app-boot'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

const MODEL_ENTRY_IDS = ['llm-pi-ai', 'llm-deepseek', 'llm-deepseek-account']

/**
 * Select the shared writable model document for the Genesis application profiles.
 * @param profile The selected profile, before legacy overrides are suppressed.
 * @param home The resolved Harness home.
 * @param higherLayers Home and launch overlays, in composition order.
 * @returns The shared document and its owned rows when Genesis is enabled.
 */
export function genesisModelSettings(
  profile: Profile, home: string, higherLayers: readonly PatchOptions[][],
): ProfileContext['sharedConfig'] {
  if (profile.name !== 'web' && profile.name !== 'desktop') return undefined
  const entries = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches, ...higherLayers])
  if (!entries.some(entry => entry.id === 'genesis' && entry.name === '@deepseek-ai/dsh-experimental-genesis'
    && entry.disabled !== true)) return undefined
  return { path: join(home, 'genesis-models.patch.yml'), entryIds: MODEL_ENTRY_IDS }
}

function providerMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !('__jsExpr' in value)
}

function mergePiAi(desktop: unknown, web: unknown): unknown {
  if (!providerMap(desktop) || !providerMap(web)) return web
  const desktopProviders = desktop['providers']
  const webProviders = web['providers']
  return {
    ...desktop, ...web,
    ...(providerMap(desktopProviders) && providerMap(webProviders)
      ? { providers: { ...desktopProviders, ...webProviders } } : {}),
  }
}

/**
 * Read the initial shared overrides without changing either legacy profile.
 * @param home The Harness home containing the legacy profile patches.
 * @returns Model overrides from both profiles, with Web winning same-provider conflicts.
 */
export function legacyGenesisModelPatches(home: string): PatchOptions[] {
  const read = (name: string): PatchOptions[] =>
    loadOptionalPatches('dsh', join(home, 'profiles', name, PROFILE_PATCH_FILENAME)) ?? []
  const desktop = read('desktop')
  const web = read('web')
  const configPatch = (rows: PatchOptions[], id: string): PatchOptions | undefined =>
    rows.findLast(row => row.id === id && row.insert === undefined && Object.hasOwn(row, 'config'))
  return MODEL_ENTRY_IDS.flatMap((id) => {
    const fromWeb = configPatch(web, id)
    const fromDesktop = configPatch(desktop, id)
    if (fromWeb === undefined && fromDesktop === undefined) return []
    const config: unknown = id === 'llm-pi-ai' && fromWeb !== undefined && fromDesktop !== undefined
      ? mergePiAi(fromDesktop.config, fromWeb.config)
      : (fromWeb ?? fromDesktop)?.config
    return [{ id, config }]
  })
}

/**
 * Seed the shared model settings once. The document itself records completion, including an empty list.
 * @param home The Harness home.
 * @param shared The selected shared settings document.
 * @returns After the file exists, with creation serialized against model edits.
 */
export async function initializeGenesisModelSettings(
  home: string, shared: NonNullable<ProfileContext['sharedConfig']>,
): Promise<void> {
  await withFileLock(shared.path, async () => {
    if (existsSync(shared.path)) return
    const rows = legacyGenesisModelPatches(home)
    await writeFileAtomic(shared.path, dump(rows, { schema: entryListSchema }), { mode: 0o600 })
  })
}
