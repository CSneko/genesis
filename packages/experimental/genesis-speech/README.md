---
description: "Genesis speech synthesis with configurable Alibaba Cloud CosyVoice voices."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-speech

English | [中文](README.zh.md)

## Summary

Generate WAV audio from text using Alibaba Cloud CosyVoice and keep the result as a durable conversation attachment. Configure a default built-in or custom voice in Plugins → Genesis → Speech. Requests send text to the configured provider and can incur charges. This source workspace includes the optional layer in its Genesis Web composition; ordinary Harness profiles remain unchanged.

## Table of Contents

[Use](#use) · [Implementation](#implementation) · [Model Experience](#model-experience) · [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use"></a>
## Use this package

Start the supported workspace application with `pnpm dsh web`. Store `DASHSCOPE_API_KEY` under `refs` in `$DSH_HOME/.credentials.yaml`, or set it in the Host launch environment; the settings page accepts a credential reference, never the secret value. The page comes from the optional Genesis client UI package. An explicit custom composition loads this package's `cordis.patch.yml` after Genesis and its Life preset.

The source-workspace launcher selects speech as a bundle in the Genesis Web profile, before user settings. This allows the settings page to persist route edits across restarts. Explicit home or command-line overrides retain their normal precedence.

Plugins → Genesis → Speech edits the complete HTTPS endpoint, CosyVoice model, default voice ID and API key reference (`keyEnv`). Saved route edits apply to subsequent calls through the standard configuration editor. Changes to the Host environment require a restart. The default model is `cosyvoice-v3-flash`, voice `longanyang`, and endpoint `https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`; set the regional workspace endpoint required by your Alibaba account.

The tool resolves its reference for every invocation through the standard Harness credential provider: managed `.credentials.yaml` first, inherited environment second, project `.env` third, and Harness home `.env` last. Saved credential changes reach the next call without restarting the plugin. A composition without a credential provider uses the launch environment only. The credentials document contains:

```yaml
version: 1
refs:
  DASHSCOPE_API_KEY: your-api-key
```

For a custom voice, create it in Alibaba Cloud first, then enter its voice ID and the model bound to that voice. See the [official synthesis API](https://www.alibabacloud.com/help/en/model-studio/cosyvoice-tts-http-api). This tool does not enroll or clone voices.

In an operator Life conversation, learn `genesis_speech`, then call it with `text` and optionally `voice` to override the default for that invocation. The response contains a downloadable `speech.wav` attachment and the actual model and voice IDs. Existing toolkit membership and learning policy still apply. Installation alone is not a successful synthesis record.

Set optional `rate` to a multiplier from 0.5 through 2.0; omission uses 1.0. Set `instruction` to request emotional expression or a speaking style, for example `请用温柔开心的语气说话。`. Instructions allow at most 100 weighted characters, with Han characters counting as two. Natural-language expression suits `cosyvoice-v3.5-plus` and `cosyvoice-v3.5-flash` custom voices; other model/voice combinations may require fixed instructions or reject unsupported instructions. These fields record requested expression, not a verified acoustic effect.

```json
{"text":"你好，今天见到你真开心。","rate":0.9,"instruction":"请用温柔开心的语气说话。"}
```

With the Genesis Web UI and a host-file-backed attachment provider, new results include a native audio player with playback, seeking and download controls. Audio reads use the existing authenticated file API; provider URLs and API keys are not sent to the browser. The logged output includes the local attachment path and requested rate/instruction for replay. Older results without a recorded path retain their attachment and require regeneration for inline playback. Playback is subject to the existing file API byte limit.

In QQ Life conversations, registered `genesis_speech` is available by default to ordinary speakers without learning or toolkit activation. Calls send text to the configured provider and may incur charges; an operator deployment can remove `genesis_speech` from `qqBasicTools` to require explicit toolkit permission for ordinary speakers. Call it with the same voice, rate and instruction options, then send its returned `attachmentId` with `genesis_qq_send` using `kind: "file"` and `asVoice: true`. Delivery stays in the current QQ conversation and uses its existing allowlist, byte limits and durable no-retry reservations. The OneBot implementation must support WAV voice conversion.

<a id="implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

The layer inserts the `genesis-speech` plugin row. [Registration](src/index.ts) checks the calling Life preset and operator or bound QQ session before network access, captures live settings once, and returns normal logged tool results. [HTTP synthesis](src/synthesis.ts) performs a single non-streaming request and downloads the completed audio without forwarding credentials. Provider audio URLs using HTTP are upgraded to HTTPS without changing their path or signed query. API endpoints still require HTTPS, embedded URL credentials are rejected, and neither request follows redirects. Audio download failures do not trigger a plaintext HTTP fallback. The attachment provider owns durable bytes and existing attachment retention behavior.

Defaults limit text to 2,000 characters, audio to 16 MiB and the complete operation to 120 seconds. `maxTextChars`, `maxAudioBytes`, `timeoutMs` and `lifePreset` are deployment configuration. Unload aborts requests and drains admitted work before releasing dependencies. No request is automatically retried after a timeout, network failure or restart; a failed download may follow a billable synthesis.

</details>

<a id="model-experience"></a>
## Model Experience

### Learned speech tool

#### What the model sees

QQ receives the registered speech tool declaration by default; other Life conversations receive it after learning. Each call records input text and the optional voice override; results record the selected model, voice and durable attachment reference. No speech-specific prompt or auxiliary language-model request is added. API keys and signed download URLs are excluded from returned results.

#### Token effect

The declaration and bounded text/results consume conversation tokens. Audio remains a file attachment and is not automatically transcribed or supplied as audio model input.

#### KV Cache effect

Tool calls and results append to Session history. Configuration edits affect later calls and do not rewrite earlier results.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

Only CosyVoice-compatible HTTPS synthesis is implemented. Audio is WAV at 24 kHz; automatic playback, streaming playback, voice cloning and publishing are unavailable. A downloaded response must have a WAV signature; the tool does not establish acoustic quality or speaker similarity. Local verification uses a simulated provider; paid Alibaba synthesis and browser interaction remain unverified.

### Dev Note

<details>
<summary>Working context for maintainers</summary>

None.

</details>
