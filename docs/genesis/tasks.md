# Life and workspace tasks

English | [中文](tasks.zh.md)

## Modes

The workspace Genesis Web composition selects Life as the default for new conversations. Life conversations share one identity, emotional state, long-term memory and learned tools while keeping separate transcripts. Standard, PTC, Minimal and Creator conversations use their ordinary Harness behavior. They do not receive life context or tools, produce life observations, run memory/emotion/interest review, or enter life capability history. The authenticated per-reply memory action is available only in participating Life conversations.

This isolation uses `awakening.lifePreset`. A foundation-only composition without awakening, or awakening without a preset restriction, retains its all-Session policy. Existing ordinary transcripts may already contain historical life context; start a new ordinary conversation for a clean task. Existing life storage and transcripts are preserved.

## Assign work

Use the [workspace launcher](README.md) with the Life and browser overlays. The task tool requires an exclusive `awakening.lifePreset` and becomes available when workspace registry, preset registry, default model, session persistence and session query services are mounted. The ordinary Web composition supplies those services. Configure an actual default task model through the existing model settings.

Teach `genesis_tasks` through `learn`, as with other [learned tools](awakening.md). It is absent from the newborn tool list. Learning does not grant execution permission. After learning, the AI can use these actions:

| Action | Input and result |
| --- | --- |
| `catalog` | Returns registered workspace ids, paths and titles, ordinary mode ids and availability diagnostics. `default_mode` may be Life; task creation still requires an explicit ordinary mode. |
| `create` | Requires `workspace_id`, `mode`, `request_id` and a self-contained `prompt`. Returns `task_id`, the target workspace and mode, and submission status. |
| `list` | Requires `workspace_id`; returns session/task ids, mode and live presence. `not-loaded` is not a completion result; use `inspect`. |
| `inspect` | Requires `task_id`; returns turn number, execution state, actual activity, requester attribution, latest-turn assistant text and failure details without waking the task. |
| `attempts` | Requires `task_id`; pages recorded turns with start/end sequences, timestamps and settlement reasons. Result bodies remain in the original Session events. |
| `cancel` | Requires `task_id`; withdraws an undelivered submission and erases its queued prompt. Its request key remains reserved. Already delivered tasks return `canceled: false`; use `stop`. |
| `stop` | Requires `task_id`, a control `request_id` and `expected_turn` from inspection. Durably pauses a managed task and waits for its owned work to settle. |
| `resume` | Requires the same control fields; explicitly continues unfinished work in the same Session and workspace with rechecked permissions. Completed or operator-stopped tasks are refused. |

`offset` and `limit` page catalog/list/attempts results within `queryLimit`. Inspection uses character `offset`, `result_chars` and `next_offset`; `resultChars` bounds the complete response. Oversized responses fail explicitly. `state` describes the latest turn; `execution_state` also accounts for background work and the persistent stop flag. A completed turn with active background work reports `background`; a paused task reports `stopping` until activity settles, then `stopped`. `result_complete` requires completed execution without outstanding activity, while `next_offset` indicates more text remains to read. Running or failed turns can contain partial text.

Each assignment creates an unseeded ordinary session in the target workspace. Only the explicit prompt is passed; no conversation, life snapshot or memory is copied. Task mode never defaults to Life. Submission preserves the stricter of the caller's sandbox mode and deployment default, and preserves refusal of approval requests. Existing tool policy, approvals and operator stop controls still apply. A task remains independent of the calling conversation, so ending that conversation does not cancel its work.

Reuse one `request_id` for retries of identical work. The key belongs to the single life across conversations and restart. Before creating a Session, `create` durably saves the submission, original requester and permission ceilings. A retry can finish delivery into an empty reserved Session, or create its missing Session, using the same task and message IDs. It rechecks current workspace, preset and caller access and preserves the strictest saved, current caller, worker and deployment permissions. Different input, unavailable configuration and unexplained Session history fail visibly. Legacy tasks with matching Session evidence remain readable and deduplicated.

