/** Authenticated operator mailbox controls; external peers cannot invoke settings. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import type { MailRuntime } from './runtime.ts'
import type { MailSettings, MailMessage, MailId } from './model.ts'
import type { MailStatus } from './types.ts'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'

declare module '@deepseek-ai/cordis' { interface Context { genesisMail: MailGateway } }
declare module '@deepseek-ai/dsh-typert-protocol' { interface RemoteErrorDetailsMap { 'genesis-mail/operation': { reason: string } } }
/** Operator reads never mark mail as read by the character. */
export class MailGateway extends TypertRemoteService {
  /**
   * @param ctx - Existing authenticated Remote transport.
   * @param runtime - Exclusive mailbox owner. */
  constructor(ctx: Context, private readonly runtime: MailRuntime) { super(ctx, 'genesisMail') }
  private operation<T>(signal: AbortSignal, work: () => T | Promise<T>): Promise<T> {
    signal.throwIfAborted()
    if (principalOf(this.ctx.invocation) !== undefined) return Promise.reject(new RemoteError('genesis-mail/operation', 'Mail controls require operator access.', { reason: 'operator-required' }))
    return this.runtime.run(async () => {
      try { signal.throwIfAborted(); return await work() }
      catch (error) { throw new RemoteError('genesis-mail/operation', 'Mail operation failed. Inspect connection settings and retained delivery states before retrying.', { reason: error instanceof GenesisError ? error.code : 'operation' }, { cause: error }) }
    })
  }
  /** Read metadata and independent attention states.
   * @param folder - Folder filter or all.
   * @param query - Literal search.
   * @param offset - Page position.
   * @param signal - Caller cancellation.
   * @returns Bounded current mailbox sample.
   */
  @Remote('inspect') inspect(folder: string, query: string, offset: number, signal: AbortSignal): Promise<MailStatus> { return this.operation(signal, () => this.runtime.inspect(folder, query, offset)) }
  /** Read retained text without changing character attention.
   * @param id - Exact local mail ID.
   * @param signal - Caller cancellation.
   * @returns Current message.
   */
  @Remote('detail') detail(id: MailId, signal: AbortSignal): Promise<MailMessage> { return this.operation(signal, () => this.runtime.detail(id)) }
  /** Persist account and policy choices.
   * @param settings - Complete nonsecret draft.
   * @param revision - Displayed revision.
   * @param signal - Caller cancellation.
   * @returns Committed revision.
   */
  @Remote('save') save(settings: MailSettings, revision: number, signal: AbortSignal): Promise<number> { return this.operation(signal, () => this.runtime.save(settings, revision)) }
  /** Store/remove the account application password.
   * @param value - Password or undefined for removal.
   * @param revision - Displayed settings revision.
   * @param signal - Caller cancellation.
   * @returns After credential confirmation.
   */
  @Remote('setPassword') setPassword(value: string | undefined, revision: number, signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.runtime.setPassword(value, revision)) }
  /** Fetch a bounded batch without waiting for model processing.
   * @param signal - Caller cancellation before admission.
   * @returns After sync; background processing is independently visible.
   */
  @Remote('sync') sync(signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.runtime.sync()) }
  /** Move mail locally; no remote deletion or character read is implied.
   * @param id - Exact mail ID.
   * @param action - Local folder operation.
   * @param signal - Caller cancellation.
   * @returns After durable organization.
   */
  @Remote('organize') organize(id: MailId, action: 'archive' | 'trash' | 'restore', signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.runtime.organize(id, action, 'operator')) }
  /** Permanently remove a trashed local copy while retaining text-free deduplication.
   * @param id - Exact trashed message.
   * @param signal - Caller cancellation.
   * @returns After local deletion; server mail and Session logs remain separate.
   */
  @Remote('erase') erase(id: MailId, signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.runtime.erase(id)) }

}
