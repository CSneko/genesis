---
description: "Read Bilibili materials and keep viewing notes in the shared Genesis writing system."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-bili-humanism

English | [中文](README.zh.md)

## Summary

Read Bilibili text and optional sampled frames in Life conversations, and save viewing notes alongside diaries and essays in the shared Genesis writing system. The Genesis Web defaults in this source workspace include the pinned upstream reader. Reading and writing do not automatically create long-term memories or enable scheduled fetching, upstream personality learning or platform writes.

## Table of Contents

[Use](#use) · [Configuration](#configuration) · [Implementation](#implementation) · [Further Exploration](#further-exploration) · [Model Experience](#model-experience) · [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use"></a>
## Use

Use Node.js 24 or newer with the workspace dependencies installed. The Genesis Web launcher includes this layer by default; start from the repository root and keep the same `DSH_HOME` for identity continuity:

```sh
pnpm dsh web
```

Configuration composition can be inspected without launching the server:

```sh
pnpm dsh --profile web --dump-config
```

In a Life conversation, teach `bili_humanism_guide`, `bili_humanism_read`, `bili_humanism_source` and `genesis_record` through `learn`; teach `bili_humanism_transcribe` when local transcription is needed. Read the adapted guide before a BV or video URL and state coverage. When an experience is worth retaining, inspect `genesis_record` types and use write to create a viewing note. Frames also require a supported image model, durable attachments, local dependencies and the corresponding tools. Text reading does not establish full playback.

Genesis must enable records and a private personalDirectory; the workspace Life overlay supplies both. The adapter initializes the viewing-notes category (观影札记), preserving operator renames and disabling. Include video links, source IDs, timestamped evidence and uncovered material in the body; distinguish facts, author views, feelings and inference. Search, edit and delete through the shared records interface. Writings do not automatically enter prompts, long-term memory or personality. See [writing records](../../../docs/genesis/records.md).

To disable only this integration, apply a later patch setting `disabled: true` on `genesis-bili-humanism`. Other compositions opt in with the supplied `cordis.patch.yml`. Preserve the data directory for recovery; no platform write tool is registered by this layer. Ordinary presets cannot execute its tools, and Life tool learning still does not grant execution permission.

### Local media setup

Run the upstream installer once with the same private data directory as the profile. It creates an isolated Python environment, installs pinned binary packages, verifies the approximately 464 MiB ASR model download and loads it on CPU/int8. It does not change global Python. For the default workspace home, run from the repository root:

```sh
BILI_HUMANISM_HOME="${DSH_HOME:-$HOME/.genesis-harness}/bili-humanism" node packages/experimental/genesis-bili-humanism/node_modules/dsh-bili-humanism/bin/cli.mjs setup-media --asr --download-model
BILI_HUMANISM_HOME="${DSH_HOME:-$HOME/.genesis-harness}/bili-humanism" node packages/experimental/genesis-bili-humanism/node_modules/dsh-bili-humanism/bin/cli.mjs doctor
```

The workspace patch enables the learnable `bili_humanism_transcribe` tool; it requires the existing Subprocess provider. Without subtitles, use the saved reading ID from the unconfirmed result. Transcription returns a new A3 reading ID; read its timestamped text through `bili_humanism_source`, then decide whether a viewing note is warranted. It is machine ASR, not verified verbatim. Tool calls never install dependencies or download model weights. Audio and transcript assets remain private in the upstream data directory.

Frames use the same environment but also require an image-capable routed model and durable attachments. A failure to extract frames does not establish that the host cannot receive images. An unconfirmed text result retains its reading ID and visual diagnostics; successfully delivered frames remain a successful partial reading.

<a id="configuration"></a>
## Configuration

The patch adds `genesis-bili-humanism` with a private `dataDir` under the current `DSH_HOME`. Override that row in a later patch for trusted deployment configuration. Do not mount the upstream bundle separately in the same composition.

| Field | Default | Meaning |
|---|---|---|
| `dataDir` | Required; supplied by the patch | Absolute private upstream ledger and inbox directory belonging to this life |
| `credentialPath` | Empty | Optional absolute local read credential file; no account credentials are imported automatically |
| `pythonPath`, `asrModelPath` | Empty | Optional trusted absolute media executable and local ASR model paths |
| `maxReadTokens` | 60000 | Upstream estimated source-text token budget per reading; not a model billing limit |
| `maxMediaSeconds` | Unset | Optional maximum source duration; upstream request, byte and wall-time limits remain active |
| `lifePreset` | `life` | Only this composed preset may execute Bilibili tools |
| `recordTypeId`, `recordTypeName` | `viewing-notes`, `观影札记` | Stable category id and initial-only display name |
| `sourceChars` | 100000 | Complete source JSON decoding limit |
| `legacyBatchSize` | 8 | Old journals per explicit migration call, at most 50 |
| `localAsr` | Unset; workspace patch enables `{}` | Register local transcription through the existing Subprocess provider |
| `localAsr.timeoutMs`, `localAsr.graceMs` | 180000, 1000 | Complete audio/transcription deadline and process termination grace in milliseconds |
| `localAsr.maxOutputBytes` | 1000000 | Captured bytes per maintenance-command stream; truncated output is refused |

Upstream errors become failed Harness tool results; empty, unconfirmed text readings do not count as success. Learn genesis_bili_sync, start at offset=0 and follow nextOffset until null to migrate old journals. It reads the pinned upstream ledger without modifying it and retains original times, journal IDs, video sources, coverage and full text. Creation attribution identifies the actual migration Session and tool call. The original upstream ledger and previously imported life memories remain intact.

<a id="implementation"></a>
## Implementation

<details>
<summary>Implementation internals — click to expand</summary>

The adapter mounts the unmodified [upstream v1.11.3 release](https://github.com/InariNGT-Ofiicial/dsh-bili-humanism/releases/tag/v1.11.3), pinned by dependency URL and lockfile integrity. It replaces the model-visible guide, disables upstream personality learning, post-viewing questions, daily fetching and platform writes, and denies separate personal-memory and journal writes. New text uses genesis_record; no application binary is added.

Explicit migration validates a complete bounded page before serialized commits through the Genesis record owner. Each entry has a permanent receipt derived from life identity and old journal ID; cross-Session retries preserve operator edits and never recreate deleted content. Migration first confirms durable Session persistence for the source call. Records use the existing storage format and Markdown recovery. Unknown storage outcomes stop dependent work; restore access and restart before retrying synchronization. Unloading cancels and drains active operations before upstream storage closes.

</details>

<a id="further-exploration"></a>
## Further Exploration

[Genesis](../genesis/README.md) · [Memory](../../../docs/genesis/memory.md) · [Upstream project](https://github.com/InariNGT-Ofiicial/dsh-bili-humanism)

<a id="model-experience"></a>
## Model Experience

### Reading and shared writing

#### What the model sees

Learned reading tools expose bounded materials, timestamps and coverage. The guide directs writing through genesis_record; genesis_bili_sync returns migration receipts and continuation offsets. Only received text and images can support interpretation; tool results and record reads use normal Session logging.

#### Token effect

Reading and writing use the conversation model’s normal budget. Migration adds no auxiliary model call or archive dump to the prompt. Record search uses substring matching without an embedding call.

#### KV cache effect

Tool results enter the durable conversation; saved writings enter context through explicit reads or search results. The adapter adds no changing system-prompt section.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Integration checks cover real upstream tools, storage and managed process cleanup; media command outputs and model decisions use synthetic fixtures. Successful local extraction or transcription does not verify subtitle accuracy, ASR wording or visual model understanding.
- Legacy migration is explicit, not automatic at startup or Session restore. Entries commit individually; retry the same offset after an interrupted page. Record length or capacity limits reject instead of silently truncating text.
- Notes remain unverified personal expression, not automatic facts, long-term memories or personality; deletion of original upstream archives and Session logs is independent.

<a id="dev-note"></a>
### Dev Note

None.
