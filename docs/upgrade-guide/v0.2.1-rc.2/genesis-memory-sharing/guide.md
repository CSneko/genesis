---
kind: upgrade-guide
description: "Genesis life profiles share stored memories across Web and QQ instead of isolating them by source conversation."
---

# Genesis memory sharing across conversations

English | [中文](guide.zh.md)

## Change

`cordis.life.patch.yml` selects `memorySharing: life`. Stored long-term memories and unexpired temporary summaries can enter bounded prompts, recall results and auxiliary inference in any participating Web, QQ private or QQ group conversation, including records saved before upgrading. Original people, source events, history and temporary audience fields remain stored. Raw Session history, attachments, operator identity descriptions, plans and tool authorization retain their separate access rules. Life identity and storage schemas are unchanged.

Standalone Genesis mounts default to `memorySharing: conversation`, preserving source-audience isolation. Switching policy does not rewrite memories or erase text already delivered and logged in a Session.

## Migration

1. Keep the same `DSH_HOME` and restart the supported `pnpm dsh web` entry point to load the updated life overlay. No memory migration or embedding rebuild is required.
2. To retain isolation, apply an operator patch after the life overlay with the Genesis row `id: genesis` and `config.memorySharing: conversation`. Use `life` for cross-conversation recall. See [memory configuration](../../../genesis/memory.md).
3. In an allowed QQ group, query a distinctive phrase from a stored Web memory using `genesis_recall`. Under `life`, the current text should be available within ordinary result limits; under `conversation`, unrelated-source memories remain excluded.
4. Switching back to isolation affects later memory selection. Previously delivered Session messages remain until removed through the existing Session deletion controls.
