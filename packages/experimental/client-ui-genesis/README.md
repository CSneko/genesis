---
description: "Genesis life information, Knowledge Base configuration and independent memory management."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-client-ui-genesis

English | [中文](README.zh.md)

**People and messages → Mail** automatically refreshes paginated mail metadata and safe text previews, including operator-only blocked mail, independently of whether the character has read it. **Plugins → Genesis → Mail** owns account credentials, unrestricted/address/domain recipient policy, proactive sending and receiving-service verification; see the [mail guide](../genesis-mail/README.md). Local deletion from trash preserves text-free replay suppression and leaves server mail, Session logs, memories and backups separate.

Optional adult character sexuality is off by default and configurable on Plugins → Genesis → Sexuality and intimacy. Enabled intimacy readings appear only in Genesis → Emotion, with pink desire and attraction meters. The plugin page edits settings. Desire normally returns to a moderate baseline and shares emotion appraisal; private state, retention and limits are documented in [Sexuality and intimacy](../../../docs/genesis/emotion.md#sexuality-and-intimacy).

## Summary

Plugins → Genesis manages optional capabilities and their settings. MCP is built into the workspace composition and opens in Settings → MCP services. New workspace profiles enable weather, speech and browser support; QQ, mail, Minecraft, wallet and companion start disabled. Existing saved bundle selections are preserved. Later starts retain operator choices. Core life services remain enabled without individual plugin cards. Genesis-owned plugins identify their author as @CSNeko; package specifiers remain unchanged.

Settings → MCP services provides public catalog discovery, service details, one-action installation with required credentials, custom connections and live connection controls through the optional [MCP bundle](../genesis-mcp/README.md).

Settings → Purge offers an optional Life action-guidance switch, off by default. Save applies it to subsequent Life model requests, including QQ, and persists in independent operator preferences, including when startup overlays supply Genesis configuration. It encourages direct answers and fewer repeated confirmations while retaining character choice and execution permissions. Failed saves retain the draft and display the reported reason; stale edits require reloading the saved settings. See [Purge behavior](../genesis/README.md#configuration).

The left sidebar provides four workspaces beside Plugins and Scheduled tasks: Genesis for life information, emotion and thoughts; Memories for memories, personality and writings; Actions for delegated tasks, motivation and goals, and message deliveries; People and messages for contacts, relationships and mail. Each workspace retains its selected section when switching destinations. Knowledge Base, Toolkits and proactive sending policy remain in Settings; optional connections are configured under Plugins → Genesis. Keys use the existing credential store. Life conversations share one life and memory; ordinary presets remain isolated. Initialize life is a manual action on the new-conversation screen or Genesis overview; after naming it opens the first Life conversation. The button disappears after successful completion. Do not show again persistently suppresses automatic configuration reminders. No network listener is added.

Settings → Sleep edits schedules and wake controls; Genesis → Thoughts manages private cognition. Life conversations display the current sleep state. See [sleep](../../../docs/genesis/sleep.md). Thought output budgets use M tokens, defaulting to 50M; per-request output, request-count and tool-call-count controls are absent.

The sleep banner uses the lightweight rhythm endpoint; it does not subscribe to full life inspection when opening conversations.

Plugins → Genesis → Speech configures the optional [CosyVoice tool](../genesis-speech/README.md), including its model, endpoint and custom voice ID.

The speech tool result shows native audio playback and download controls for new locally stored WAV attachments. AI-selected speed and expression instructions remain in the logged result.

The left-sidebar **Whale vouchers** page manages currency balances, products and pending purchases through the optional [wallet bundle](../genesis-wallet/README.md); its red dot remains while requests await confirmation.


Weather is available under **Plugins → Genesis → Weather**, with independent tool and context switches; see [weather configuration and privacy](../genesis-weather/README.md).

## Table of Contents

[Use](#use) · [Implementation](#implementation) · [Further Exploration](#further-exploration) · [Model Experience](#model-experience) · [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use"></a>
## Use

Memories → Memories provides Knowledge, People, Events and Unclassified views. Browse knowledge paths, open source-grounded person portraits, or edit classification, directory paths and subject names in the memory editor. Changing organization preserves the original content, attribution and source references.

Model configuration has three shared entries: LLM follows DSH by default, decisions inherit the knowledge decision route, and embeddings are optional. Feature-specific custom routes remain available; existing saved overrides are retained. Without embeddings, Markdown memory content uses bounded text retrieval and memory writes retain their source references. The model setup page offers cloud configuration and explicit local quick deployment. See [model configuration](../../../docs/genesis/memory.md) for local runtime support, download sources, lifecycle and limits.

People and messages → Contacts searches names, QQ numbers, email addresses and other handles. Add or edit a name, QQ, multiple email addresses, other `kind=value` accounts and notes; QQ is fixed after creation because it selects the shared relationship person ID. Deletion asks for confirmation and retains the relationship. Failed saves retain the editor draft. The operator checkbox replaces the previous operator; QQ and mail use that same selection. Meaningful QQ relationships create contacts automatically, and existing relationships are imported at startup. The AI uses the same persisted records through `genesis_contacts`; see [contact behavior](../genesis/README.md#use).

Apply this package’s `cordis.patch.yml` beside the [Genesis core overlay](../genesis/README.md) to a Web or Desktop profile with the preset registry. Rebuild browser bundles before launching. The [first-awakening tutorial](../../../docs/genesis/awakening.md) enables naming and the first greeting. Life information owns naming, identity and growth; Knowledge Base owns decision/writer/embedding settings and a saved Automatic retries count, defaulting to three additional inference attempts. See [retry behavior](../../../docs/genesis/memory.md). Memories pages through stored memories newest first, searches their text, and supports creation, editing, deletion and layer conversion. Experience times, associated experience IDs and expandable prior interpretations show how a memory formed and changed. The optional Life preset becomes the deployment default; an existing saved user choice takes precedence.

The Life preset registers `subagent`, `subagent_fork`, model discovery and child control tools. Teach each exact tool name through `learn` before use; delegation retains the existing provider limits, toolkit activation and execution permissions.

When [interests](../../../docs/genesis/interest.md) are enabled, Life information also shows their current inferred stages, cited source IDs and bounded change history. The page does not edit interests.

Memories also owns the durable automatic-consolidation toggle, explicit pass, last safe failure and learned habit cue/response/evidence. See [idle consolidation](../../../docs/genesis/memory.md#automatic-habits-and-idle-consolidation) for budgets and cancellation.

Genesis → Emotion shows nine immediate reactions, two mood dimensions and independent psychological needs, event interpretations and bounded attributed history. People and messages → People and relationships manages five operator estimates, distinguishes inference confidence from explicit operator values, and provides reason-bearing revision-fenced edits. Its editors save explicit adjustments with reasons, pause automatic appraisal, and configure sensitivity shared by emotion, recovery and relationship changes. Edits are revision-fenced and persist across restart; failed writes retain drafts, while a shell toast survives successful modal dismissal. See [emotion management](../../../docs/genesis/emotion.md#operator-management). The emotion settings editor also saves stopped-time accounting and both immediate/mood coupling gains with localized behavior hints.

Settings → Proactive message settings saves the enable switch, target conversation, timer and delivery limits through the owning authenticated Remote. Actions → Message deliveries shows sampled channel availability, the latest confirmed assistant message and bounded trigger/decision/receipt history, marking pending and uncertain outcomes. Failed setting saves retain drafts. See [proactive messages](../../../docs/genesis/social.md).

Actions → Delegated tasks reads bounded pages through the task owner’s authenticated read-only Remote. Delivery confirmation, current execution state, background activity and turn counts remain separate. Missing or unreadable evidence is visibly unavailable. Open conversation uses existing workspace navigation for results and operator execution controls; the page never creates, resumes or retries work. It does not poll or wake cold Agents. See [workspace tasks](../../../docs/genesis/tasks.md).

Settings → Toolkits separates compact group summaries from QQ permission rules. Click Edit on one group to rename it, edit membership or QQ access, or remove it; each save changes only that group under a catalogue revision check. Tool names are collapsed inside the editor. Failed or stale drafts remain open. Automatically managed MCP groups appear separately and are read-only. See [toolkit behavior](../genesis/README.md#toolkits).

The completed-reply Memory dialog also offers Whole conversation → Organize conversation memories; the writer chooses retention and mutations from the full chat and all session-related memories, reading long evidence in sections before saving the complete plan. See [whole-conversation memory behavior](../../../docs/genesis/memory.md) for filtering, budgets and atomic recovery.

Memory lists prefer saved short summaries and offer View full memory, summary-only editing and independent summary generation. Failed operations retain content and drafts; summary edits preserve sources, attribution, confidence and habits. See [short summaries](../../../docs/genesis/memory.md).

Memories offers multi-selection and explicit organization into one or several interpretations, atomically replacing originals on success and retaining selections on failure. The Life preset includes the built-in [time context](../../context/time-context/README.md), with logged clock readings and browser-zone guidance. See [selected memory organization](../../../docs/genesis/memory.md#selected-memory-organization).

Memories includes an expandable operator identity form. Saving it safely relabels current legacy participant roles; conflicts retain the draft. Direct edits and conversions add no history. The editor retains stable date anchors while character-facing recall retains important exact dates and renders ordinary experiences relatively. See [identity and memory time](../../../docs/genesis/memory.md).

The separate [Minecraft section](../genesis-minecraft/README.md) configures access, independent model selection and monitoring, with stop and disconnect controls. The AI chooses connection details through `minecraft_connect` in its current conversation. Its live status subscription runs only while the resource is open; game activity continues after closing the panel.

Settings → Temporary memories configures a separate small summary model, optional write-only endpoint key and inactivity interval, with expiry previews, immediate forgetting and failed-source retry. See [temporary memory](../../../docs/genesis/temporary-memory.md). Delivery history and temporary memories use separated sections and record cards, with full-history search and previous/next page controls.

The optional [video toolkit](../genesis-video/README.md) creates `*.genesis-remotion.html` files. Their dedicated right-sidebar viewer plays the saved Remotion composition directly, with seeking, volume and fullscreen; Open in browser opens the same isolated Player. Source edits become visible after rebuilding the preview and reloading the file. The shared file reader owns authentication, size limits and refresh. Closing the view releases its Blob URLs; hiding it pauses playback.

The built-in [AI companion settings](../genesis-companion/README.md) enable an internal AstrBot connection on demand, configure its independent sleep schedule and provide manual conversation, wake and stop controls. The source link opens one persistent partner Session shared by manual exchanges and the cross-conversation tool. Bounded internal history and attributed relationship understanding remain separate from QQ. Refresh reads current progress without starting a model.

Plugins → Genesis → Browser edits the server-side Chrome debugging address through the shared staged configuration form. Saved values survive restart and apply when the shared browser provider restarts; the current connection retains its captured address. Invalid or stale saves retain the draft. Saving does not test connectivity. See [browser setup](../../../docs/genesis/README.md#browser-control).

Settings → Toolkits → QQ tool permissions lists person and group rules without permanent input fields. Add or edit one rule in its own modal; each save retains other confirmed rules and checks the displayed revision. Failed drafts remain open; a concurrent change requires reloading. The same policy is available through the operator’s `genesis_qq_permissions` tool. See [QQ permissions](../../../docs/genesis/qq.md#qq-toolkit-permissions).

<a id="implementation"></a>
Genesis → Emotion displays an independent boredom meter alongside feelings, mood and needs. Its description distinguishes engagement from loneliness; existing readouts and editors retain their own fields.

## Implementation

The source-workspace life preset includes an isolated automatic-compaction backend. The plugin mounts the owning package’s generated Remote contribution, registers a `genesis` resource provider and contributes localized main-page sections and configuration pages and a manual memory action on completed replies in participating Life conversations. Endpoint edits use revisioned life-owned storage; keys use the existing credential store and never enter configuration or memory. Settings failures show the affected operation and specific diagnostic, including HTTP status, validation fields or connection codes, without displaying password values or provider response bodies. Memory and emotion settings show the latest reviewed turn and completion time, including no-change outcomes; Jev decisions also show their update probability and captured threshold. Memory failures in chat and Knowledge Base show the failing stage and safe diagnostic; retry errors preserve their own cause. Retry feedback resets for a new failed turn. A failed save retains the draft; refresh and Reload configuration load the latest accepted values. The shared resource model owns fetched values and retains them after failure. Credential/settings/provider changes, conversation running-status changes, user refresh and reconnection request new samples; the ordinary Genesis status resource runs no polling timer. Aborting the resource cancels RPC and releases refresh listeners.

Memories → Personality and speaking style groups enduring self tendencies and procedural speaking or behavioral habits. A dedicated bounded read selects these entries before unrelated memory previews. Add, edit, conversion and deletion reuse the existing version-fenced memory operations and editor; rejected writes retain the draft. This page does not call a model or expose trait-score controls.

The Host life plugin owns character and memory instructions. This companion creates the first Session through the existing Session API and asks the Host to enqueue its logged built-in awakening. Provider checks prepare configured routes; endpoint checks authenticate against the model catalog, and embedding testing makes one request. Memory browsing, text search and direct CRUD do not run inference. Per-reply generation uses its source conversation and the independent writer, bypasses the decision model and enforces the chosen memory layer; automatic review remains enabled. See [memory controls](../../../docs/genesis/memory.md) for version checks, sources and retry behavior.

Memories → Her writings browses, searches, reads, edits and deletes the character’s writings and manages their categories through the authenticated records Remote. Shared on-demand resources retain data on failure; captured drafts and revision checks protect edits. See [writings](../../../docs/genesis/records.md) for deletion, attribution and recovery.

<a id="further-exploration"></a>
## Further Exploration

[Run Genesis](../../../docs/genesis/README.md) · [Architecture](../../../docs/genesis/architecture.md) · [Client resources](../../../docs/subsystems/client-resources.md)

QQ settings stage an additional prompt and per-conversation context windows. Saved prompt changes reach subsequent logged QQ context; the guide describes their model and compaction effects.

QQ settings independently configure the group decision model, endpoint and write-only credential. Bounded recent outcomes display genuine probability and threshold when available; boolean-only responses explicitly have no probability.

<a id="model-experience"></a>
## Model Experience

Optional plugin controls follow active Host inventory entries, including plugins without volatile Settings fields; generated Remote stubs alone do not establish availability. The page manages Genesis through bounded Host operations. QQ prompt edits affect subsequent logged QQ context; memory previews themselves are not sent to a chat model.

#### KV Cache effect

Refreshing reads Host state without adding conversation events or inference calls. Accepted emotion adjustments and recovery settings affect subsequent logged life context; pausing emotion appraisal stops its auxiliary calls. [Emotion](../../../docs/genesis/emotion.md) owns these model effects.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The view is sampled. One-time naming is available only in awakening mode; it does not replace identity, promote memories, edit permissions or continuously poll.
- Response budgets may omit previews; counts and omission notices expose that distinction. Historical inactive Session tools are not listed as live capabilities.

### Dev Note

None.
