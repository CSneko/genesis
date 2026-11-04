---
kind: upgrade-guide
description: "Genesis persists optional short memory summaries that older strict readers cannot read, and reviews recent dialogue across turns by default."
---

# Genesis memory summaries and conversation windows

English | [中文](guide.zh.md)

## Change

Genesis memories and their historical revisions can contain an optional `summary` beside the full `content`. Summary prompts target at most twenty characters; validation and manual editing accept up to forty Unicode code points. Existing records without it remain readable. Once a summary is saved, an older strict reader can refuse the affected life state. The memory list displays a saved summary first and exposes full text through View full memory.

Memory decisions and writing use recent exchanges from the same Session, including the current reply. `memory.windowTurns` defaults to four; earlier exchanges are omitted when the input budget cannot hold them.

## Migration

1. Stop the Genesis writer and retain a verified backup of its life storage before upgrading. Keep the existing `DSH_HOME`, storage routes and identity.
2. Upgrade Genesis and its client UI companion together. No bulk conversion or summary generation is required; old memories retain their full content.
3. To retain current-turn-only review, set `windowTurns: 1` inside the Genesis plugin's `memory` configuration. Otherwise the default includes up to four turns from the same Session.
4. Open Memories to generate or edit a summary and expand View full memory. Confirm that the full text, sources, life ID and birth timestamp remain intact after restart. Use the verified pre-upgrade backup if a downgrade is required; do not delete unreadable state to create a replacement life. See [memory behavior](../../../genesis/memory.md).
