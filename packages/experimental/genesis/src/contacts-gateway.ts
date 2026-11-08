/** Operator-only contact editing and bounded address lookup. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { personIdSchema, type PersonId } from './people-model.ts'
import type { ContactCatalog, ContactInput } from './contacts-model.ts'
import { GenesisError } from './error.ts'
import { statusFailure } from './status-error.ts'

declare module '@deepseek-ai/cordis' { interface Context { genesisContacts: GenesisContactsGateway } }
/** Contact operations use the life owner's atomic persistence and writer lease. */
export class GenesisContactsGateway extends TypertRemoteService {
  static inject = ['genesis']
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  /** @param ctx - Authenticated transport and persistent life owner. */
  constructor(ctx: Context) {
    super(ctx, 'genesisContacts')
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.operations) })
  }
  private async operation<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
    AbortSignal.any([signal, this.lifetime.signal]).throwIfAborted()
    if (principalOf(this.ctx.invocation) !== undefined) throw statusFailure(new GenesisError('invalid-source', 'Contacts require operator access.'))
    const pending = run(); this.operations.add(pending)
    try { return await pending } catch (error) { throw statusFailure(error) } finally { this.operations.delete(pending) }
  }
  /** Search names and addresses.
   * @param query - Case-insensitive substring, empty for all.
   * @param offset - Zero-based page offset.
   * @param signal - Cancellation before admission.
   * @returns Bounded current contacts and continuation offset.
   */
  @Remote('inspect')
  inspect(query: string, offset: number, signal: AbortSignal): Promise<ContactCatalog> {
    return this.operation(signal, () => this.ctx.genesis.contacts(query, offset))
  }
  /** Replace a contact's editable fields.
   * @param input - Complete name, QQ, email addresses, other handles and notes.
   * @param operator - Whether this person is the single operator; selecting replaces the previous operator.
   * @param signal - Cancellation before admission; admitted writes drain on disposal.
   * @returns After the life transaction commits.
   */
  @Remote('save')
  save(input: ContactInput, operator: boolean, signal: AbortSignal): Promise<void> {
    return this.operation(signal, async () => { await this.ctx.genesis.saveContact(input, undefined, operator) })
  }
  /** Remove current contact details without deleting the person's relationship.
   * @param id - Exact person ID selected from the contact catalogue.
   * @param signal - Cancellation before admission.
   * @returns After deletion commits, including an already absent contact.
   */
  @Remote('erase')
  erase(id: PersonId, signal: AbortSignal): Promise<void> {
    return this.operation(signal, async () => { await this.ctx.genesis.deleteContact(personIdSchema.parse(id)) })
  }
}
