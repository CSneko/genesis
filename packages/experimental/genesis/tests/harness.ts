/** Isolated persistent fixtures with explicit close/reopen ownership. */
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json'
import { SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import { join } from 'node:path'
import { LifeCore } from '../src/core.ts'
import { Config } from '../src/config.ts'
import { lifeDomain, lifeRecordsDomain, type LifeState } from '../src/model.ts'

export async function openCore(
  root: string,
  medium: 'json' | 'sqlite' = 'json',
  overrides: Partial<Parameters<typeof Config>[0]> = {},
  seed?: LifeState,
) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend =
    medium === 'json' ? new JsonStorageBackend(root) : new SqliteStorageBackend({ path: join(root, 'life.sqlite'), journalMode: 'wal' })
  ctx.storage.backend.register(medium, backend)
  const facility = new DomainFacility(ctx, { backend: medium })
  const config = Config({ leasePath: join(root, 'life.lock'), ...overrides })
  const domain = await facility.open(lifeDomain)
  const records = await facility.open(lifeRecordsDomain)
  const core = new LifeCore(domain, config, records)
  try {
    if (seed !== undefined) await domain.table('states').put('life', seed)
    await core.start()
  } catch (error) {
    await records.close()
    await domain.close()
    await backend.close()
    await ctx.fiber.dispose()
    throw error
  }
  let closed = false
  return {
    core,
    domain,
    records,
    config,
    ctx,
    backend,
    async close() {
      if (closed) return
      closed = true
      try {
        await core.close()
      } finally {
        await backend.close()
        await ctx.fiber.dispose()
      }
    },
  }
}
