/** Runtime inventory gates controls independently of volatile Settings fields. @module */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import { brandString } from '@deepseek-ai/dsh-brand'
import { mountOptionalCapabilities } from '../src/client/optional-mount.ts'
let ctx: Context | undefined
afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
})
it('mounts active plugin controls without a settings schema and withdraws them when the plugin stops', async () => {
  ctx = new Context()
  let changed: (() => void) | undefined
  let inventory: PluginInventorySnapshot = {
    entries: [
      {
        entryId: brandString<PluginInventorySnapshot['entries'][number]['entryId']>('fixture'),
        moduleName: 'fixture',
        enabled: true,
        fiberPhase: 'active',
      },
    ],
  }
  const remote = {
    pluginInventory: { list: async () => ({ ok: true, value: inventory }) },
    $on: (_event: string, listener: () => void) => {
      changed = listener
      return () => {
        changed = undefined
      }
    },
  }
  ctx.provide('remote', remote as never)
  ctx.provide('slots', {} as never)
  ctx.provide('resources', {} as never)
  ctx.provide('locale', {} as never)
  ctx.provide('uiWorkspace', {} as never)
  const unmount = vi.fn(async () => {})
  const mount = vi.fn(async () => unmount)
  mountOptionalCapabilities(ctx, [{ packageName: 'fixture', mount }])
  await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(1))
  inventory = { entries: [] }
  changed?.()
  await vi.waitFor(() => expect(unmount).toHaveBeenCalledTimes(1))
  await ctx.fiber.dispose()
  expect(changed).toBeUndefined()
  expect(unmount).toHaveBeenCalledTimes(1)
})
