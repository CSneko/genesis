---
kind: upgrade-guide
description: "Enabling intimacy adds a persisted emotion field that older strict readers reject."
---

# Optional intimacy state requires a compatible reader

English | [中文](guide.zh.md)

## Change

Saving Sexuality and intimacy settings adds an optional version-one `intimacy` projection to the version-three Genesis emotion anchor. Existing anchors remain readable without initializing this feature. Older strict emotion readers reject anchors containing the added field. Disabling the feature retains its saved projection and does not make a rollback compatible. Session event discriminators and life identity are unchanged.

## Migration

1. Before saving intimacy settings, retain a verified copy of the life primary storage, writer backup and Session storage under the deployment's dedicated `DSH_HOME`.
2. Use the supported `dsh` profile with Genesis emotion and memory, then open Plugins → Genesis → Sexuality and intimacy. Save only if historical retention is acceptable; clearing current state retains audit events, Session logs and backups.
3. Check that desire starts at the configured baseline (normally 0.5), then restart the same profile and confirm that identity and settings remain. Missing initialized projections and invalid versions fail visibly instead of starting another life.
4. To roll back to an older reader, stop the writer and restore the verified pre-enable backup set. Do not remove fields or audit records by hand, and do not treat disabling or clearing current state as a storage conversion.
