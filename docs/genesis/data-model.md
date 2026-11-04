# Genesis data model

English | [中文](data-model.zh.md)

## Summary

The owning [schemas](../../packages/experimental/genesis/src/model.ts) define the durable records. Domain version 1 retains validated legacy snapshots; new writes use the `genesis-tree-v2` manifest and reconstruct a life with `schemaVersion: 1`. Identity and its history are not tied to a model name, Session ID, user ID or prompt.

## Records

| Record | Meaning |
|---|---|
| Identity | Stable branded life ID, nullable name, immutable creation time, update time, core version and initial framework/version. |
| Life event | Branded event ID, life ID, type, time, source, JSON payload, stable deduplication key and optional Session/event references. |
| Memory | Branded memory ID, category, content, creation/update times, importance, confidence and required existing source-event IDs, optional declarative/non-declarative kind, attribution and embedding-space/vector cache. |
| Interest | Branded interest ID, free-form topic, current inferred stage, reason and distinct completed exchanges with source-event IDs. |
| Capability | Tool name as branded capability ID, declaration hash, first observation/change times, scope availability, execution-time permission and last use outcome. |
| Growth | Branded growth ID, system category, time, title, description and related life-event IDs. |

Optional memory `experience`, `experienceIds`, `history` and `habit` fields retain event context, derivation links, source-bearing previous interpretations and conditional learned behavior. The optional life `consolidation` cursor retains pending revisions, source Session, operator preference, retry count and the last safe outcome. Their behavior and budgets are defined by [memory](memory.md). Optional version-3 `emotion` retains nine immediate reactions, two mood dimensions, independent needs, recovery parameters, a revision, one operator relationship and optional operator `controls`; sourced transition events commit atomically with it. [Emotion](emotion.md) defines appraisal and recovery. Absent optional fields remain readable; emotion versions 1 and 2 require offline operator conversion before loading. Preserve a verified pre-upgrade backup before conversion or downgrade.

Optional `interests` starts empty when enabled. Each accepted stage change and its cited sources commits with an append-only life event; a no-change review also records a replay marker. The field remains in the `projections` component and is restored across Sessions. [Interests](interest.md) defines progression and bounds. Older states without `interests` remain readable; older strict readers reject a newly written field.

Optional version-1 `agency` retains branded motivations, life goals, decisions, goal transition history and observed execution references, requiring matching initialization and valid source events. Changes commit atomically with life events under existing capacity, backup and recovery rules; older states without this field remain readable, while older strict readers reject it. [Motivation and deliberation](motivation.md) defines the records and transition rules.

<a id="life-storage"></a>

Optional version-1 `people` retains branded `PersonId` profiles and `ConversationId` routes bound to distinct `SessionId` values. `PersonSource` attributes `genesis-person` messages to their authenticated QQ account, immutable external message ID and conversation. Each `LifePerson` owns independently sourced relationship estimates; `LifeConversation` restores its existing Session. Legacy absence remains readable, while older strict readers reject the new projection. [QQ behavior](qq.md) defines audience selection, operator binding and delivery receipts.

## Consistency and recovery

The `genesis` domain retains one atomic `states/life` manifest. Immutable components live in the `genesis_records` domain, using the existing JSON backend’s per-record layout or SQLite records. JSON directories separate `identity`, `events`, `memories_episodic`, `memories_semantic`, `memories_self`, `memories_procedural`, `embeddings`, `memory_history` (legacy grouped versions), `memory_revisions`, `growth`, `capabilities`, `projections` and `indexes`; each filename is its SHA-256 content key. The `genesis-tree-v2` manifest points to bounded immutable index pages and data components. Each page/root holds at most `storage.pageSize` references (default 256); another index level is added when needed. Pages and components are SHA-256 checked, retain record order and publish before the atomic root replacement. Each historical memory revision has its own component; earlier grouped versions remain readable for migration. The domain schema checks record ownership, unique IDs/deduplication keys, exactly one matching birth and existing memory/growth sources. Foundation-only initial memory and birth cannot commit separately; a new awakening-mode life starts without personal memories. Naming, first conversation and learned tools are idempotent life events; learning never implies availability or authorization.

Both domains use the configured Storage Domain routes; include both in backups and configure both routes when selecting a dedicated backend. No SQL schema change is required. Startup verifies component hashes and cross-record invariants before exposing the life. A missing, malformed or incompatible referenced record refuses startup; unreferenced interrupted writes are excluded and cleaned after a successful commit. Failed persistence makes the core unavailable until reload, because an I/O failure can have an unknown durable outcome. Input/capacity refusals do not mutate committed data.

Life history has no aggregate count or serialized-character budget. `storage.maxRecordChars` bounds each independently encoded component and the root (default 2,000,000 characters); an oversized individual record is refused before any commit write. `maxRecords`/`maxStateChars` continue to govern separate catalogues, with their existing memory fallback behavior. Commits reuse unchanged components/pages, replace the root and remove superseded records only after the independent backup succeeds. The backup uses the same paged index with its own component directory; deletion removes superseded text, revisions and vectors from both copies.

Startup, source validation and full snapshot APIs still load the complete life. Storage Domain caches records in memory, so RAM, disk space, filesystem inode capacity, I/O failure and recovery time remain practical limits. Context and retrieval budgets stay bounded; the history is not injected wholesale into model requests. This format removes a fixed total-history capacity refusal, not physical resource limits.

Memory extensions are optional on read: existing records retain their identity and sources; missing kinds classify procedural memories as non-declarative and the rest as declarative. Older strict readers refuse records containing these extensions, so preserve a verified pre-upgrade copy before downgrading. Local backup and review semantics are defined by the [memory reference](memory.md).

Legacy complete snapshots and `genesis-split-v1` flat manifests convert on the next successful startup without changing life ID, birth time, event order or source relationships. Old strict readers refuse the new manifest. Back up both complete domains and the independent backup before upgrading; never reinterpret incompatible data as an empty life.

## Dev Note

None.
