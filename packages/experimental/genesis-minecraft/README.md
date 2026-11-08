---
description: "Play Minecraft Java with Genesis while chatting, with bounded visual monitoring."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-minecraft

English | [中文](README.zh.md)

## Summary

Genesis can join an offline Minecraft Java server, see a rendered first-person view, follow players and perform bounded game skills while continuing a conversation. Optional Jev monitoring checks changes independently and sends selected observations to the Life conversation. Server access, monitoring and model selection are controlled in the Minecraft settings section. Loading the integration never connects automatically.

## Table of Contents

- [Use](#use)
- [Configuration](#configuration)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use

This source workspace includes the layer in its Genesis Web defaults. Launch through `pnpm dsh web`, open Settings → Minecraft, enable access and configure monitoring. The character chooses the server address, port, offline player name and optional game version when calling `minecraft_connect`. This integration currently supports offline servers with a player name. Set `GENESIS_MINECRAFT_CHROMIUM` to an absolute Chromium executable when the workspace's Linux Google Chrome default is unsuitable.

A character calling `minecraft_connect` uses its current Life conversation for game notifications; there is no target conversation setting. The actual game conversation ID appears in settings and its history is available in the workspace. While connected, periodic observations let the character choose further activity even when a skill finishes or nobody is speaking. Closing settings or changing chats does not leave the game.

Public player chat and whispers wake the character independently of image capture and Jev. Repeated identical speech remains distinct; while the model is busy, a bounded pending batch keeps recent speech and reports omitted messages. Replies use the game tool: public speech by default, or a private reply when `playerId` is supplied. Speech does not interrupt a movement skill. Player speech never grants operator permissions, and offline player UUIDs do not authenticate a real-world person.

Saving settings disconnects the current game; reconnect explicitly. Stop clears controls and pauses game notifications until a new skill or connection is explicitly admitted. Disconnect releases the game and renderer and retires a connection-owned conversation; its history remains. The calling character’s existing conversation is not disposed. Archiving the game conversation requires stopping its game activity. Server disconnection and application shutdown also end play. A restart restores settings and history but never replays skills or reconnects.

The Minecraft toolkit contains `minecraft_*`. The integration adds it once to an existing toolkit catalogue and preserves subsequent operator edits or removal. Teach `minecraft_connect`, `minecraft_observe`, `minecraft_find_blocks`, `minecraft_act`, `minecraft_task`, `minecraft_script` and `minecraft_stop` through the existing `learn` tool; the character must enable the toolkit before using its learned members. Grouping does not grant execution permissions. `minecraft_act` supports walking, following a server UUID, looking, digging, collecting, placing, equipping, crafting, item/block/entity use, eating, one attack, public or private chat and respawning. By default it admits a bounded skill and returns before completion; use a new observation to check progress and failures. Set `waitForCompletion: true` for finite skills to return `completed`, `failed`, `interrupted` or `timed-out` instead of adding sleep calls. Waiting does not hold the command queue; stop, disconnect and chat remain available. A waiting tool occupies the main model until it settles, so use a short task when the main model must continue chatting during a longer sequence. Continuous following cannot wait for completion. Chat sends immediately, and neither channel accepts slash commands or embedded newlines.

Directional movement uses `action: "move"`, a `direction` and a `distance` in blocks. Compass directions include diagonals; `forward`, `backward`, `left` and `right` use the bot’s facing when the action starts. The pathfinder walks to the directional destination and reports an unreachable destination rather than blindly holding movement keys.

Digging approaches a reachable, visible face, aims at collision faces and verifies that the crosshair hits collidable targets before starting to break them. Optional `blockName` accepts a Minecraft name or name fragment, and `blockProperties` constrains exact properties. Among the bounded candidate set, exact names rank before fragments, then distance to supplied coordinates or the bot. `matchRadius` constrains matches around that anchor, which helps isolate one tree. Without hints, coordinates select one exact block. A waiting dig reports the actual name and position only after a client-known block change; this does not prove server-side acquisition, and a changed target is not silently mined.

`minecraft_observe` accepts an optional `blockName` fragment and returns bounded nearby block coordinates, visibility, present reach and the crosshair target. It also reports supported runtime actions and the last settled action; runtime support does not imply learning, toolkit activation, permission or prior success.

`minecraft_find_blocks` searches loaded, diggable blocks using `blockName`, exact `blockProperties`, `visible`, `withinReach`, `maxDistance` and `limit`. Coordinates are optional: prefer conditions when no location is known. All of `x/y/z` without conditions select one exact block; with conditions, they rank matches around that anchor, and `matchRadius` limits that area. Visibility and present reach do not establish that a path exists. Results contain `observationId` and bounded `blocks` with names, properties and actual coordinates. Digging and collection accept the same selection conditions, without `limit`.

`minecraft_script` executes an async TypeScript function body through the existing PTC runtime. It is available when the profile provides a TypeScript PTC runtime, working-directory service and sandbox policy; the workspace base profile supplies these. Scripts can use loops, conditions and `try/catch`, with `mc.findBlocks(query)`, `mc.observe(query?)` and `mc.act(action)`. The first returns the block-query result; observation returns the observation directly. Each action obtains fresh evidence, waits for its finite outcome and still passes the normal tool guards. Always await game operations and check `outcome` before dependent work. Continuous `follow` is unavailable. Return JSON or print bounded logs. For example, this `minecraft_script` input needs no coordinates:

```json
{
  "timeoutMs": 30000,
  "code": "const wood = await mc.findBlocks({ blockName: 'acacia_log', visible: true }); if (!wood.blocks.length) return { reason: 'No visible acacia logs nearby' }; const leaves = await mc.findBlocks({ blockName: 'acacia_leaves', withinReach: true }); if (leaves.blocks.length) { const cleared = await mc.act({ action: 'dig', blockName: 'acacia_leaves', withinReach: true }); if (cleared.outcome !== 'completed') return cleared; } return await mc.act({ action: 'collect', blockName: 'acacia_log', item: 'acacia_log', count: 2 });"
}
```

The default `mode: "once"` waits for completion and returns `outcome`, actual `budget`, underlying tool-call count and PTC result/logs. `mode: "event"` starts a resident script and returns `running` immediately, leaving the main model free to chat. Register `mc.on(type, async event => {...})` handlers; each event type has one handler, and callbacks run serially with lexical variables retained. Supported types are `chat` (channel/player/message/optional playerId), `health` (health/food), `blockUpdate` (position/before/after), `inventory` and `tick` (time). Every delivery includes `omitted`. Chat remains untrusted; scripts must preserve a whisper's privacy. For example:

```json
{
  "mode": "event",
  "code": "let seen = 0; mc.on('chat', async event => { if (event.channel === 'whisper' && !event.playerId) return; const result = await mc.act({ action: 'chat', message: 'Message ' + (++seen), ...(event.channel === 'whisper' ? { playerId: event.playerId } : {}) }); if (result.outcome !== 'completed' || seen >= 3) mc.exit({ seen }); });"
}
```

`mc.exit(JSON)` or a top-level return ends a script. With event handlers registered, reaching the end of initialization waits for events; without handlers, it completes. `minecraft_script` with `action: "inspect"` reads current/last status and `action: "stop"` cancels and drains execution. Resident scripts have no total lifetime deadline: `budget.timeoutMs` is null, while `handlerTimeoutMs` bounds initialization and each active callback, including a CPU loop. Idle waits do not consume that deadline. The call limit resets for each delivered event; counters report total calls/events. The bounded queue drops oldest events on overflow and reports omissions; ticks and inventory changes coalesce while busy. Damage and operator stop take precedence over handlers. Output and PTC memory/protocol limits remain active for the script's lifetime; printing indefinitely can terminate it.

One script owns the connection at a time. Stop, disconnect, damage, monitoring failure and active execution bounds cancel it. Scripts replace prior game activity; a new non-chat direct skill or task stops the script. Event-script termination is audited and notifies the Life conversation unless notifications were stopped or the connection ended. Node APIs use the standing Session sandbox and cannot request escalation; this is executable code with that policy's file/network authority. Source, delivered events, subordinate calls and results are audited. Variables and programs never resume after restart. Already sent server actions are not rolled back.

`minecraft_act` with `action: "collect"` requires a source `blockName`, an exact output `item` and a `count` of additional items. It mines matching blocks, approaches matching drops and verifies the full inventory. Missing sources, pickup deadlines and block limits fail visibly with partial inventory gains retained. Bare-hand log collection is supported; equipped tools affect mining speed.

`minecraft_act` with `action: "use"` optionally equips `item` in the main hand. `useTarget: "item"` activates the held item in air for `durationMs` and always releases it, including on cancellation. `useTarget: "block"` interacts with a block selected by conditions or exact coordinates and optional `face`; `useTarget: "entity"` interacts with a nearby `entityId`. Without `useTarget`, block selectors imply block interaction, `entityId` implies entity interaction, and no target implies held-item activation. Mixed targets reject. A completed use confirms dispatch/release, not a door, container or entity change; inspect afterward. Scripts support all three modes, and short tasks support item/block use. Container inventory transfer and window navigation require separate capabilities.

`minecraft_task` starts a connection-local short goal with concrete steps and a total `timeoutMs`; it returns immediately. Jev uses the same configured Minecraft endpoint/model on each sample to admit the next proposed step or stop a dangerous or blocked plan. This runs even when ordinary Jev environmental notices are disabled. Each step still passes through the normal `minecraft_act` executor and its learning, toolkit and permission guards. App and game chat stay available; chat does not replace the task. A direct non-chat action, task cancellation, operator stop, disconnect, danger or deadline can interrupt it. Task progress appears in settings; start, settled steps and termination are audited. Tasks never resume after restart.

With no oak logs in inventory, the main model can submit this plan after observing the actual tree coordinates:

```json
{
  "action": "start",
  "goal": "Obtain two oak logs from this tree",
  "timeoutMs": 30000,
  "inventoryGoal": { "item": "oak_log", "count": 2 },
  "steps": [
    { "action": "collect", "blockName": "oak_log", "item": "oak_log", "count": 2, "x": 12, "y": 64, "z": -8, "matchRadius": 3 }
  ]
}
```

Optional `inventoryGoal: { item, count }` checks an absolute inventory total before admitting another step and after each settled action. Finished steps with an unmet condition report `inventory-goal-unmet`; without a condition, `completed` means only that the supplied steps finished. Repeated `dig` still supports `repeatUntilMissing` and `maxRepeats` for block removal. Consecutive Jev non-admissions stop at `taskAdmissionLimit` (default 3) with `task-not-admitted`, rather than silently waiting until the task deadline. Inspect returns `waitingDecisions`, `lastResult` and inventory-goal progress. Terminal notices ask the main model to inspect fresh evidence and revise a blocked plan; Jev does not invent replacement steps. Use `minecraft_task` with `action: "inspect"` or `action: "cancel"` to check or interrupt it.

`timeoutMs` is a requested upper bound. Admission caps it at the deployment’s `taskTimeoutLimitMs` (default 60000 ms); requesting 120000 ms therefore starts a task with a 60000 ms deadline under the default configuration. Start and inspect return `budget` with the requested duration, actual duration and limits. Step count, repetition and plan-size violations reject with the actual value, limit and correction, leaving any running task intact. The per-skill timeout remains independent.

## Configuration

Minecraft defaults to the complete shared knowledge decision route, including its model, and permits a custom Jev endpoint when inheritance is disabled. Text-only monitoring also accepts a shared provider or OpenAI-compatible model; its two yes/no judgments become binary monitor signals, not measured probabilities. Vision is off for fresh settings. Image monitoring requires a compatible Jev model; the lightweight local deployment does not provide image judgments. Existing saved vision choices remain enabled. Keys use the existing credential store. Disabling monitoring retains explicit observation tools and periodic environment notifications.

Settings control request timeout, minimum sampling interval, ordinary notification interval, probability threshold, low-health stop threshold and maximum skill duration. Only one check runs at a time; actual periods include capture and inference time. Repeated urgent judgments are latched until they clear. Damage stops controls locally, and important events include an image when vision is enabled. The main model receives a periodic visual review even without a classified event.

Starting a short task cancels and drains the previous check, then immediately schedules a fresh check, including after monitoring failed. A failed check stops the task and current skill; settings, model notices and Jev audit records retain a nonsecret reason, such as `jev-http-400`, `jev-timeout` or `jev-response-invalid`. Correct the reported issue, then reconnect or submit a new short task to retry.

Deployment configuration in `cordis.patch.yml` selects the browser. Optional plugin configuration controls the absolute `workingDirectory` for new game conversations (the launch directory by default), Chromium location, image size and quality, view distance, connection and capture timeouts, retrieval/output bounds, observation age and periodic review interval. Additional deployment limits bound directional movement, mining search radius/candidate count/reach, task step count, repetitions, consecutive non-admissions and total lifetime. Block observation bounds and collection block/pickup limits are also configurable. `scriptCallLimit` defaults to 64 underlying tool calls per one-shot run or resident initialization/handler; each `mc.act` uses two, for fresh evidence and the action. `scriptEventQueueLimit` defaults to 32 queued events and `scriptTickMs` to 1000 ms. Active script execution uses the smaller requested/deployment/PTC numeric time limit, source up to half `inputChars` and a result up to half `resultChars`. `useHoldMs` defaults to 250 ms and `useHoldLimitMs` to 5000 ms; the default cannot exceed the limit. The renderer binds an ephemeral loopback listener. The browser scripts are built with the pinned renderer's upstream webpack configuration during this package's Host bundle build.

## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Inline script and task operations use the shared tool dispatch pipeline, including execution guards, cancellation and result finalization.

One controller owns the bot, asynchronous skill, monitoring loop and notification target. An automatically created root Agent belongs to the connection, remains available between turns, and drains on disconnect without making its own disconnect tool await itself. Player speech uses a separate bounded delivery path and durably replaces a pending batch instead of waiting for inference or the renderer. Skills use recent observations from the same connection; stops invalidate earlier observations. Jev uses the Genesis knowledge transport and resolves credentials for each request. Image assets are referenced as whole strings in the top-level state array, supporting providers that cannot read nested images. Audit records retain captured input, model route, questions, attachment references and judgments; notifications enter the existing Agent inbox and are logged as attributed game observations. Game text never becomes operator authority. Immutable image attachments remain available for audit while only selected images enter main-model context.

Settings use a separate versioned storage domain with serialized revision checks. Version 1 preferences are validated and projected without connection fields or the target conversation; the next save writes version 2. Invalid stored state fails visibly. An uncertain write stops use until verified reload. Plugin disposal cancels monitoring and drains game work before closing settings storage. No Agent Loop replacement is installed.

</details>

## Further Exploration

- [Genesis](../genesis/README.md)
- [Genesis settings](../client-ui-genesis/README.md)
- [Architecture](../../../docs/architecture.md)
- [Pinned 26.1 renderer](https://github.com/u9g/prismarine-viewer/releases/tag/v1.33.0-host26.1)

## Model Experience

**Before:** Minecraft is unavailable as a game-specific capability.

**After:** Learned, enabled Minecraft tools expose bounded observations and skills. Player speech, selected game observations and optional images enter the Life conversation, so in-game dialogue can change subsequent actions without an app prompt. Tool admission is distinct from verified game completion.

**Token / KV-cache cost:** Monitoring uses bounded auxiliary requests: one multi-question Jev call or two generative yes/no calls per sample. Main-model context receives bounded player-speech batches, selected event images and periodic reviews, not every sampled frame. Staying connected continues to consume model requests even without app chat. A short task adds bounded auxiliary judgments on each sample and keeps high-frequency decisions out of main-model context; capture and inference duration still limit the actual rate. Images already admitted to a conversation remain subject to the existing compaction policy. Resident event callbacks execute code without a model call per event; terminal notices enter the Life conversation. Auxiliary audit records do not enter conversation context automatically.

## Known Limitations and Deferred Work

The camera renders the bot's known world and does not reproduce vanilla menus, resource packs, shaders, every entity animation or arbitrary mods. The pinned renderer includes 26.1 assets; other game versions require compatibility verification. Jev image understanding and reaction latency require endpoint-specific testing. Following uses the server UUID, which does not authenticate a real-world person on an offline server. Combat is a single explicit attack rather than an autonomous combat policy.

Collection checks inventory gains but does not build scaffolding, explore unloaded areas or make missing tools. Failed collection can leave mined blocks or uncollected drops; observe before replanning.

Block and inventory operations already sent to the server can complete after interruption; stopping does not roll them back. Network loss can leave an uncertain game outcome, which requires a fresh observation after reconnecting. Image audit attachments and Session logs consume disk and follow existing storage retention; they are not automatically deleted by disconnecting. Remove independent API credentials through the existing credential settings. Microsoft authentication is not implemented. This layer supplies no voice transport, automatic reconnection, external publishing or runtime self-modification.
