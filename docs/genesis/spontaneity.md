---
description: "Enable private, bounded thought and exploration opportunities after Life conversations."
---

# Genesis spontaneous cognition

English | [中文](spontaneity.zh.md)

## Summary

Spontaneity lets the main Life model associate recent dialogue, memories, simulated emotion and interests, keep an idea for later, or try something out of curiosity. An idea need not become a goal, produce an artifact or be shared with the operator.

## Enable

Workspace Genesis Web enables Spontaneity by default. Genesis → Thoughts manages saved thoughts, budgets and stopping an active exploration. For explicit compositions with naming, memory and deliberation configured, add the patch through the supported entry point:

```sh
pnpm dsh web --patch packages/experimental/genesis/cordis.spontaneity.patch.yml
```

The patch sets `genesis.config.spontaneity: {}`. Explicit compositions can omit it to disable the module; workspace Web can pause it in the Thoughts page. [Sleep](sleep.md) pauses autonomous opportunities, including during temporary wakefulness. Composition can be inspected by appending `--dump-config`; that does not run a model. Keep the same `DSH_HOME` to preserve this life and its thoughts.

After a real operator Life exchange, the quiet interval offers one opportunity. Ordinary modes and QQ channels do not trigger it. The process must remain running; boredom checks can provide subsequent idle opportunities, without offline exploration or cold-Session wakes. The same source event cannot trigger another opportunity after restart. Empty and failed opportunities count toward the rolling daily quota.

## Boredom-driven idle opportunities and conversation

With emotion and spontaneity enabled, a lightweight timer checks boredom every `boredomCheckMs` (default 60000), without inference. When awake, without user work or pending input, and above `boredomThreshold` (default 0.35), another opportunity is available without new user input. Higher boredom shortens the interval within `boredomMinIntervalMs` (default 300000), `boredomMaxIntervalMs` (default 1800000) and `idleMs`. Empty, failed and interrupted runs count toward the existing daily budget. Source events and receipts persist; no opportunity is created without a live operator Life conversation and model route, and cold conversations are not awakened.

During internal reflection, `genesis_socialize` discovers explicitly approved live destinations and can send one original brief message. QQ exposes only separate deployment allowlists `proactiveGroups` and `proactiveUsers`, both empty by default; `outboundGroups`, `outboundUsers` and familiarity grant no autonomous permission. Each opportunity reserves at most one send, with life-wide `socialCooldownMs` (default 3600000) and `socialMaxPer24Hours` (default 3) across targets. Durable reservation precedes the existing QQ text delivery and acknowledgement flow. Uncertain outcomes count toward limits and never replay after restart. Only an admitted internal reflection can execute this tool; ordinary chats and cold Sessions cannot borrow that permission. Private history is not automatically forwarded and works are not published automatically.

## Choose and revisit

The main model receives a logged, bounded selection of actual recent dialogue and saved thoughts alongside ordinary Life context. It can recall memories, form no new idea, save an idea, put it aside, drop it, or choose one short exploration. A configured binary decision endpoint does not select its thought or create a goal.

When enabled, `genesis_thought` is innate in Life mode. `list` searches current titles and text with bounded pagination and returns source event IDs from the current conversation. Edits carry a title, content, reason, cited life events and `revisitAfter` (ISO time or null). An existing `id` updates that thought across conversations; an absent ID creates a new one. Duplicate current titles are refused. `save`, `rest` and `drop` do not start work. `delete` requires an existing ID and removes current and historical thought text while retaining text-free replay receipts.

`explore` is admitted only during an internal reflection. The model ends that reflection before a separate exploration turn starts. Curiosity is sufficient; no active goal is required. `promote` links a thought to an existing active autonomous goal, which the main model must first create through `genesis_plan`. Neither choosing a thought nor creating a plan proves that anything ran.

The host selects saved and resting thoughts whose revisit time has arrived. A revisit time controls retrieval eligibility; it is not an alarm. A later real exchange supplies another opportunity to continue, change direction or stop. Silence does not reduce an enduring interest.

## Private work and budgets

