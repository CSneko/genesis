---
kind: upgrade-guide
description: "Genesis manual whole-conversation memory overviews exclude records preceding the latest committed context compaction."
---

# Manual memory overview after compaction

English | [中文](guide.zh.md)

## Change

Genesis Whole conversation memory overviews now use only user and assistant chat after the latest committed context-compaction replacement. Earlier chat and the compaction summary are excluded. Existing memories participate only when every source belongs to this Session's post-compaction exchanges; earlier and mixed-source memories remain stored and outside the operation's edit scope. Without compaction, the whole conversation remains in scope.

The private conversation evidence projection advances its state version and rebuilds its cutoff from the Session log. No life-memory deletion or Session-format migration is required. A failed compaction without a replacement message does not move the cutoff. Reopening preserves the selected range.

## Migration

1. Restart the existing Genesis-enabled `dsh` profile and refresh the browser to load the updated scope description. No configuration change is needed.
2. In a compacted conversation, continue chatting before selecting Memory → Whole conversation → Organize conversation memories. If no user exchange follows compaction, the operation asks for further conversation instead of reading older records.
3. Verify that the overview considers only the current post-compaction segment and that existing earlier memories remain available in Memories. Automatic review and per-reply manual generation retain their own evidence policies.
