/** Authenticated people management never grants authority to QQ participants. @module */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { LifeEventId } from './model.ts'
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { SessionId } from '@deepseek-ai/dsh-session'
import { z } from 'zod'
import { personIdSchema, type PersonId, type LifePerson } from './people-model.ts'
import { GenesisError } from './error.ts'
import { statusFailure } from './status-error.ts'
import type { Config } from './config.ts'
import type { PeopleCatalog, PersonSummary, PersonDetail, PersonEvidence } from './people-status.ts'
import type { LifeState } from './model.ts'

declare module '@deepseek-ai/cordis' { interface Context { genesisPeople: GenesisPeopleGateway } }
const sourceIdSchema = z.uuid().transform(brandString<LifeEventId>)
const evidenceSchema = z.looseObject({ personId: personIdSchema, reason: z.string(),
  appraisal: z.looseObject({ summary: z.string() }), sourceEventIds: z.array(sourceIdSchema) })
function summary(person: LifePerson, state: LifeState): PersonSummary {
  return { id: person.id, name: person.name, accountId: person.accountId, updatedAt: person.updatedAt,
    operator: person.id === state.people?.operatorPersonId, relationship: person.relationship, evidenceCount: person.sourceEventIds.length }
}
/** Operator-only, paged relationship inspection and explicit retention deletion. */
export class GenesisPeopleGateway extends TypertRemoteService {
  static inject = ['genesis']
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  /** @param ctx - Authenticated transport and persistent life owner. @param config - Shared query and response budgets. */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'genesisPeople')
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.operations) })
  }
  private async operation<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
    AbortSignal.any([signal, this.lifetime.signal]).throwIfAborted()
    if (principalOf(this.ctx.invocation) !== undefined) throw statusFailure(new GenesisError('invalid-source', 'People management requires operator access.'))
    const pending = run(); this.operations.add(pending)
    try { return await pending } catch (error) { throw statusFailure(error) } finally { this.operations.delete(pending) }
  }
  private bounded<T>(value: T): T {
    if (JSON.stringify(value).length > this.config.resultChars) throw new GenesisError('capacity', 'People response exceeds resultChars. Increase the response budget before retrying.')
    return value
  }
  /**
   * List current retained profiles in stable ID order without creating profiles for strangers.
   * @param offset - Zero-based page offset.
   * @param signal - Caller cancellation before admission.
   * @returns One bounded page, total count and continuation offset.
   */
  @Remote('inspect')
  inspect(offset: number, signal: AbortSignal): Promise<PeopleCatalog> {
    return this.operation(signal, async () => {
      z.number().int().nonnegative().parse(offset)
      const state = await this.ctx.genesis.snapshot()
      const all = [...(state.people?.people ?? [])].sort((a, b) => a.id.localeCompare(b.id))
      const items = all.slice(offset, offset + this.config.queryLimit).map(person => summary(person, state))
      const result = { items, total: all.length, nextOffset: offset + items.length < all.length ? offset + items.length : null }
      while (items.length > 1 && JSON.stringify(result).length > this.config.resultChars) {
        items.pop(); result.nextOffset = offset + items.length
      }
      return this.bounded(result)
    })
  }
  /**
   * Read relationship appraisals with links to their actual source Sessions.
   * @param id - Stable person identity selected from the catalogue.
   * @param offset - Evidence page offset, newest first.
   * @param signal - Caller cancellation before admission.
   * @returns Current profile and a bounded evidence page; missing profiles fail visibly.
   */
  @Remote('detail')
  detail(id: PersonId, offset: number, signal: AbortSignal): Promise<PersonDetail> {
    return this.operation(signal, async () => {
      personIdSchema.parse(id); z.number().int().nonnegative().parse(offset)
      const state = await this.ctx.genesis.snapshot()
      const person = state.people?.people.find(item => item.id === id)
      if (person === undefined) throw new GenesisError('invalid-source', 'This person is no longer retained. Refresh the people list.')
      const byId = new Map(state.events.map(event => [event.id, event]))
      const evidence: PersonEvidence[] = []
      for (const event of [...state.events].reverse()) {
        const proposals = event.type === 'emotion.reviewed' && Array.isArray(event.payload['people']) ? event.payload['people'] : []
        const proposal = proposals.find(item => item !== null && typeof item === 'object' && !Array.isArray(item) && item['personId'] === id)
        const migration = event.type === 'person.migrated' && event.payload['personId'] === id
        if (proposal === undefined && !migration) continue
        const parsed = proposal === undefined ? undefined : evidenceSchema.parse(proposal)
        const sourceIds = parsed?.sourceEventIds ?? (Array.isArray(event.payload['sourceEventIds']) ? z.array(sourceIdSchema).parse(event.payload['sourceEventIds']) : [])
        const sources = sourceIds.map((sourceId) => {
          const source = byId.get(sourceId)
          if (source === undefined) throw new GenesisError('invalid-source', 'Relationship evidence is incomplete. Inspect life storage before retrying.')
          return { id: source.id, sessionId: source.relatedSessionId === undefined ? null : SessionId(source.relatedSessionId), eventId: source.relatedEventId ?? null }
        })
        evidence.push({ id: event.id, timestamp: event.timestamp, kind: migration ? 'migration' : 'appraisal',
          reason: parsed?.reason ?? '', summary: parsed?.appraisal.summary ?? '', sources })
      }
      const events = evidence.slice(offset, offset + this.config.queryLimit)
      const result = { person: summary(person, state), events, total: evidence.length,
        nextOffset: offset + events.length < evidence.length ? offset + events.length : null }
      while (events.length > 1 && JSON.stringify(result).length > this.config.resultChars) {
        events.pop(); result.nextOffset = offset + events.length
      }
      return this.bounded(result)
    })
  }
  /**
   * Remove a displayed relationship and its dependent memories without deleting original Session audits.
   * @param id - Explicit operator-selected stable identity.
   * @param updatedAt - Displayed profile version; concurrent changes refuse deletion.
   * @param signal - Caller cancellation before admission; accepted writes drain on teardown.
   * @returns After the retained profile and dependent memories are durably removed.
   */
  @Remote('forget')
  forget(id: PersonId, updatedAt: string, signal: AbortSignal): Promise<void> {
    return this.operation(signal, async () => {
      personIdSchema.parse(id); z.iso.datetime().parse(updatedAt)
      await this.ctx.genesis.forgetPerson(id, updatedAt)
    })
  }
}