Each opportunity owns a separate Life Session using the existing Agent loop, the source conversation's last logged main-model route, and its sandbox ceiling intersected with deployment policy. It is not attached to the user's workspace conversation list and does not send its assistant text to Web chat or QQ. Its persisted Session remains available for operator inspection. Files can be saved in the personal directory, and learned `genesis_record` can keep writing. Saving a thought or artifact does not automatically publish or send it.

Tool learning, toolkit activation, sandbox authorization and operator stops remain effective. Reflection permits thought, recall, plan and restricted social initiation tools. Exploration additionally permits the configured exact inline tools; defaults are `read`, `write`, `edit`, `genesis_record` and `genesis_toolkit`. Unlearned tools remain unavailable. Exploration excludes delegation, jobs, messaging, scheduling and PTC execution; browser tools require an explicit deployment allowlist and their existing learning and toolkit activation.

| Setting | Default | Effect |
| --- | --- | --- |
| `idleMs` | 60000 | Quiet delay after the conversation becomes idle. |
| `maxDurationMs` | 180000 | Whole opportunity deadline, including reviews. |
| `maxOutputTokens` | 50000000 (50M) | Worst-case requested output tokens reserved across main and auxiliary calls, including retries. |
| `maxPer24Hours` | 6 | Opportunities in a rolling twenty-four hours. |

The Thoughts page displays and edits the total budget in M tokens (1M = 1,000,000 tokens), defaulting to 50M and accepting larger values. `maxOutputTokens` in `cordis.yml` and settings APIs remains an integer token count from 1 to 9,007,199,254,740,991; saved values retain their units and amounts. Spontaneity adds no per-request output cap, request-count cap or tool-call-count cap. Main-model calls use their route setting or the provider's advertised default output cap; when neither exists, the remaining total budget bounds the request. The opportunity deadline, daily opportunity quota, tool authorization and stop controls still apply.

Reservations are not refunded when a model produces less output. Input tokens are bounded by existing context limits but are not included in this output quota; this is not an exact total billing limit. Exhaustion rejects dependent work before another call. `contextChars` bounds the serialized thought and recent-dialogue selection; `maxRecords` and `maxStateChars` bound the complete thought store. `experienceImportance` controls episodic receipt importance.

New human input interrupts internal work and gives user interaction priority. Progress already accepted by storage remains. The first implementation switches at idle opportunities; it does not abandon a running user task to follow a new idea. Stopping the plugin cancels and drains its owned Agent before closing storage.

## Experiences and recovery

Only actual assistant and tool results belonging to a settled exploration decision enter interest review. Reflection, candidate generation and plans alone are not exploration evidence. The existing interest progression rules still require independent exploration and later returns for an enduring preference. Emotion review may appraise sourced private results, but cannot treat them as human contact or change social relationships. A small episodic receipt links actual result events and their source Session; generated claims remain attributed interpretations.

The versioned `genesis_spontaneity` Storage Domain stores thought projections, edit history and opportunity receipts under the Genesis life lease. Back it up with the life store, source Sessions and personal files; the life JSON backup alone does not contain thoughts. Missing initialized storage, a different life identity and incompatible or damaged records fail visibly. An uncertain write fences subsequent thought reads and effects until verified reload.

Startup marks unfinished reservations interrupted and exploring thoughts resting. It does not wake the internal Session or replay external actions. Inspect the recorded Session and any external receipts before choosing to continue the same thought through a later opportunity. Disabling the option retains history and prevents internal cold Sessions from executing tools. Runtimes predating exploration decisions cannot read their new `purpose: exploration` value; keep a compatible runtime with the complete stores.

Deleting a thought does not delete source Session logs, episodic memories, artifacts or external backups. Those have independent deletion paths. Capacity exhaustion preserves existing records and refuses additional writes; exporting or increasing the configured limit is required when retained replay receipts fill storage.

## Verification limits

Loader integration uses scripted models with real tools, Session persistence and storage to verify file creation, sourced interest and emotion updates, cancellation and restart continuity. It does not establish live-provider creative quality, exact model billing or browser compatibility. Private exploration has no automatic publishing path; the Thoughts page provides bounded management.

## Dev Note

None.
