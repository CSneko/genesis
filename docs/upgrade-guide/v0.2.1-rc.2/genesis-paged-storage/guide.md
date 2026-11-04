---
kind: upgrade-guide
description: "Genesis paged life manifests require matching readers and replace aggregate history budgets with per-record limits."
---

# Genesis paged life storage

English | [中文](guide.zh.md)

## Change

Genesis writes `genesis-tree-v2` commit manifests and immutable `indexes` pages. Memory versions move from grouped `memory_history` components to individual `memory_revisions` components. Existing complete snapshots and `genesis-split-v1` manifests migrate during the next successful startup, retaining life identity, birth, source IDs, history order and memory versions. Older readers reject the new manifest; downgrading requires a complete pre-upgrade recovery copy.

Historical totals no longer consume `maxRecords` or `maxStateChars`; those settings retain their other catalogue and memory-fallback behavior. `storage.pageSize` bounds each index/root to 256 references by default. `storage.maxRecordChars` bounds one encoded component/root to 2,000,000 characters. Model context limits are unchanged. Startup and snapshots still load the complete life, so hardware resources remain limiting factors. See [storage and recovery](../../../genesis/data-model.md#consistency-and-recovery).

## Migration

1. Stop the Host. Preserve the `genesis` and `genesis_records` Storage Domain data plus the independent backup manifest and its entire `.d` directory. Keep a matching copy of the old runtime and configuration for rollback.
2. Keep the same `DSH_HOME`, storage routes and lease path. Start through `pnpm dsh web` in this source workspace; conversion and its independent backup complete before normal life operations resume. Never remove the writer lock file to force startup.
3. Confirm the same life identity, memory contents and source history. The `states/life` descriptor now uses `genesis-tree-v2`; with JSON storage, index pages appear under `storages/genesis_records/indexes/`.
4. If a single component exceeds its limit, increase `storage.maxRecordChars` explicitly in the Genesis plugin patch and restart. Missing/damaged pages or uncertain I/O stop dependent work; restore verified primary and backup data together rather than creating an empty life.
5. Before downgrading, stop the Host and restore the complete matching pre-upgrade data and runtime. Do not delete index pages or strip the manifest discriminator.
