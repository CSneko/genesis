# Genesis motivation and life plans

English | [中文](motivation.zh.md)

## Summary

The main conversation model manages persistent motivations and cross-Session plans by explicitly calling `genesis_plan`. It chooses when a lasting commitment is useful, assigns readable IDs and maintains the next action. Auxiliary models cannot create or modify these commitments. Memory, emotion, interests and proactive conversation retain their independent processing.

## Enable

The workspace Life overlay enables planning with `deliberation: {}`. Other profiles can compose the optional overlay:

```sh
pnpm dsh --profile headless --patch packages/experimental/genesis/cordis.patch.yml --patch packages/experimental/genesis/cordis.deliberation.patch.yml --dump-config
```

The dump verifies composition only. Replace `--dump-config` with a task after configuring the main model. Planning itself does not require an auxiliary writer or embeddings; the supplied overlay also configures independent memory. When awakening selects a Life preset, the plan tool is innate in that preset and unavailable in ordinary presets. Disabling deliberation removes planning tools and context while retaining saved records.

## Persistent state

| Record | Fields and interpretation |
|---|---|
| Motivation | A concrete inclination with a readable branded ID, attributed reason, strength, active/paused/ended status and timestamps. |
| Life goal | A lasting commitment with a readable branded ID, immutable content and user/autonomous/event origin, reason, motivation links, priority, status, next action, failure count and transition history. |
| Decision | An auditable record of a plan edit or a conversation-only choice; recording a plan is not evidence of execution or completion. |

Agency state uses the existing atomic life storage and independent backup. IDs, identity, timestamps and history survive unrelated Sessions and restarts. Existing UUID IDs remain readable and editable without renaming; new plan and motivation IDs are chosen by the main model. IDs contain 2–80 Unicode letters or digits, with hyphens or underscores between segments and at least one letter. UUIDs and opaque hexadecimal identifiers of 24 or more characters are refused; semantic meaning is the model's responsibility.

Motivation strength stays in [0, 1]. Each edit moves at most `deliberation.maxStrengthDelta` from the current decayed strength. `motivationHalfLifeMs` controls decay from the recorded anchor, including elapsed time across restarts. Paused and ended motivations exert no current pressure. These are engineered state readings, not proof of consciousness or established facts.

## Request decisions

Ordinary requests need no plan, plan update or auxiliary acceptance check. The main model may create a lasting commitment on its own initiative during an active conversation; it should not create a plan for every reply. Legacy `requestMode` values `context-only`, `before-input` and `before-tools` all use this behavior. Execution authorization, learned-tool restrictions, sandbox policy, budgets and stop controls still apply.

`genesis_plan` uses `action: list | create | update` and `kind: goal | motivation`. List first to obtain the current `revision`, existing IDs and bounded history. Optional `id`, `status` and `offset` select a page; `nextOffset` continues it. A goal update supplies its existing immutable content and origin together with its new reason, priority, status, next action and motivation links. A motivation update supplies content, reason, status and strength. Create and update are distinct: an unknown update ID fails instead of creating a different plan.

For example, the main model can first create the motivation `understand-my-growth`, then the autonomous goal `review-capability-growth` with that motivation's ID and a concrete next action. An autonomous goal requires an existing motivation. Goal transitions support pause, resume and abandonment; terminal goals cannot reopen. The model cannot set `completed`, failure counts, timestamps or permissions. A changed direction needs a separate goal rather than rewriting an existing goal's content or origin.

Each edit checks the displayed revision and commits its actual Session/tool-call reference with the transition history. A stale edit, duplicate create ID or invalid state leaves previous state unchanged. Replaying the same tool call returns its original receipt; reusing that call for different fields fails. Meaningful IDs also appear in the bounded logged life context so the model can recognize unfinished plans.

## Autonomous entry and outcomes

A trusted adapter or the authenticated operator control can call `ctx.get('genesisDeliberation').deliberate(agent, { key, sourceEventId }, signal)` for an idle character conversation. The method reserves one planning opportunity and enqueues a logged `genesis-planning` notice for the main model. No auxiliary model selects a goal or next action. The main model may change a commitment through the tool, take a permitted action or leave its plans unchanged. The opportunity is not a user assignment or a permission grant; no task timer is installed.

The stable key prevents duplicate dispatch, including after restart. A reservation does not prove delivery; a crash or cancellation after reservation is not automatically resent. Inspect the life event and Session log before requesting another opportunity with a new key. Independent proactive conversation can still choose speaking or waiting, but its validator requires empty motivation and goal changes.

Only the trusted application can call `LifeCore.completeLifeGoal` after independently verifying a successful linked execution. A plan-tool receipt, a successful unrelated tool result or an assistant claim cannot complete a goal. Confirmed completion retains its existing history and growth requirements. These life plans remain separate from Harness Session goals.

## Limits and extension

`maxMotivations` and `maxGoals` bound retained inventories, including terminal goals. `contextChars` bounds the complete logged agency context; `queryLimit` and `resultChars` bound tool pages and history. Retrieval and inference limits apply to the remaining independent conversation-only judgment. Capacity and validation failures preserve committed state; uncertain storage writes stop dependent operations until verified reload.

Keyless Loader checks exercise main-model tool calls, readable IDs, stale and invalid edits, replay, planning opportunities, permission isolation and restart continuity. Live-model initiative quality still requires evaluation with deployment credentials. This feature does not add autonomous task scheduling, reflection or runtime self-modification.

## Dev Note

None.
