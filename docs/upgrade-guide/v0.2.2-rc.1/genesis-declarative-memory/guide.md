---
kind: upgrade-guide
description: "Genesis recall returns versioned readings and persists declarative organization instead of plain text arrays."
---

# Genesis declarative memory readings

English | [中文](guide.zh.md)

## Change

`genesis_recall` search returns a `genesis-recall-v1` object instead of a string array. Consumers read `entries[].text`; `alreadyPresent` means the current reading remains in the conversation. Directory and browse actions expose knowledge paths, person associations and events. Non-declarative and temporary storage retain their existing meanings.

Life records gain optional version-1 `organization` metadata. Current readers accept old snapshots; older strict readers reject upgraded records. Records without organization remain searchable: explicit experiences use event placement and other declarative entries use `unclassified`. The normal writer or manual editor assigns organization. Existing Session messages remain readable; old plain recall results have no verifiable reading receipt and can be read again.

## Migration

1. Stop older writers and retain the complete life store and backup before starting the new runtime. Startup does not create a separate organization backup. Existing organization backups retain their identity checks and memory-deletion cleanup.
2. Launch the existing Genesis-enabled `dsh` profile and open Memories → Memories. Browse Knowledge, People, Events or Unclassified; use Add memory or Edit memory to assign directories and subject names. Existing organization metadata and source references remain readable without a batch operation.
3. Confirm the same life ID, unchanged memory text and source references. Update custom tool consumers to handle the object response and both reading levels; do not interpret `alreadyPresent` as a missing memory. `genesis_recall` accepts `search`, `directory` and `browse`; the memory Gateway has no batch-classification operation.
4. To downgrade, stop writers and restore the complete verified pre-upgrade state through the configured Storage Domain backend. Keep the manifest and all companion components together. Upgraded primary records must not be opened by an older strict reader.
