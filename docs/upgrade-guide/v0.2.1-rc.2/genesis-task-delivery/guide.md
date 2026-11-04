---
kind: upgrade-guide
description: "Genesis task delivery and execution controls require preserving their journal alongside workspace and Session data."
---

# Genesis task delivery and execution controls

English | [中文](guide.zh.md)

## Change

Genesis tasks persist submissions in a version-1 `genesis_tasks` Storage Domain before creating a worker Session. Rows can also contain stop state and idempotent execution-control receipts. A life-state backup alone cannot restore them. Older runtimes may reject control fields or ignore receipts and cannot enforce persistent pauses.

Inspection separates latest-turn `state` from `execution_state`; `result_complete` now requires no outstanding activity. Use `attempts` for paged turn history. Stop and resume require their own `request_id` and an `expected_turn` matching inspection. Completed tasks and user-originated stops cannot be resumed by Life.

## Migration

1. Stop the previous writer and back up the complete Harness home, including routed storage roots. Keep the same life, writer lease, workspace and Session storage paths on restart.
2. Include `genesis_tasks` in any custom Storage Domain routing and backup policy. Existing tasks remain readable through their Session evidence; no Session-format conversion is required.
3. Use `genesis_tasks` `list` and `inspect` to check saved submissions. Retry `create` with identical input and the same `request_id` to finish pending delivery, or `cancel` to erase an undelivered queued prompt. Use explicit `stop` and `resume` for delivered unfinished work; startup never retries execution. If resume has no Session receipt, inspect outcomes, stop to reconcile, then use a new control key.
4. Preserve the journal and Session storage together when restoring. Existing rows without controls remain readable, and task projection cache version 2 rebuilds from Session events. Do not downgrade a deployment relying on submission or control receipts. See [workspace tasks](../../../genesis/tasks.md) for permission, recovery and deletion semantics.