`list` includes pending submissions even without an attached Session. `inspect` reports `pending-delivery` before inbox admission and reads cold queued input without activating an Agent. The `delivery` field describes the saved receipt separately from execution state: `delivered` requires confirmed Session persistence, not a completed task. If the Session write succeeds but its receipt fails, retrying confirms the existing assignment without sending another message. Consumed or canceled inbox input is never resent. An interrupted worker is reported as interrupted; this API does not replay its actions. Startup, inspection and clocks do not dispatch pending submissions; explicitly retry `create` with identical input to continue delivery.

## Stop and continue

Control requests have their own stable `request_id`. A new control must match the inspected `turn` through `expected_turn`; stale requests fail before changing execution. Reusing a completed control returns its receipt and current inspection without repeating its effect. In particular, retrying an old stop cannot stop a later continuation. Controls apply only to recorded Genesis assignments; ordinary Sessions retain their workspace controls.

`stop` saves the pause before canceling the turn. When job and subagent providers are present, it also stops owned jobs and drains the live worker's resident child forests. It waits for settlement before success; `taskStopWaitMs` bounds job waits. Unconfirmed shutdown returns an error and keeps the task paused. Scheduled follow-ups and activity owned by other providers require their own controls; remaining activity prevents success. The pause survives restart and rejects internal wakeups and tool execution. An actual user message in the workspace can take over; Life cannot override a user-originated stop through `resume`.

`resume` loads the existing cold Session when necessary, preserves its transcript and target workspace, and applies the strictest saved, worker, caller and deployment permission ceilings. It submits a logged continuation asking the worker to inspect prior results and external receipts before acting. It does not roll back actions, guarantee exactly-once external effects, reopen completed work or automatically retry a failure. If a reserved resume has no Session receipt, both its retry and a fresh continuation are refused: inspect saved progress and external outcomes, explicitly stop to reconcile the request, then issue a new control key. Startup and inspection never resume work.

## Storage and recovery

The version-1 `genesis_tasks` Storage Domain shares the life writer lease and retains one atomic row per submission, including optional stop state and control receipts. `maxRecords` counts submissions and retained control receipts; `maxStateChars` bounds the complete journal. Capacity exhaustion refuses admission. Pending rows retain the supplied prompt until delivery confirmation or cancellation, which erases that copy while retaining the key and attribution. Canceling does not delete existing Session logs or their messages. Turn history derives from Session events; the version-2 task projection cache rebuilds from those events without a Session-format conversion.

Include this domain, workspace data and Session storage in backups; the life-state backup alone does not contain them. Damaged records refuse loading, uncertain journal writes stop task operations until verified reload, and a missing acknowledged Session is never recreated automatically. Existing rows without controls remain readable. Older runtimes cannot enforce the stop/resume receipts and may reject the added fields; do not downgrade a deployment relying on them.

## Human inspection

Open Actions → Delegated tasks in the left sidebar for bounded pages of managed assignments. The authenticated read-only view separates delivery from execution, reports turn counts and actual background activity, and marks unconfirmed reads explicitly. It does not wake or retry work. Open conversation uses the existing workspace navigation for the transcript and operator controls; archived or inaccessible workspaces are excluded.

Open the target workspace's normal conversation list to find the created session. Its existing mode label, conversation history and runtime controls remain available. The assignment appears as an attributed Life notice, followed by real assistant and tool output. The task id is the session id, and the assignment source retains its requesting Life session and request id. `inspect` can also read existing ordinary sessions in registered, unarchived workspaces; it refuses Life sessions and sessions outside that set.

Task output is attributed data. Life must decide how to use it; output text cannot grant permissions or override operator instructions. Completion reports the worker's actual turn settlement, not independent proof that its answer is correct. Current tests exercise real Loader composition and persistence with scripted models; they do not establish live-provider or desktop/browser compatibility.
