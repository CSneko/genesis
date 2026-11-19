---
description: "Bounded screen observations for Genesis with replaceable capture sources."
kind: "package-bundle"
---

# @deepseek-ai/dsh-genesis-see-now

English | [中文](README.zh.md)

## Summary

Genesis can inspect its host desktop and the browser displayed on it, or sample a short interval into one numbered image. The source workspace loads this optional integration in its Genesis Web composition. Observations use existing desktop-sharing grants, an image-capable conversation model, and ordinary logged tool results. The integration uses [dsh-see-now](https://github.com/SAOS-3624/dsh-see-now) frame selection and composition; see [Third-party notices](THIRD_PARTY_NOTICES.md).

## Table of Contents

[Use](#use) · [Configuration](#configuration) · [Implementation](#implementation) · [Further Exploration](#further-exploration) · [Model Experience](#model-experience) · [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use"></a>
## Use

Launch through `pnpm dsh web`. The Genesis workspace adds this bundle automatically; `--no-genesis` retains ordinary Harness behavior. To inspect composition without capturing or calling a model, run `pnpm dsh web --dump-config`.

Select a model that declares image input. Teach the exact tool name `see_now`, then enable the **屏幕观察** toolkit (`genesis_toolkit`, action `enable`, id `vision`) in the current conversation. `see_now` accepts `action: watch` (default), `status`, or `stop`, an optional registered `source`, and an optional observation duration `seconds`. Zero seconds captures one current frame. The default is three seconds, with a fifteen-second maximum. Status reports source registration without asserting authorization. Stop cancels and joins this conversation's observation; an in-flight provider read drains within its deadline, preserving the shared-desktop connection unless that read fails or times out. GNOME's stop-sharing control revokes that connection.

The default `host-desktop` source is contributed by the [Wayland portal provider](../computer-use-portal/README.md). It requires a running shared connection and enforces its existing deployment or Session grant. A stopped worker is not restarted by a screenshot request. Use `computer` status/connect to inspect or restore sharing. Only private operator Life conversations may execute `see_now`; learning and toolkit activation remain required. Browser windows must be visible on the shared monitor. Existing browser tools can capture background pages independently.

<a id="configuration"></a>
## Configuration

Override the `genesis-see-now` row through a profile patch. All fields are validated at load; `seconds` must not exceed `maxSeconds`.

| Field | Default | Meaning |
|---|---|---|
| `lifePreset` | `life` | Allowed preset |
| `source` | `host-desktop` | Default registered source; missing sources fail without fallback |
| `seconds` / `maxSeconds` | `3` / `15` | Default and maximum observation seconds; provider calls have their own deadlines |
| `fps` | `2` | Sampling frequency; slow providers reduce actual frequency |
| `maxFrames` | `4` | Maximum selected frames in one returned image |
| `width` / `height` | `1280` / `720` | Per-frame bounds; aspect ratio is preserved without enlargement |
| `maxConcurrent` | `2` | Concurrent observations across conversations |
| `maxImageBytes` | `8388608` | Source and composed-image byte limit |
| `maxImagePixels` | `16777216` | Decoded source pixel limit |

<a id="implementation"></a>
## Implementation

<details>
<summary>Implementation internals — click to expand</summary>

Each tool call owns an isolated upstream pipeline and a cancellation controller. Source images are bounded and decoded before RGB24 samples enter the pipeline. Selected frames become one durable attachment in the normal tool result. Cancellation, Agent disposal and plugin disposal join owned work. No capture resumes on restart. Life identity, learned tools and sourced growth observations use existing Genesis persistence; neither source registration nor a historical successful capture grants current access.

Capture sources register independently of keyboard and pointer providers through `ctx.computerUse.registerCapture({ name, capture })`. Source names use `ComputerUseProviderName` from `@deepseek-ai/dsh-computer-use/brand`. The callback receives the calling `SessionId` and `AbortSignal`, enforces its own permission on every invocation, and returns `{ png, capturedAt }`. It must settle owned work on cancellation. Registration returns an effect disposer; providers drain calls before closing their resources. Desktop companions can supply another source without replacing Genesis tool, attachment or memory handling. An authenticated remote transport must establish its own user/device authorization before registering a source; image content cannot grant itself authority.

</details>

<a id="further-exploration"></a>
## Further Exploration

[Genesis subsystem](../../../docs/subsystems/genesis.md) · [Computer-use capture registration](../../computer-use/computer-use/README.md) · [Source patch](cordis.patch.yml)

<a id="model-experience"></a>
## Model Experience

### Screen observation

#### What the model sees

The learnable `see_now` declaration describes finite observation, source selection and untrusted screen text. Successful observations return source, capture time, sampled-frame count, numbered selected-frame times, duration and one image attachment. Status and stop return text metadata. Images and metadata are logged through ordinary Session tool results. Screen pixels are observations, not established memory facts or executable instructions. The tool captures no audio.

#### Token effect

The tool declaration adds fixed tokens while exposed. Each requested observation adds image and metadata tokens; retained-frame, duration, image and source-provider budgets bound acquisition. No background capture or model wakeup occurs.

#### KV Cache effect

Tool learning and toolkit activation affect declarations. Observation results append to conversation history; screen images are retained under existing Session and attachment policies. The plugin does not delete historical attachments when sharing stops.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The supplied source uses the existing Linux Wayland portal connection and sees one shared monitor. A remote Web client does not share its own screen. Local-screen transport, desktop companions, audio, continuous wakeups and upstream floating windows are not included. The pipeline detects visual change rather than semantic importance. Stop ends finite observations without withdrawing the operator's desktop-sharing grant. Visual interpretation depends on the selected model; successful capture does not verify its understanding. Changes in source dimensions abort the current observation.

<a id="dev-note"></a>
### Dev Note

None.
