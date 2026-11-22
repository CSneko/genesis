import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { prepareRuntimeArchives } from '../scripts/prepare-runtime-archives.ts'

it('rejects altered archive bytes with the current workspace lockfile', async () => {
  const lockfile = resolve(import.meta.dirname, '../../../pnpm-lock.yaml')
  const project = await mkdtemp(join(tmpdir(), 'desktop-runtime-archives-'))
  const fetchArchive = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('altered archive'))
  try {
    await expect(prepareRuntimeArchives(project, lockfile)).rejects.toThrow('archive integrity mismatch')
    expect(fetchArchive).toHaveBeenCalledTimes(1)
    expect(await readdir(join(project, 'genesis-archives'))).toEqual([])
  } finally {
    fetchArchive.mockRestore()
    await rm(project, { recursive: true, force: true })
  }
})

it('reports a missing archive pin before downloading or staging any archive', async () => {
  const project = await mkdtemp(join(tmpdir(), 'desktop-runtime-archives-'))
  const lockfile = join(project, 'pnpm-lock.yaml')
  const archive = 'archive contents'
  const tarball = 'https://example.test/dsh-bili-humanism.tgz'
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`
  const fetchArchive = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(archive))
  try {
    await writeFile(lockfile, JSON.stringify({
      packages: { [`dsh-bili-humanism@${tarball}`]: { resolution: { tarball, integrity } } },
    }))
    await expect(prepareRuntimeArchives(project, lockfile)).rejects.toThrow(`expected one integrity-pinned archive for dsh-see-now in ${lockfile}`)
    expect(fetchArchive).not.toHaveBeenCalled()
    expect(await readdir(project)).toEqual(['pnpm-lock.yaml'])
  } finally {
    fetchArchive.mockRestore()
    await rm(project, { recursive: true, force: true })
  }
})
