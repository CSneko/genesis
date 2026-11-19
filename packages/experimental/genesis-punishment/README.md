---
description: "Send a configurable Genesis punishment level to an operator-selected webhook."
kind: "package-bundle"
---

# @deepseek-ai/dsh-genesis-punishment

English | [中文](README.zh.md)

## Summary

Send a punishment level to your own webhook from a private operator Life conversation or an explicitly enabled QQ group. You choose the tool description, level semantics and destination. The default description suggests 0.0–1.0, but the tool accepts any finite number without clamping. This plugin is optional and sends nothing at startup.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Start this checkout with `pnpm dsh web`. Open **Plugins → Genesis → Punishment**, enter the webhook URL, tool description and level description, then save. Enable the Punishment switch in the Genesis plugin list. The integration is built in and disabled by default; no environment variable or extra launch patch is needed. Settings and the switch survive restart, and saved changes apply without restarting or sending a test request.

Teach Genesis `genesis_punish` and enable the `punishment` toolkit through `genesis_toolkit`; enabling the plugin does not imply learning or toolkit permission. The source launcher selects this [profile bundle](cordis.patch.yml) before applying saved profile settings. The configuration switch controls activation; do not add the bundle patch again with `--patch`, because command-line overlays apply after saved settings.

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Live switch; disabling aborts active requests and rejects later calls. |
| `allowGroupChats` | `false` | Allow transport-bound QQ groups; tool learning, toolkit activation and QQ permissions still apply. |
| `webhookUrl` | Empty | Absolute HTTP(S) destination; embedded credentials and fragments are rejected. |
| `webhookHeaders` | `{}` | Private HTTP headers such as `Authorization`; Content-Type is always application/json. |
| `description` | Owner punishment instructions | Complete model-visible tool description. |
| `levelDescription` | Conventional 0.0–1.0 scale | Model-visible meaning of `level`; no enforced range. |
| `lifePreset` | `life` | Allowed composed Life preset. |
| `timeoutMs` | `10000` | Deadline for a single delivery attempt. |

For authentication, add `webhookHeaders` under the row's `config`, using environment-derived values rather than committed secrets. Do not put credentials in either description. An empty webhook URL prevents delivery. Clearing the address and saving removes the configured destination.

A call such as `genesis_punish({"level": 0.5})` sends one HTTP POST with JSON body `{"level":0.5}`. The body contains no conversation, memory or identity data. A 2xx response returns `{"accepted":true,"level":0.5,"status":204}` when the receiver responds with HTTP 204. This confirms HTTP acceptance only; the plugin does not verify the downstream action. Webhook response bodies are discarded and never treated as instructions.

Private operator conversations using `lifePreset` can execute the tool. To permit QQ groups using that preset, turn on **Allow group chats** in the Punishment settings and save. The group must still have a valid toolkit activation and pass existing QQ tool permissions. The switch applies to all admitted QQ groups; QQ private chats and unrelated presets remain refused. Turning it off rejects subsequent group calls. Existing tool guards remain applicable. Configuring a wider scale in a description does not expand runtime permissions.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

The [plugin](src/index.ts) registers a learnable managed toolkit and uses ordinary Session tool calls and results for model-visible logging. Integration initialization records availability separately from learning and successful use. Editable settings use serializable validation so the browser can validate the configuration received from the Host. The destination remains deployment-owned; model arguments cannot choose a URL. Unloading unregisters the tool, aborts active requests and waits for their completion. No new persistent event format or replay-triggered delivery is introduced.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Genesis](../genesis/README.md): Life ownership and tool learning.
- [Architecture](../../../docs/architecture.md): profile composition and tool execution.
- [Tool authoring](../../../docs/cookbook/adding-a-tool.md): guards and logged results.

<a id="model-experience"></a>
## Model Experience

### Configured tool and delivery result

#### What the model sees

Once learned and enabled, the model sees the configured descriptions and one required numeric `level` argument. Results contain the submitted level, HTTP status and acceptance flag, or a credential-free failure message. The tool schema and results enter the ordinary Session log. The default Web presentation uses the generic tool card.

#### Token effect

The configured descriptions add declaration tokens while exposed. Each invocation appends a small result; no webhook response body enters context.

#### KV Cache effect

Learning, toolkit activation and description edits can change declarations. Delivery results append to history. No background prompt or wakeup is created.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

Delivery guarantees stop at the receiver's HTTP response.

- Redirects are refused. Requests are never retried automatically, including after HTTP rejection, timeout or cancellation.
- After dispatch, a network failure, cancellation or non-2xx response cannot establish whether the downstream action occurred. Check the receiver before sending again; there is no durable exactly-once delivery mechanism.
- Level descriptions guide model selection but do not enforce an intensity policy. Receiver-side validation owns any physical or application-specific limits.
- Enabling the plugin grants network access to its fixed operator-selected destination; it does not acquire a per-call shell sandbox or ask for a separate approval.

<a id="dev-note"></a>
### Dev Note

None.
