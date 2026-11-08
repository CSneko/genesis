---
kind: upgrade-guide
description: "Genesis Contacts owns the operator identity instead of separate QQ and mailbox operator settings."
---

# Genesis contact operator

English | [中文](guide.zh.md)

## Change

Genesis → Contacts owns the single operator identity shared by QQ and email. The separate operator account inputs are removed from QQ and Mail settings. New QQ relationships create or attach a contact with the same person ID. Startup backfills retained relationships, preserves the saved QQ operator binding, and imports the legacy mailbox operator address into that operator contact. Sender-domain authentication remains required for operator email; an address match alone grants no authority.

## Migration

1. Stop the existing Genesis writer and retain a matching backup of life, mailbox and Session storage before restarting the existing profile with the updated build. Life identity and existing relationship IDs remain unchanged. Do not run an older writer against migrated storage; restore the backup for rollback.
2. Open Genesis → Contacts and verify the imported people and the operator checkbox. Add or correct the operator's email addresses there. Selecting a different operator replaces the previous selection. If no operator contact exists for a legacy mailbox address, startup retains that address and reports the incomplete migration; establish the operator contact before retrying.
3. Keep the receiving authentication service configured in Settings → Mail. Model tools cannot select the operator or modify operator addresses. Current contact selection is checked again when QQ or authenticated mail uses operator tools.
