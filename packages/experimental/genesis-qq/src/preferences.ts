/** Revisioned QQ admission policy under the Genesis exclusive writer lease. @module */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import type { Config } from './config.ts'
import type { QqSettings } from './types.ts'

/**
 * Check the operator's route policy before message-specific mention and Session checks.
 * @param settings - Current operator policy.
 * @param kind - Authenticated conversation kind.
 * @param target - Canonical group or private correspondent account.
 * @returns Whether this route can accept dialogue.
 */
export function allowsConversation(settings: QqSettings, kind: 'group' | 'private', target: string): boolean {
  return settings.enabled && (kind === 'group' ? settings.allowGroups.includes(target)
    : settings.acceptPrivateFromAnyone || settings.allowUsers.includes(target))
}

const ids = z.array(z.string().regex(/^[1-9][0-9]*$/).refine(value => Number.isSafeInteger(Number(value))))
/** Admission-only settings from the first policy row generation. */
const legacySettingsSchema = z.strictObject({ enabled: z.boolean(), allowGroups: ids, allowUsers: ids,
  acceptPrivateFromAnyone: z.boolean(), replyOnlyWhenMentioned: z.boolean() })
const contextTokens = z.number().int().safe().min(1000)
/** Complete channel policy; legacy rows receive explicit deployment defaults during read. */
const versionTwoSettingsSchema = legacySettingsSchema.extend({ extraPrompt: z.string(),
  privateContextTokens: contextTokens, groupContextTokens: contextTokens, operatorContextTokens: contextTokens })
/** Current group decision policy; older rows inherit the explicit deployment choice. */
export const qqSettingsSchema = versionTwoSettingsSchema.extend({ groupAutoReply: z.boolean() })
const rowSchema = z.discriminatedUnion('schemaVersion', [
  z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().positive(), settings: legacySettingsSchema }),
  z.strictObject({ schemaVersion: z.literal(2), revision: z.number().int().positive(), settings: versionTwoSettingsSchema }),
  z.strictObject({ schemaVersion: z.literal(3), revision: z.number().int().positive(), settings: qqSettingsSchema }),
])
/** Independently versioned, mutable operator settings; absent data inherits explicit deployment values. */
export const qqPreferencesDomain = defineDomain({ name: 'genesis_qq', version: 1,
  tables: { settings: domainTable<'qq', z.infer<typeof rowSchema>>(rowSchema) } })
/** Serializes revisions and stops use after an uncertain write until storage reload. */
export class QqPreferences {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined
  /** @param domain - Exclusively owned QQ policy storage. @param config - Deployment defaults and route capacity. */
  constructor(private readonly domain: Domain<typeof qqPreferencesDomain>, private readonly config: Config) { this.read() }
  private validate(value: QqSettings): QqSettings {
    const settings = qqSettingsSchema.parse(value)
    if (settings.extraPrompt.length > this.config.maxPromptChars) {
      throw new GenesisError('capacity', 'QQ additional prompt exceeds maxPromptChars. Shorten it before saving.')
    }
    if (settings.allowGroups.length + settings.allowUsers.length > this.config.maxAllowedTargets) {
      throw new GenesisError('capacity', 'QQ allowlists exceed maxAllowedTargets. Reduce the lists before saving.')
    }
    return { ...settings, allowGroups: [...new Set(settings.allowGroups)], allowUsers: [...new Set(settings.allowUsers)] }
  }
  /** Read current policy without changing it. @returns Detached settings and revision; no credentials are returned. */
  read(): { revision: number; settings: QqSettings } {
    if (this.failure !== undefined) throw this.failure
    if (this.closing !== undefined) throw new GenesisError('closed', 'QQ settings are closing.')
    const saved = this.domain.table('settings').get('qq')
    const { allowGroups, allowUsers, acceptPrivateFromAnyone, replyOnlyWhenMentioned } = this.config
    const { extraPrompt, privateContextTokens, groupContextTokens, operatorContextTokens } = this.config
    const conversation = { groupAutoReply: this.config.groupAutoReply, extraPrompt, privateContextTokens, groupContextTokens, operatorContextTokens }
    return saved === undefined ? { revision: 0, settings: this.validate({ enabled: true,
      allowGroups, allowUsers, acceptPrivateFromAnyone, replyOnlyWhenMentioned, ...conversation }) }
      : { revision: saved.revision, settings: this.validate(saved.schemaVersion === 1 ? { ...saved.settings, ...conversation }
        : saved.schemaVersion === 2 ? { ...saved.settings, groupAutoReply: this.config.groupAutoReply } : saved.settings) }
  }
  /**
   * Replace policy with optimistic concurrency; queued operations recheck it before admission or sending.
   * @param settings - Complete untrusted operator draft.
   * @param revision - Last displayed revision.
   * @returns Committed revision; unknown writes stop all dependent channel work until reload.
   */
  save(settings: QqSettings, revision: number): Promise<number> {
    const value = this.validate(settings); this.read()
    const pending = this.tail.then(async () => {
      if (this.failure !== undefined) throw this.failure
      const current = { revision: this.domain.table('settings').get('qq')?.revision ?? 0 }
      if (current.revision !== revision) throw new GenesisError('configuration-conflict', 'QQ settings changed. Reload before saving.')
      try { await this.domain.table('settings').put('qq', { schemaVersion: 3, revision: revision + 1, settings: value }) }
      catch (error) {
        this.failure = new GenesisError('storage', 'QQ policy write has an uncertain outcome. QQ is stopped until verified storage is reloaded.', { cause: error })
        throw this.failure
      }
      return revision + 1
    })
    this.tail = pending.then(() => {}, (_error: unknown) => { /* Caller reports failures; disposal drains admitted writes. */ })
    return pending
  }
  /** Drain saves before releasing storage. @returns After the policy domain closes. */
  close(): Promise<void> { this.closing ??= this.tail.then(() => this.domain.close()); return this.closing }
}
