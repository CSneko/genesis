---
kind: upgrade-guide
description: "Exhausted temporary-memory generation now skips its source batch instead of retaining it for manual retry."
---

# Temporary-memory generation uses bounded retries and skips

English | [中文](guide.zh.md)

## Change

Genesis temporary memory automatically attempts each batch up to three times, then durably skips failed optional generation. Manual retry cannot regenerate a skipped batch. Previously a generation failure stopped that source pending manual retry. Older model, JSON and validation failures resume under the new policy on startup. Source conversations and failure audits remain intact. Recovery, storage and uncertain importance outcomes still stop visibly. One current diagnostic appears after three consecutive skipped batches within a Host runtime; successful generation clears it, and restart resets the health counter.

## Migration

1. Before upgrading, retain matching Genesis temporary storage and Session logs if pending failed batches must be preserved for later analysis.
2. In the Genesis plugin's `cordis.yml` configuration, optionally set `temporaryMemory.maxAttempts` and `temporaryMemory.failureThreshold`; both default to `3`.
3. Open Settings → Temporary memories to inspect the current diagnostic, search summaries and change pages. Correct the reported model or credential problem; the next successfully generated batch clears the repeated-failure notice. See [recovery and deletion](../../../genesis/temporary-memory.md).
