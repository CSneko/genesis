---
description: "Optional OneBot 11 conversations with stable Genesis people and separate group/private Sessions."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-qq

English | [中文](README.zh.md)

## Summary

Add QQ group and private conversations to an initialized Genesis life. The source workspace includes its settings with QQ initially disconnected; upstream profiles require an explicit overlay. Explicit allowlists and authenticated OneBot connections control admission; relationships grant no host permissions. See [connection and relationship behavior](../../../docs/genesis/qq.md).

## Table of Contents

[Use](#use) · [Implementation](#implementation) · [Further Exploration](#further-exploration) · [Model Experience](#model-experience) · [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use"></a>
## Use

From this source workspace, launch through the supported entry point, then configure the connection in Settings → QQ connection using the [QQ guide](../../../docs/genesis/qq.md):

```sh
pnpm dsh web
```

Disable QQ connection in Settings to close the transport. The patch inserts only `genesis-qq`; it requires the existing Genesis life preset, Agent, default-model, credential and durable Session services. It does not install a QQ client or initialize a second life. Configuration defaults and resource limits are in the [configuration catalog](../../../docs/config-catalog.md).

QQ preferences add a logged, bounded prompt to QQ requests only. Conversation windows default to 200k private, 400k group and 500k operator-private tokens, capped by model capacity through automatic compaction. Web groups these Sessions in the QQ workspace and refreshes account-linked display titles on incoming messages. Settings rows read schema versions 1–3; saves write version 3. QQ requests cap output, including reasoning, at `maxCompletionTokens` (default 16,384), preserving input space when adapters default to large output reservations; smaller explicit caps remain effective.

Automatic group replies use an independently configured QQ decision model or explicitly inherit the shared route and five recent messages; private input bypasses this decision. Decisions and unanswered observations persist in the source Session. Replies also receive the recent page, without audit message identifiers or pagination cursors; model-facing participant relationships omit numeric confidence. The innate `genesis_qq_history` tool pages older local messages in this QQ conversation only. Input/output budgets, interruptions, disposal and deletion are described in the [QQ guide](../../../docs/genesis/qq.md).

The QQ guide describes bounded image/video/file reading, scoped media sends, same-conversation message quotes and genuine decision probabilities. History exposes attachment IDs separately from truncated text, and `genesis_qq_read_media` accepts an attachment ID or a locally retained message ID on later turns. Verified same-conversation quotes also admit their media. Original bytes use the attachment store; conversion requires managed subprocesses and an enforcing sandbox. QQ-only model preferences and recent probability receipts use an independent version-1 domain; keys use the existing credential service.

An archived QQ Session stays paused until the operator restores it. Settings report allowed conversations blocked by archival; incoming messages cannot restore them or reserve input IDs. See [conversation restoration](../../../docs/genesis/qq.md).

Default media origins allow HTTPS subdomains through `https://*.qq.com` and explicitly include `https://multimedia.nt.qq.com.cn`; deployment overrides of `mediaOrigins` must include every intended origin explicitly. See the QQ guide for download restrictions.

The operator-only `genesis_message` tool searches platform-resolved targets, sends text, forwards recent original operator messages and checks delivery receipts. Configure separate `outboundGroups` and `outboundUsers`; both default to empty and do not inherit incoming permissions. Cold targets are opened without a model turn. Durable reservations prevent repeated identical tool calls from resending; unknown outcomes remain inspectable after restart. See [cross-conversation messaging](../../../docs/genesis/qq.md#cross-conversation-messages) for limits, configuration, attribution and deletion.

<a id="implementation"></a>
## Implementation

<details>
<summary>Implementation internals</summary>

QQ settings require no global compaction service; window policy delegates to the backend in the conversation preset. [cordis.patch.yml](cordis.patch.yml) registers settings without connecting. [controller.ts](src/controller.ts) serializes connection and credential changes, drains the old transport and restores independently versioned nonsecret settings; tokens use the existing credential provider. [runtime.ts](src/runtime.ts) owns admission, per-conversation queues, Session composition and send receipts. Genesis owns person identity, relationships and source-restricted memory. Only the pinned upstream bridge's OneBot transport executes; its standalone settings, memory, reminders and full bridge runtime are not mounted. A maintained workspace patch exports transport typings, adds forward connections, retains mention-only input and settles pending actions during disposal. The build inlines the transport and includes its MIT license, so consumers do not need the workspace patch.

</details>

<a id="further-exploration"></a>
## Further Exploration

[Experimental packages](../README.md) · [Genesis](../genesis/README.md) · [QQ guide](../../../docs/genesis/qq.md) · [Upstream bridge](https://github.com/cheesehaqi/dsh-qq-onebot-bridge)

<a id="model-experience"></a>
## Model Experience

The layer supplies attributed real speakers and ordinary Life conversation input through the existing Agent inbox. Genesis owns logged identity, scoped recall and participant relationship context. Visible assistant text and explicit scoped media-tool sends reach QQ; numeric `@QQnumber` handles in groups become real mention segments, while reasoning and tool results are excluded. Models identify speakers by QQ account, current nickname and recorded name; internal person IDs remain Host attribution data. Account recognition crosses groups without sharing their private dialogue.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

An external logged-in OneBot 11 client is required. QQ includes scoped recall, current-conversation history and registered search tools; learned writing and workspace task tools run only for the bound operator's authenticated turns without toolkit activation, and other learned tools require an explicitly permitted active toolkit. Video audio transcription, Office/archive decoding, cross-conversation reply waiting and friend-request automation are unavailable. Uncertain sends require operator inspection and are never retried automatically. The dependency is pinned to GitHub source because the selected upstream release is unavailable from npm.

## Dev Note

None.
