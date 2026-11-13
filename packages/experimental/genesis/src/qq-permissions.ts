/** Revisioned operator QQ permissions; uncertain writes stop all dependent authorization. @module */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import type { QqPermissionRule, QqPermissionStatus } from './qq-permission-types.ts'
import type { LifeConversation } from './people-model.ts'
import type { Config } from './config.ts'
import { GenesisError } from './error.ts'

/** Exact tool name, prefix wildcard or all tools; invalid durable rules never grant authority. */
export const qqPermissionRuleSchema = z.strictObject({
  scope: z.enum(['person', 'group']),
  target: z
    .string()
    .regex(/^[1-9][0-9]*$/u)
    .refine(value => Number.isSafeInteger(Number(value))),
  tool: z
    .string()
    .trim()
    .max(512)
    .regex(/^(?:\*|[^\s*]+\*?)$/u),
  effect: z.enum(['allow', 'deny']),
})
const rulesSchema = z
  .array(qqPermissionRuleSchema)
  .refine(
    rules => new Set(rules.map(rule => `${rule.scope}:${rule.target}:${rule.tool}`)).size === rules.length,
    'Duplicate QQ permission rules.',
  )
const rowSchema = z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().positive(), rules: rulesSchema })
/** Independent operator policy; absence retains existing QQ restrictions. */
export const qqPermissionsDomain = defineDomain({
  name: 'genesis_qq_permissions',
  version: 1,
  tables: { settings: domainTable<'policy', z.infer<typeof rowSchema>>(rowSchema) },
})
/** Revision checks and accepted writes serialize; uncertain storage stops all dependent reads. */
export class QqPermissions {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined
  /** @param domain - Exclusively owned policy. @param config - Existing storage and response bounds. */
  constructor(
    private readonly domain: Domain<typeof qqPermissionsDomain>,
    private readonly config: Config,
  ) {
    this.read()
  }
  private validate(value: QqPermissionRule[]): QqPermissionRule[] {
    const rules = rulesSchema.parse(value)
    if (
      rules.length > this.config.maxRecords ||
      JSON.stringify({ revision: Number.MAX_SAFE_INTEGER, rules }).length > Math.min(this.config.maxStateChars, this.config.resultChars)
    ) {
      throw new GenesisError('capacity', 'QQ permissions exceed configured storage or response limits. Reduce the rules.')
    }
    return rules
  }
  /** Read confirmed policy. @returns Detached rules; damaged or uncertain storage fails visibly. */
  read(): QqPermissionStatus {
    if (this.failure !== undefined) throw this.failure
    if (this.closing !== undefined) throw new GenesisError('closed', 'QQ permissions are closing.')
    const saved = this.domain.table('settings').get('policy')
    return saved === undefined ? { revision: 0, rules: [] } : { revision: saved.revision, rules: this.validate(saved.rules) }
  }
  /** Select declarations before pending input is committed; execution checks the actual speaker.
   * @param conversation - Verified route; any person can speak in a group.
   * @param tool - Actual registered tool name.
   * @returns Whether an allow rule could apply to a speaker on this route; this grants no execution authority.
   */
  advertises(conversation: LifeConversation, tool: string): boolean {
    const target = conversation.id.split(':')[3]
    return this.read().rules.some(
      rule =>
        rule.effect === 'allow' &&
        (rule.scope === 'group'
          ? conversation.kind === 'group' && rule.target === target
          : conversation.kind === 'group' || rule.target === target) &&
        (rule.tool.endsWith('*') ? tool.startsWith(rule.tool.slice(0, -1)) : tool === rule.tool),
    )
  }
  /**
   * Resolve a tool rule for the current authenticated speaker.
   * @param account - Verified QQ account.
   * @param group - Verified group, absent in a private conversation.
   * @param tool - Actual tool name.
   * @returns Person rules override group rules; longest matching prefix wins, then exact names.
   */
  decision(account: string, group: string | undefined, tool: string): 'allow' | 'deny' | undefined {
    const rules = this.read().rules.filter(
      rule =>
        (rule.scope === 'person' ? rule.target === account : rule.target === group) &&
        (rule.tool.endsWith('*') ? tool.startsWith(rule.tool.slice(0, -1)) : tool === rule.tool),
    )
    rules.sort(
      (a, b) =>
        Number(b.scope === 'person') - Number(a.scope === 'person') ||
        b.tool.replace(/\*$/u, '').length - a.tool.replace(/\*$/u, '').length ||
        Number(a.tool.endsWith('*')) - Number(b.tool.endsWith('*')),
    )
    return rules[0]?.effect
  }
  /**
   * Replace confirmed permissions; stale revisions and invalid rules do not change authority.
   * @param value - Operator rules; grants never install, teach tools or override sandbox permissions.
   * @param revision - Last inspected revision; stale edits are refused.
   * @returns Committed revision; uncertain writes stop use until verified reload.
   */
  save(value: QqPermissionRule[], revision: number): Promise<number> {
    const rules = this.validate(value)
    z.number().int().safe().nonnegative().parse(revision)
    this.read()
    const operation = this.tail.then(async () => {
      if (this.failure !== undefined) throw this.failure
      const current = this.domain.table('settings').get('policy')?.revision ?? 0
      if (current !== revision) throw new GenesisError('configuration-conflict', 'QQ permissions changed. Reload before saving again.')
      try {
        await this.domain.table('settings').put('policy', { schemaVersion: 1, revision: current + 1, rules })
      } catch (error) {
        this.failure = new GenesisError(
          'storage',
          'QQ permissions write has an uncertain outcome. Stop QQ tool use and reload verified storage.',
          { cause: error },
        )
        throw this.failure
      }
      return current + 1
    })
    this.tail = operation.then(
      () => {},
      (_error: unknown) => {
        /* The caller reports errors; teardown drains accepted writes. */
      },
    )
    return operation
  }
  /** Drain admitted saves before releasing storage. @returns After the domain closes. */
  close(): Promise<void> {
    this.closing ??= this.tail.then(() => this.domain.close())
    return this.closing
  }
}
