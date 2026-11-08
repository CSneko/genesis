---
kind: upgrade-guide
description: "Genesis mail requires knowledge base decision review before reading incoming mail or sending drafts."
---

# Genesis mail review

English | [中文](guide.zh.md)

## Change

Genesis mail now reviews incoming messages for prompt injection and outgoing drafts for private identifying information and secrets, using the knowledge base decision model. Unreviewed incoming mail is hidden from the character. Blocked mail remains available to the operator and cannot be released by restoring it from trash. Review service failures block the affected message. The mailbox domain migrates from version one to version two with existing records pending review; existing conversation content is retained. Older runtimes reject version two. Back up the matching mailbox and life state before upgrading; restore that backup before downgrading.

## Migration

1. Configure **Settings → Knowledge base → decision model** before using mail. The existing provider and System One routes are supported; no separate mail model is needed.
2. Restart through `pnpm dsh web`. Open **Genesis → Mail**; incoming synchronization and the open page update automatically, using `pollMs` (default one minute).
3. Inspect **Blocked mail** for rejected incoming messages or drafts. A blocked send returns a tool failure; fix the content or decision model and create a new draft. Public figures and public company addresses are permitted. See the [mail guide](../../../../packages/experimental/genesis-mail/README.md) for review audit storage and deletion.
