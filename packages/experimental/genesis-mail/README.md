---
description: "Give Genesis a durable mailbox with sleep-aware reading and autonomous text correspondence."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-mail

English | [中文](README.zh.md)

## Summary

Genesis can receive text mail, decide whether to read or reply, save drafts and send messages from a dedicated account. The source-workspace Web profile includes mailbox settings with the account disabled initially. Recipient scope defaults to unlimited, proactive sending is allowed, and a zero daily allowance means no sending quota. Sleeping pauses character processing while background reception continues.

## Table of Contents

[Use](#use) · [Implementation](#implementation) · [Further Exploration](#further-exploration) · [Model Experience](#model-experience) · [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use"></a>
## Use

Incoming notices include the name and shared relationship person ID when the sender address matches exactly one saved Genesis contact. This is an operator-provided address association, not sender authentication; ambiguous matches remain unidentified and operator permissions still require the configured mail authentication.

Start the supported source-workspace entry point:

```sh
pnpm dsh web
```

In **Settings → Mail**, save her mailbox address, account username, IMAP TLS hostname and port, SMTP hostname and port, and application password. IMAP requires implicit TLS; SMTP supports implicit TLS or mandatory STARTTLS. Save connection fields before saving the password, then enable the account. The default credential reference is `GENESIS_MAIL_PASSWORD`; no secret is returned by status, stored in mailbox state or supplied to the model. Removing a managed password does not remove an inherited environment credential. This integration uses one password for both protocols; accounts requiring OAuth need another transport.

Open **Genesis → Mail** to browse the inbox, blocked mail, drafts, sent mail, archive and trash. Search includes sender, recipient, subject and retained text; results are paginated. Opening a message here does not mark it read by Genesis. Mail is received automatically and the open page refreshes at the configured `pollMs` interval (one minute by default); **Receive mail** requests an immediate bounded synchronization. The character learns `genesis_mail` before using it; ordinary operator Life conversations can teach that exact tool name. Account setup and tool learning remain distinct from permission and successful use.

Configure unrestricted recipients, an address allowlist or a domain allowlist independently of proactive sending. Daily quotas use UTC; zero means unlimited. Each draft has one recipient and immutable text. A reply identifies an incoming local mail ID and must address its actual sender; Reply-To headers do not redirect replies. SMTP acceptance means the sending server accepted the message, not that the recipient received it. Unknown results remain visible and are never retried automatically; inspect the provider before choosing any further action.

Choose the operator in **Genesis → Contacts** and add their email addresses there. **Settings → Mail** retains only the **Trusted receiving authentication service** for sender verification; it has no independent operator address. Startup imports a saved legacy operator address into the existing operator contact, then clears the legacy setting; a missing operator contact stops this migration and retains the address. The first `Authentication-Results` field must belong to that service and report DMARC success aligned with the parsed From domain. Only configure this identifier when the receiving service prepends its own results on every delivery and removes forged results using its identifier. Otherwise leave it blank: all mail receives external-sender permissions. Display names, matching From addresses alone, forwarded messages and relationship estimates grant no authority. Existing sandbox, learned-tool, approval and stop policies still apply to authenticated operator requests.

External mail processing can access only its own sender/thread and its own drafts, execute only learning and mailbox tools, and draft replies only to its original sender. Ordinary operator Life conversations and authenticated operator mail can send proactively within the configured recipient policy. Permission is checked again at execution; reopening an old processing Session does not grant operator tools. Incoming notices carry metadata; full text is read explicitly through the logged tool result.

Normal waking or **Keep awake** admits pending mail in bounded batches; sleeping and temporary operator-only waking do not. Mail never requests a wake-up. Deferred messages become eligible at their selected time and are processed at the next eligible opportunity. A busy opened processing Session is left pending until idle. The processor borrows an idle opened Session without disposing the browser's Agent.

Folder changes are local and do not change server folders or IMAP read flags. Move mail to trash before permanently deleting its local copy. Text-free provider and tool-call receipts suppress reimport and recreation. Server mail, processing Session logs, derived memories and backups need separate deletion. Stop the runtime before whole-home backup or restore, and keep matching life, mailbox and Session data together. Missing initialized state, mismatched ownership, malformed records and uncertain writes fail visibly instead of creating a replacement mailbox.

Incoming mail passes prompt injection review before any character notification, list or read, including authenticated operator mail. Outgoing drafts pass privacy review before SMTP submission: private real names, home addresses and secrets are blocked, while public figures, public business addresses and the configured mailbox address are permitted. Both reviews reuse **Knowledge base → decision model**, including its provider or System One route. A failed outgoing review returns a tool failure; revise the content in a new draft. Review failures block the affected message and retain a diagnostic for the operator.

**Blocked mail** is visible only through operator controls. The character receives no blocked incoming notice and cannot list, search, read, reply to or release blocked mail. Moving a blocked copy through trash does not release it. Version-one mailbox data explicitly migrates to version two with pending review; older runtimes reject the new domain version, so keep a matching pre-upgrade backup before downgrading; previously exposed conversation content cannot be recalled. Review request/response Session events are retained in the private mailbox `reviews` table, outside searchable conversation Sessions, and removed with the local copy. Model-based review can make mistakes; it supplements existing tool permissions.

<a id="implementation"></a>
## Implementation

<details>
<summary>Implementation details</summary>

[The layer](cordis.patch.yml) mounts one optional mailbox beside Genesis. [The runtime](src/runtime.ts) owns bounded IMAP polling, life-bound version-two storage, independent character attention, immutable outgoing reservations and main-model processing. Each sender/thread and authority level has a separate durable Session; notices and tool results retain the exact model-visible evidence. [The transport](src/transport.ts) uses ImapFlow, MailParser and Nodemailer; raw messages are bounded before parsing, HTML is converted to retained plain text, and attachments are not exposed or executed. Full serialized state and complete tool results have separate budgets.

Polling, model requests and active tool operations drain before storage and injected owners close. A send reservation precedes SMTP submission; a restart preserves unresolved outcomes as uncertain. Uncertain notification admission is not replayed. The life initialization marker detects loss of the entire mailbox domain; initialization and receiving connectivity are separate growth observations and neither grants tools or proves SMTP delivery.

</details>

<a id="further-exploration"></a>
## Further Exploration

[Genesis service](../../../docs/subsystems/genesis.md) · [Sleep](../../../docs/genesis/sleep.md) · [Client UI](../client-ui-genesis/README.md) · [IMAP API](https://imapflow.com/docs/api/imapflow-client/) · [SMTP](https://nodemailer.com/smtp)

<a id="model-experience"></a>
## Model Experience

`genesis_mail` exposes bounded list/read, draft/send and local organization actions after learning. A mailbox processing notice identifies the exact message without supplying the entire inbox or forcing a reply. The normal main model decides how to handle it; no auxiliary model reads mail during sleep. Full message text enters a character conversation only through a tool read; the independent review model receives the bounded headers and text in a private audit Session. `refresh` checks for new mail on demand. Each processing opportunity has configurable output, step and time limits; each mail thread uses its own history and KV cache. Learning, policy and actual server acceptance remain independent facts.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

This is one text-only INBOX account using application-password authentication. OAuth, attachments, provider-side folder changes, IMAP Sent-folder uploads and delivery/bounce tracking are not implemented. The first import includes existing INBOX mail; an oversized message blocks cursor advancement until its budget is raised or it is moved out of INBOX. UID generation resets may import the same physical mail under a new provider identity. Unlimited recipients and sending quotas do not remove storage, inference, provider or operator resource limits. Uncertain notifications require inspection and explicit operator handling; they are not automatically replayed. The Loader tests replace external mail servers and model responses; live-account TLS authentication and live-model behavior require deployment verification.

## Dev Note

None.
