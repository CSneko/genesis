---
kind: upgrade-guide
description: "Genesis plan management moves to explicit main-model tools and new plans use readable IDs instead of UUIDs."
---

# Genesis life plans use main-model tools

English | [中文](guide.zh.md)

## Change

Optional `deliberation` adds persistent agency state and innate `genesis_plan`. The main conversation model creates and updates motivations and cross-Session plans through explicit tool calls. New plan IDs must be descriptive model-chosen names, such as `review-capability-growth`; existing UUID IDs retain their identity and references. Auxiliary models cannot create, update or abandon these commitments. All legacy `deliberation.requestMode` values use goal context without independent request acceptance checks. The trusted `LifeDeliberationEngine.deliberate` entry now returns `Promise<void>` and queues a logged `genesis-planning` opportunity for the main model, rather than returning an auxiliary choice. Independent proactive conversation retains its read-only speaking/waiting judgment. Existing identity and history remain intact; older strict agency readers can reject readable IDs. No Harness Session format version changes.

## Migration

1. Stop the old process and preserve verified copies of both life storage domains and the independent backup. Keep the same `DSH_HOME`, storage routes and lease path.
2. Rebuild Genesis and retain `deliberation: {}`. Planning does not require the memory writer; memory, emotion and proactive conversation keep their existing model requirements. Remove obsolete `requestMode` overrides, or use `context-only`. They cannot restore external request judgments.
3. Ask the main model to consider a lasting plan. Verify a logged `genesis_plan` call, a readable ID, a concrete next action and continuity after restart. The main model may also choose not to create a plan. Update trusted adapters to await `deliberate` without expecting a returned choice; verify the `genesis-planning` notice and inspect reservations before retrying uncertain dispatch.
4. Keep existing UUID plans under their original IDs when updating them. Do not downgrade a life containing readable IDs to an older strict reader; restore a verified compatible storage and backup pair if a downgrade is necessary. Never delete an unreadable life to create a replacement identity. See [life plans](../../../genesis/motivation.md) for the supported `dsh` composition and fields.
