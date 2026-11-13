---
description: "Connect an internal AstrBot partner, preserve attributed relationship understanding and respect independent sleep schedules."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-companion

English | [中文](README.zh.md)

## Summary

Genesis can meet an AstrBot partner in a private internal conversation and retain a revisable understanding across restarts. The source-workspace Web composition includes the settings, with connection and interaction disabled initially. QQ messages continue through Genesis's existing QQ integration; this package has no QQ sending path.

## Table of Contents

[Use](#use) · [Implementation](#implementation) · [Further Exploration](#further-exploration) · [Model Experience](#model-experience) · [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use"></a>
## Use

Start the supported source-workspace entry point:

```sh
pnpm dsh web
```

In AstrBot, create a OneBot v11 reverse-WebSocket adapter with a loopback listener and a shared token of at least 16 characters. In **Plugins → Genesis → Companion**, save the same token, set its URL (normally `ws://127.0.0.1:6199/ws`), enable connection and internal conversations, then save. Check the sampled connection status. Select a topic explicitly and choose **Start one conversation**; connecting or waking alone never starts a model. Refresh to inspect progress and use **Stop conversation** to cancel. The [AstrBot documentation](https://docs.astrbot.app/en/platform/aiocqhttp.html) owns its adapter setup.

Only loopback `ws:` endpoints without credentials, query or fragment are accepted. The shared secret belongs to the existing credential provider as `GENESIS_COMPANION_TOKEN`; settings return only its presence. Removing the managed secret does not remove an inherited environment value. A failed or disconnected connection requires saving settings to reconnect; there is no automatic conversation replay.

Configure Genesis's schedule in **Sleep and waking** and the partner's independent IANA time zone and daily interval in this section. Overnight intervals are supported. Either sleeping side blocks new internal model triggers; active work stops when sampled or before the next request or event write. Waking one side does not wake the other or start a conversation. Genesis uses its existing keep-awake control; the partner override defaults to 30 minutes through `wakeMs`. Blocked replies are rejected rather than queued for later delivery. This gateway controls only the triggers it sends to AstrBot, not AstrBot's process or its other channels.

The partner identity, every recorded conversation Session, settings and internal message receipts survive restarts in `genesis_companion`. Connection does not establish familiarity or trust. Partner statements remain unverified claims; Genesis's own life memory and reflection own any lasting relationship understanding, not this package. Settings retain bounded recent history and link to source Sessions, which are inspectable but cannot initiate another internal turn. Stopping or disabling preserves these records. For complete text deletion, delete the referenced Sessions through the operator's Session management and remove the corresponding partner storage through the operator's storage deletion procedure; retain a matching whole-home backup before recovery. Removing the entire partner domain intentionally discards its identity and relationship.

The existing `genesis_message` tool lists the partner as an `internal` destination with a `companion:` target and its stable `sessionId`. In an operator Web conversation, or the QQ conversation where the current speaker is the verified operator, use `targets`, then `send` with that exact target and selected text. The first outgoing text is sent verbatim without another model rewriting it; AstrBot replies can trigger the bounded internal exchange. `forward` shares only a selected original operator text from the initiating conversation. `status` accepts only receipts owned by that source Session. The receipt reports `emitted` for a completed internal socket write and `uncertain` for an unknown outcome; it never claims QQ delivery. Repeated identical requests within the same operator input reuse their durable receipt, including after restart. No source transcript or unrelated private memory is forwarded automatically.

With the Web workspace registry, a newly created conversation appears in the **AI** workspace under the partner name; `cwd` controls its dedicated directory. Legacy Sessions retain their original workspace metadata and remain reachable through **Open source conversation**. Existing idle Agents opened from history are reused, and stopping interaction preserves those borrowed Agents. Archiving the conversation pauses internal interaction until explicitly restored.

<a id="implementation"></a>
## Implementation

<details>
<summary>Implementation details</summary>

[The layer](cordis.patch.yml) registers an internal preset and the settings owner. [The controller](src/controller.ts) creates a bounded tool-free Agent using the current main-model route and the actual life name. It supplies only partner-local history and the current attributed interpretation, logs model inputs and outputs through the normal Agent loop, and records accepted peer messages before returning internal receipts. No operator profile, unrelated life memories or QQ conversation is forwarded. Internal Sessions cannot run ordinary user inputs or tools, including after reopening from history.

[The transport](src/transport.ts) connects as OneBot's Universal reverse-WebSocket client, using virtual self account `10002` for AstrBot and correspondent `10001` for Genesis. These are local protocol addresses, not QQ accounts or operator identities. It supports private text events, lifecycle and heartbeat, basic login/status/version/friend queries and text sends to this single correspondent. Groups, media and arbitrary actions are rejected. A successful send action means durable internal acceptance; an emitted event means its socket write completed, not that AstrBot read it or that QQ delivered anything. Repeated identical action echoes on the same connection reuse their receipt; reused echoes with changed text fail. Missing echoes cannot deduplicate retries, and deduplication does not span new connections. Interrupted event writes remain uncertain and are never retransmitted.

[The store](src/state.ts) retains a versioned life-bound partner identity and message journal, rejects mismatched or malformed data, and refuses to replace a missing projection when its identity record remains. Unknown writes fence dependent work until verified reload. Capacity refusal retains prior records. Deployment Config owns message, history, token, time, frame, queue and storage limits. The default maximum is three Genesis replies per manual exchange, with no more than one accepted partner reply after each. The final partner reply is recorded without triggering a fourth model request;  Each new exchange starts its own Session, and the conversation page continues the Session it shows; nothing is locked to one conversation. Existing installations adopt the most recent recorded partner Session once and preserve earlier Sessions. A missing published Session fails visibly. `contextChars` bounds the serialized model history; exceeding it refuses the next request rather than silently dropping history. Restart reconnects an enabled socket but never restarts a conversation. Unload stops model and network work before releasing storage.

</details>

<a id="further-exploration"></a>
## Further Exploration

[Genesis](../genesis/README.md) · [QQ](../genesis-qq/README.md) · [Sleep](../../../docs/genesis/sleep.md)

<a id="model-experience"></a>
## Model Experience

Internal exchanges mount the configured `lifePreset`, so Genesis keeps its identity and life context while tools stay restricted and no external-action path is exposed. Genesis replies as plain chat text, and the model pauses an exchange through its own `genesis_companion_pause` tool; the conversation model is never asked for JSON and needs no empty-reply convention. The partner's name and the conversation are the only partner facts supplied; nothing summarises an impression on Genesis's behalf. QQ conversations do not receive this private partner context. Prior partner text consumes bounded input tokens. Sessions are separate from QQ and operator conversations, so their KV cache is independent. AstrBot's own prompt, model use and lasting memory are owned by AstrBot; OneBot connectivity alone does not implement its memory.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

This is a restricted OneBot 11 implementation for one text-only internal partner. It does not arbitrate QQ speech, automatically forward human messages, schedule autonomous chats, manage AstrBot's other channels or establish subjective consciousness. The local Loader smoke uses a scripted main model and a loopback AstrBot peer; a real AstrBot deployment and real-model responses require deployment verification. The Web interface is built locally; rendered browser interaction is not part of the smoke.

## Dev Note

None.
