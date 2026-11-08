/** Versioned Minecraft preferences with revision-fenced writes and explicit uncertain-write failure. @module */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { MinecraftSettings } from './types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap { 'minecraft/operation': { reason: string } }
}
/** Parser for operator settings and stored records; no passwords or API keys are stored here. */
export const settingsSchema = z.strictObject({
  enabled: z.boolean().default(false), reuseKnowledge: z.boolean().default(true), jevEnabled: z.boolean().default(false),
  jevUrl: z.url().refine((value) => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol)
    && !url.username && !url.password && !url.search && !url.hash }).default('https://api.typesafe.ai/v1/systemone'),
  jevModel: z.string().trim().min(1).max(200).default('jev-1.14.0'),
  jevKeyRef: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u).default('GENESIS_MINECRAFT_JEV_KEY'),
  intervalMs: z.number().int().min(250).max(60000).default(1000),
  timeoutMs: z.number().int().min(100).max(120000).default(10000),
  threshold: z.number().min(0).max(1).default(0.8),
  notificationIntervalMs: z.number().int().min(1000).max(300000).default(10000),
  vision: z.boolean().default(false),
  lowHealth: z.number().min(0).max(20).default(6), skillTimeoutMs: z.number().int().min(1000).max(300000).default(30000),
})
/** Explicit connection input; the default port follows Minecraft Java and version omission enables detection. */
export const connectionSchema = z.strictObject({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535).default(25565),
  username: z.string().trim().min(1).max(254),
  version: z.string().trim().max(40).default(''),
})
const legacySettings = settingsSchema.extend({
  host: connectionSchema.shape.host.default('127.0.0.1'), port: connectionSchema.shape.port,
  username: connectionSchema.shape.username.default('Genesis'), version: connectionSchema.shape.version,
  auth: z.literal('offline').default('offline'), sessionId: z.string().trim().max(300).default(''),
})
const row = z.discriminatedUnion('schemaVersion', [
  z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().positive(), settings: legacySettings }),
  z.strictObject({ schemaVersion: z.literal(2), revision: z.number().int().positive(), settings: settingsSchema }),
])
/** New independent preferences generation; invalid records are never replaced with defaults. */
export const minecraftDomain = defineDomain({ name: 'genesis_minecraft', version: 1,
  tables: { settings: domainTable<'minecraft', z.infer<typeof row>>(row),
    setup: domainTable<'toolkit', { version: 1; installed: true }>(z.strictObject({ version: z.literal(1), installed: z.literal(true) })) } })

/**
 * Create a safe transport/tool failure without including server messages or credential contents.
 * @param reason - Stable machine-readable failure reason.
 * @param options - Optional contained cause and safe guidance; omission uses standard settings/connection guidance.
 * Causes never enter model input or wire details.
 * @returns Typed failure localizable by the settings client.
 */
export function failure(reason: string, options?: ErrorOptions & { guidance?: string }): RemoteError<'minecraft/operation'> {
  const guidance = options?.guidance ?? 'Check Minecraft settings and connection status.'
  return new RemoteError('minecraft/operation', `Minecraft operation failed (${reason}). ${guidance}`, { reason }, options)
}
/** Exclusive in-process preference owner; accepted writes drain before storage closes. */
export class MinecraftPreferences {
  private tail: Promise<void> = Promise.resolve()
  private poisoned = false
  private closing: Promise<void> | undefined
  /**
   * @param domain - Exclusively opened, schema-validated settings domain.
   */
  constructor(private readonly domain: Domain<typeof minecraftDomain>) {}
  /**
   * Add the Minecraft toolkit once, preserving subsequent operator edits and removal.
   * @param install - Idempotent catalogue edit, completed before the installation receipt.
   * @returns After the receipt is durable; uncertain receipt writes stop this owner.
   */
  async installToolkit(install: () => Promise<void>): Promise<void> {
    this.read()
    if (this.domain.table('setup').get('toolkit') !== undefined) return
    await install()
    try { await this.domain.table('setup').put('toolkit', { version: 1, installed: true }) }
    catch (_error) { this.poisoned = true; throw failure('storage-unavailable') }
  }
  /**
   * Read detached settings, refusing use after uncertain storage or shutdown.
   * @returns Current revision and settings.
   */
  read(): { revision: number; settings: MinecraftSettings } {
    if (this.poisoned || this.closing !== undefined) throw failure('storage-unavailable')
    const saved = this.domain.table('settings').get('minecraft')
    return saved === undefined ? { revision: 0, settings: settingsSchema.parse({}) }
      : { revision: saved.revision, settings: saved.schemaVersion === 1
        // Version 1 connection choices are discarded after full legacy validation; monitoring preferences survive.
        ? z.object(settingsSchema.shape).parse(saved.settings) : structuredClone(saved.settings) }
  }
  /**
   * Save complete preferences; stale edits and invalid drafts do not mutate storage.
   * @param value - Complete operator draft.
   * @param revision - Last displayed revision.
   * @returns Committed revision; an uncertain write poisons this owner until reload.
   */
  save(value: MinecraftSettings, revision: number): Promise<number> {
    const settings = settingsSchema.parse(value)
    this.read()
    const task = this.tail.then(async () => {
      if (this.poisoned) throw failure('storage-unavailable')
      const current = this.domain.table('settings').get('minecraft')?.revision ?? 0
      if (current !== revision) throw failure('conflict')
      try { await this.domain.table('settings').put('minecraft', { schemaVersion: 2, revision: current + 1, settings }) }
      catch (_error) { this.poisoned = true; throw failure('storage-unavailable') }
      return current + 1
    })
    this.tail = task.then(() => {}, (_error: unknown) => { /* The caller owns reporting; close drains accepted writes. */ })
    return task
  }
  /**
   * Drain accepted writes before releasing the domain.
   * @returns After storage closes.
   */
  close(): Promise<void> { this.closing ??= this.tail.then(() => this.domain.close()); return this.closing }
}
