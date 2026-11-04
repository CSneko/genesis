/** Optional Genesis workspace and settings, with its own generated experimental Remote. @module */
import type { Context } from '@deepseek-ai/cordis'
import contribution from '@deepseek-ai/dsh-experimental-genesis/remote'
import { mountStatus } from './mount.ts'
export { inject } from './mount.ts'
export type { StatusActions, StatusPanelProps } from './StatusPanel.tsx'

/**
 * Mount the Genesis status surface through the standard browser Loader.
 * @param ctx - Browser plugin owner.
 * @returns Complete UI and Remote disposer.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> { return mountStatus(ctx, contribution) }
