---
kind: upgrade-guide
description: "Genesis cognition owns proactive communication and permits learned inline tools and registered workspace selection."
---

# Genesis cognition and initiative

English | [中文](guide.zh.md)

## Change

When Genesis composes both `spontaneity` and `socialInitiative`, cognition owns new communication choices. The independent message timer and event decisions stop; the existing outbox retains channel policy, delivery limits and receipt recovery. Undispatched opportunities are marked skipped without replay. The UI combines these controls and receipts under Genesis → Cognition and initiative.

The default `spontaneity.tools` becomes `['*']`, permitting learned, active inline tools during exploration. `genesis_workspace` can enter registered workspaces and temporarily authorize the selected directory for the internal Session under `workspace-write`. Read-only policy, operator stops and learning remain enforced. Delegation, jobs, general messaging, scheduling and PTC remain excluded.

The workspace `cordis.life.patch.yml` changes the default file policy from `workspace-write` to `danger-full-access`, including private cognition whose source conversation has no stricter Session override. Available file and shell tools can modify files outside the workspace under operating-system permissions. `DSH_PERMISSION_MODE` and later policy patches remain explicit deployment overrides.

## Migration

1. Restart the existing `dsh` profile with the same `DSH_HOME`; no life or Session data migration is required.
2. Open Genesis → Cognition and initiative. Enable cognition and, for proactive Web delivery, enable its channel policy. Existing QQ proactive destination allowlists remain required.
3. To retain the former tool restriction, explicitly set `spontaneity.tools: [read, write, edit, genesis_record, genesis_toolkit]` in the Genesis plugin configuration.
4. Register intended directories as existing workspaces. After a real Life exchange, inspect the next activity and its recorded tool results; selecting a workspace does not resume its conversations. See [cognition](../../../genesis/spontaneity.md).
5. To retain workspace-only writes, set `DSH_PERMISSION_MODE=workspace-write` when launching, or add a later `sandbox-policy` patch with `config.mode: workspace-write`. Existing explicit Session modes remain authoritative.
