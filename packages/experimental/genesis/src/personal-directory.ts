/** Persistent host directory with a scoped, identity-pinned sandbox grant. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type { BigIntStats } from 'node:fs'
import { mkdir, lstat, realpath } from 'node:fs/promises'
import { isAbsolute, parse } from 'node:path'
import type { LifeCore } from './core.ts'
import { GenesisError } from './error.ts'
import { lifeReads } from './memory-access.ts'

async function isDirectoryAlias(recordedPath: string, current: BigIntStats): Promise<boolean> {
  try {
    const recorded = await lstat(recordedPath, { bigint: true })
    return recorded.isDirectory() && current.ino !== 0n && recorded.dev === current.dev
      && recorded.ino === current.ino && await realpath(recordedPath) === recordedPath
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false
    throw error
  }
}

/**
 * Prepare one private directory and register its explicit cross-workspace grant.
 * @param ctx - Grant owner; disposal removes the registered permission.
 * @param core - Stable life and learned capability owner.
 * @param path - Configured absolute directory, outside identity and credential storage files.
 * @param participates - Whether the requesting session belongs to this life.
 * @returns Canonical path recorded in life history. An alternate mount of the same directory uses the recorded path.
 * @throws If the configured directory is invalid or differs from the recorded directory.
 */
export async function preparePersonalDirectory(ctx: Context, core: LifeCore, path: string,
  participates: (session: Session | undefined) => boolean): Promise<string> {
  if (!isAbsolute(path) || path === parse(path).root) throw new GenesisError('invalid-state', 'personalDirectory must name a private absolute directory, not a filesystem root.')
  const policy = ctx.sandboxPolicy
  const recorded = await core[lifeReads].eventByKey('personal-directory')
  if (recorded === undefined) await mkdir(path, { recursive: true, mode: 0o700 })
  const info = await lstat(path, { bigint: true })
  if (!info.isDirectory() || (process.platform !== 'win32'
    && ((info.mode & 0o077n) !== 0n || Number(info.uid) !== process.getuid?.()))) {
    throw new GenesisError('invalid-state', 'personalDirectory must be an owned private directory without a symbolic-link endpoint.')
  }
  const canonical = await realpath(path)
  const recordedPath = recorded?.payload['path']
  const personal = typeof recordedPath === 'string' && recordedPath !== canonical && await isDirectoryAlias(recordedPath, info)
    ? recordedPath : canonical
  await core.setPersonalDirectory(personal)
  ctx.effect(() => policy.registerWritableDirectory(personal, (session) => {
    if (!participates(session)) return false
    const learned = core.learningStatus().tools
    return learned.includes('read') && learned.includes('write')
  }))
  return personal
}
