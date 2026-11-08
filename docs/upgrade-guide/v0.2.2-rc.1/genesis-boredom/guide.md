---
kind: upgrade-guide
description: "Genesis affect anchors and thought receipts gain boredom and autonomous conversation fields that older strict readers reject."
---

# Genesis boredom and idle conversation

English | [中文](guide.zh.md)

## Change

Version-three affect anchors gain optional `boredom` state. Existing anchors are accepted, then receive an explicit initialization record without replacing life identity or historical events. Boredom excludes stopped-process time even when other affect includes it. Thought runs gain optional `social` reservations and outcomes; old runs remain readable. Older strict readers reject these new fields after they are written.

Emotion and spontaneity together can provide recurring idle opportunities without new user messages. Existing opportunity budgets still apply. Autonomous QQ destinations require separate `proactiveGroups` or `proactiveUsers` lists; existing outbound lists do not authorize them. Both new lists default to empty.

## Migration

1. Stop the runtime and retain a verified backup of life storage, `genesis_spontaneity`, QQ message receipts and source Sessions before upgrading. Keep matching runtime and storage for rollback; do not remove fields by hand.
2. Launch the existing supported `dsh` profile with the same `DSH_HOME`. Inspect Genesis → Emotion for boredom and loneliness as separate readings. If existing state is corrupt or incompatible, restore verified storage rather than creating a replacement life.
3. Adjust `emotion.boredom.riseHalfLifeMs` and `fallHalfLifeMs`, and optional `spontaneity.boredomThreshold`, `boredomCheckMs`, `boredomMinIntervalMs` and `boredomMaxIntervalMs` in the existing Genesis patch. Pause cognition in Genesis → Thoughts to disable future idle opportunities.
4. To permit autonomous QQ conversation, explicitly configure the QQ plugin's `proactiveGroups` and/or `proactiveUsers`. Configure `spontaneity.socialCooldownMs` and `socialMaxPer24Hours` for shared sending limits. Verify the current QQ connection and inspect durable receipts; uncertain sends are never automatically retried.
