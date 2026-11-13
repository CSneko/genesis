---
description: "Optional OneBot 11 conversations with stable Genesis people and separate group/private Sessions."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-qq

English | [中文](README.zh.md)

## Summary

Add QQ group and private conversations to an initialized Genesis life. The source workspace includes its settings with QQ initially disconnected; upstream profiles require an explicit overlay. Explicit allowlists and authenticated OneBot connections control admission; relationships grant no host permissions. See [connection and relationship behavior](../../../docs/genesis/qq.md).

With Genesis sleep enabled, private inputs wait in durable storage and replies pause. Verified operators can wake temporarily or send `g#保持清醒`; see [sleep and recovery](../../../docs/genesis/sleep.md).

## Table of Contents

[Use](#use) · [Implementation](#implementation) · [Further Exploration](#further-exploration) · [Model Experience](#model-experience) · [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use"></a>
## Use

Choose the operator in Genesis → Contacts. The saved legacy QQ operator binding seeds the contact role during migration; after contact selection, QQ execution, sleep admission and cross-conversation sends use the contact role. Creating a meaningful person relationship automatically creates or attaches the contact with the same person ID.

From this source workspace, launch through the supported entry point, then configure the connection in Plugins → Genesis → QQ using the [QQ guide](../../../docs/genesis/qq.md):

```sh
pnpm dsh web
```

Disable QQ connection in Settings to close the transport. The patch inserts only `genesis-qq`; it requires the existing Genesis life preset, Agent, default-model, credential and durable Session services. It does not install a QQ client or initialize a second life. Configuration defaults and resource limits are in the [configuration catalog](../../../docs/config-catalog.md).

QQ preferences add a logged, bounded prompt to QQ requests only. Conversation windows default to 200k private, 400k group and 500k operator-private tokens, capped by model capacity through automatic compaction. Web groups these Sessions in the QQ workspace and refreshes account-linked display titles on incoming messages. Settings rows read schema versions 1–3; saves write version 3. QQ requests cap output, including reasoning, at `maxCompletionTokens` (default 16,384), preserving input space when adapters default to large output reservations; smaller explicit caps remain effective.

Automatic group replies use an independently configured QQ decision model or explicitly inherit the shared route and five recent messages; private input bypasses this decision. Decisions and unanswered observations persist in the source Session. Replies receive only unanswered observations from the recent window that are absent from retained context, with observed QQ message IDs for quoting and without audit sequence numbers or pagination cursors; model-facing participant relationships omit numeric confidence. The innate `genesis_qq_history` tool pages older local messages in this QQ conversation only. Input/output budgets, interruptions, disposal and deletion are described in the [QQ guide](../../../docs/genesis/qq.md).

Incoming merged chat cards are expanded through `get_forward_msg`: only the first card and up to `historyLimit` entries are read, within `historyChars`. Nested cards remain unexpanded. Forwarded names and text are unverified quoted data and grant no speaker or operator authority. Unavailable cards produce an explicit notice.

Consecutive messages by the same speaker in the same conversation wait for a one-second idle gap (`inputBatchWindowMs`, default 1000), then enter one model step together. Reaching `inputBatchLimit` (default and maximum 5) dispatches immediately. A different speaker flushes the preceding batch; groups and private conversations remain separate. Inputs arriving during a reply join the next model step instead of queuing separate follow-up turns. Original message IDs and attribution remain distinct. Sleeping private inputs still enter the durable sleep inbox. The short pre-admission buffer is process-local; shutdown cancels its timers and reports any undispatched messages so senders can resend.

Ordinary replies and quoted text split at blank lines; single line breaks stay in the same message. Parts also respect `messageChars` and wait `messageIntervalMs` (default 500 ms) after the preceding acknowledgement. Incoming decisions and ordinary replies/media sends use separate per-conversation queues; the next model step and turn completion wait for queued deliveries to settle. An acknowledgement confirms OneBot acceptance, not recipient reading. Group `@QQnumber` becomes a real mention. To quote an observed message, use `genesis_qq_send` with `kind: "reply"`, its `messageId` and `text`; recent group context and `genesis_qq_history` supply IDs. Cross-conversation text also splits at blank lines and uses the same interval, while retaining literal mentions.

The QQ guide describes bounded image/video/file reading, scoped media sends, same-conversation message quotes and genuine decision probabilities. History exposes attachment IDs separately from truncated text, and `genesis_qq_read_media` accepts an attachment ID or a locally retained message ID on later turns. Verified same-conversation quotes also admit their media. Original bytes use the attachment store; conversion requires managed subprocesses and an enforcing sandbox. QQ-only model preferences and recent probability receipts use an independent version-1 domain; keys use the existing credential service.

After a QQ Session is archived, the next admitted message from that user or group creates a new Session; later input and restart recovery use the latest binding. The old Session remains archived, retaining history, person relationships and message deduplication evidence. Unarchiving it does not change the current binding. Proactive sending never replaces an archived target by itself. To pause input, disable the QQ connection or remove the allowed target. See [conversation restoration](../../../docs/genesis/qq.md).

Default media origins allow HTTPS subdomains through `https://*.qq.com` and explicitly include `https://multimedia.nt.qq.com.cn`; deployment overrides of `mediaOrigins` must include every intended origin explicitly. See the QQ guide for download restrictions.

The operator-only `genesis_message` tool searches platform-resolved targets, sends text, forwards recent original operator messages and checks delivery receipts. Configure separate `outboundGroups` and `outboundUsers`; both default to empty and do not inherit incoming permissions. Cold targets are opened without a model turn. Durable reservations prevent repeated identical tool calls from resending; unknown outcomes remain inspectable after restart. See [cross-conversation messaging](../../../docs/genesis/qq.md#cross-conversation-messages) for limits, configuration, attribution and deletion.

Generated [speech](../genesis-speech/README.md) can be sent as a playable voice message: pass its current-conversation attachment ID to `genesis_qq_send` with `kind: "file", asVoice: true`. WAV validation runs before reservation or network sending; unknown acknowledgements retain the existing do-not-retry behavior.

The same tool also discovers an enabled [AI partner conversation](../genesis-companion/README.md). Its internal sends use the partner provider and may start a bounded exchange, while QQ sends retain their existing cold-target behavior and allowlists. Partner receipts remain distinct from QQ acknowledgements.

<a id="implementation"></a>
Autonomous QQ conversation uses separate `proactiveGroups` and `proactiveUsers` deployment allowlists, empty by default. Existing operator-requested outbound permissions grant no autonomous access. Only an admitted Genesis reflection can use this route, under persistent global cooldown and sending limits. Delivery reuses the text journal and platform acknowledgements; see [idle conversation](../../../docs/genesis/spontaneity.md).

## Implementation

<details>
<summary>Implementation internals</summary>

QQ awaits registration of its message-evidence projection before starting the controller. Transport replacements share one ready reader; replay reconstructs source evidence without sending messages.

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
