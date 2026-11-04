---
kind: upgrade-guide
description: "Genesis people add optional durable conversation bindings and attributed message sources."
---

# Genesis people and QQ conversations

English | [中文](guide.zh.md)

## Change

Genesis adds optional version-1 `people` state and the `genesis-person` message source. Existing life records without people remain readable and keep their life ID and birth timestamp. Older strict Genesis readers refuse newly written people state. No SQL schema or Session format generation changes. QQ recall follows `memorySharing`: the life overlay selects `life` for shared Web/QQ memory, while standalone mounts default to `conversation` for source-audience isolation; additional tools require explicit QQ toolkit permission.

New model-facing participant data uses `qq`, `nickname`, `name`, `seenBefore` and `isOperator` instead of opaque person IDs. Custom emotion writers must target per-person proposals with `relationships[].qq`; the Host resolves these accounts to the unchanged persisted `personId`. QQ-only nickname changes and new group Sessions do not create new people. Prior raw Session logs retain their original attribution.

QQ policy saves now write row version 3; versions 1 and 2 inherit the explicit `groupAutoReply` deployment default, which is true. Automatic mode observes allowed groups without requiring mentions and lets the configured Genesis decision model choose replies. Private input bypasses this choice. Older QQ policy readers refuse version 3.

Toolkit catalogue saves use version 2 and add optional `qqAccess`; previous entries remain disabled on QQ. QQ supplies registered search tools without learning. Per-Session QQ activation grants and current-speaker checks restrict additional learned members; old activations cannot authorize them. Older catalogue readers refuse version 2.

QQ additionally requires the attachment and model services. Media/quote plugin records and independent version-1 QQ decision settings/recent receipts require matching current readers; QQ edits leave shared memory routes unchanged. See the QQ guide for decoder prerequisites, download origins and deletion.

## Migration

1. Stop the current life writer and preserve both storage domains, the independent backup and original Harness Sessions before enabling QQ. Keep the same `DSH_HOME`, routes and lease path.
2. Configure an explicit bot account, token, allowed groups/private correspondents and optional verified operator QQ account as described in the [QQ guide](../../../genesis/qq.md). An operator mapping cannot silently change after binding. Without a mapping, no QQ account inherits operator identity or relationship estimates; life-wide memory sharing remains independent of operator binding.
3. Restart with the optional overlay. Legacy operator relationship estimates copy only on an actual bound operator message. Other people begin without a relationship profile. Confirm the original identity and separate group/private Session IDs.
4. Update any custom appraisal response schemas from `relationships[].personId` to `relationships[].qq`, reload the Host and refresh the browser. Confirm one account is recognized in another allowed group while raw private conversation history remains absent; stored memories follow the selected sharing policy.
5. Confirm the Genesis decision model is configured. In Settings → QQ connection, turn off automatic group decisions to retain the previous mention-only behavior; otherwise verify an unanswered message remains available through current-conversation history. Configure each intended toolkit's QQ audience in Settings → Toolkits; operator-only tools require the bound account to speak.
6. Before downgrading, restore the complete verified pre-upgrade copy with its matching Sessions. Do not strip fields or replace unreadable identity data with an empty life. Unconfirmed QQ deliveries are not automatically resent.
