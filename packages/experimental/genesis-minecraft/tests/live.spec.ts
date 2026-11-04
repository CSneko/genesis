/** Explicit opt-in read-only smoke against an operator-owned Java server. */
import { it, expect, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import mineflayer, { type Bot } from 'mineflayer'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Config } from '../src/index.ts'
import { MinecraftRuntime } from '../src/runtime.ts'
import { connectionSchema, settingsSchema } from '../src/settings.ts'

it.skipIf(process.env.GENESIS_MINECRAFT_LIVE !== '1')('connects, sees a first-person image and refuses an interrupted observation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-live-'))
  const config = { ...Config(), chromiumPath: process.env.GENESIS_MINECRAFT_CHROMIUM ?? '/usr/bin/google-chrome' }
  const runtime = new MinecraftRuntime(config)
  const username = `Genesis${randomUUID().slice(0, 8)}`
  let companion: Bot | undefined
  let companionEnded: Promise<unknown> | undefined
  try {
    await runtime.connect({ ...settingsSchema.parse({ enabled: true, vision: true }), ...connectionSchema.parse({ host: process.env.GENESIS_MINECRAFT_HOST ?? '127.0.0.1',
      port: Number(process.env.GENESIS_MINECRAFT_PORT ?? 25565), username }) }, new AbortController().signal)
    const observed = runtime.observe()
    await runtime.act({ action: 'look', observationId: observed.id, count: 1, face: 'up',
      x: observed.position.x + 8, y: observed.position.y + 1, z: observed.position.z + 6 })
    await vi.waitFor(() => { expect(runtime.status().action).toBe('idle') })
    expect(runtime.status().failure).toBeNull()
    expect(observed.position.x).toBeTypeOf('number')
    const image = await runtime.capture()
    expect(image?.length).toBeGreaterThan(1000)
    if (process.env.GENESIS_MINECRAFT_IMAGE && image !== undefined) await writeFile(process.env.GENESIS_MINECRAFT_IMAGE, image)
    companion = mineflayer.createBot({ host: process.env.GENESIS_MINECRAFT_HOST ?? '127.0.0.1',
      port: Number(process.env.GENESIS_MINECRAFT_PORT ?? 25565), username: `Chat${randomUUID().slice(0, 8)}`,
      auth: 'offline', profilesFolder: false, logErrors: false, hideErrors: true })
    companionEnded = new Promise<void>((resolve) => { companion!.once('end', () => { resolve() }) })
    companion.on('error', (_error: Error) => { /* Spawn readiness or the test deadline reports transport failure. */ })
    await once(companion, 'spawn', { signal: AbortSignal.timeout(15000) })
    companion.whisper(username, 'private Minecraft integration test')
    await vi.waitFor(() => { expect(runtime.chats(0).messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: 'whisper', player: companion!.username, message: 'private Minecraft integration test' }),
    ])) }, { timeout: 15000 })
    const speech = runtime.chats(0).messages.at(-1)!
    expect(speech.playerId).toBeDefined()
    const replies: string[] = []
    companion.on('whisper', (_player, message) => { replies.push(message) })
    await runtime.act({ action: 'chat', observationId: runtime.observe().id, playerId: speech.playerId,
      message: 'private Minecraft reply test', count: 1, face: 'up' })
    await vi.waitFor(() => { expect(replies).toContain('private Minecraft reply test') }, { timeout: 15000 })
    runtime.stop()
    await expect(runtime.act({ action: 'look', observationId: observed.id, count: 1, face: 'up', x: 0, y: 70, z: 0 }))
      .rejects.toMatchObject({ details: { reason: 'stale-observation' } })
  } finally {
    companion?._client.socket?.destroy()
    try { await companionEnded } finally { await runtime.disconnect(); await rm(root, { recursive: true, force: true }) }
  }
  expect(runtime.status().connection).toBe('disconnected')
})

it.skipIf(process.env.GENESIS_MINECRAFT_COLLECT_LIVE !== '1')('mines and picks up two logs in an explicitly prepared disposable server world', async () => {
  const runtime = new MinecraftRuntime({ ...Config(), chromiumPath: process.env.GENESIS_MINECRAFT_CHROMIUM ?? '/usr/bin/google-chrome' })
  try {
    await runtime.connect({ ...settingsSchema.parse({ enabled: true, vision: false }), ...connectionSchema.parse({
      host: process.env.GENESIS_MINECRAFT_HOST ?? '127.0.0.1', port: Number(process.env.GENESIS_MINECRAFT_PORT ?? 25565),
      username: `Collect${randomUUID().slice(0, 8)}`, version: '1.21.1',
    }) }, new AbortController().signal)
    await vi.waitFor(() => { expect(runtime.observe('oak_log').blocks?.length).toBeGreaterThanOrEqual(2) }, { timeout: 15000 })
    const before = runtime.inventoryCount('oak_log')
    const admission = await runtime.act({ action: 'collect', observationId: runtime.observe('oak_log').id,
      blockName: 'oak_log', item: 'oak_log', count: 2, face: 'up', waitForCompletion: true })
    expect(await admission.completion).toMatchObject({ outcome: 'completed', failure: null,
      collection: { before, gained: 2, minedBlocks: 2 } })
    expect(runtime.inventoryCount('oak_log') - before).toBe(2)
    expect(runtime.observe('oak_log').blocks).toHaveLength(0)
    expect(runtime.observe().lastAction).toMatchObject({ action: 'collect', outcome: 'completed', collection: { gained: 2 } })
  } finally { await runtime.disconnect() }
})
