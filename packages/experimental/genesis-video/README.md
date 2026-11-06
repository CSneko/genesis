---
description: "Persistent Genesis Remotion projects, local media editing, sandboxed rendering and restart recovery."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-video

English | [中文](README.zh.md)

## Summary

Create video projects from local footage, timed captions, music and custom React scenes, preview the composition directly in Remotion Player, then deliver PNG previews or MP4 exports. This optional layer supplies a learnable operator-only Genesis toolkit. Project revisions survive restart; interrupted renders require an explicit new job. Rendering uses the calling Session's existing file policy and an already installed Chromium browser.

## Table of Contents

[Use](#use) · [Implementation](#implementation) · [Further Exploration](#further-exploration) · [Model Experience](#model-experience) · [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use"></a>
## Use

The source workspace includes this layer in its Genesis Web defaults. Install Remotion dependencies with `pnpm install`. Install the local renderer browser explicitly with `pnpm --filter @deepseek-ai/dsh-experimental-genesis-video exec remotion browser ensure`, and set `GENESIS_VIDEO_CHROMIUM` to the absolute executable path printed by that command. The tool never installs dependencies or browsers. FFprobe must already be available; `GENESIS_VIDEO_FFPROBE` selects another trusted executable.

Start through the supported launcher:

```sh
GENESIS_VIDEO_CHROMIUM=/absolute/path/to/chrome-headless-shell pnpm dsh web
```

For an ordinary Harness profile, apply the Genesis base and Life overlays before this package's `cordis.patch.yml`; keep the deployment's existing Genesis memory/model configuration. The video overlay inserts `genesis-video`, stores projects under `dshHomePath('video-projects')`, and reads the two environment selectors above. Normal Harness defaults remain unchanged with `--no-genesis` and without this overlay.

Teach the exact tool name `genesis_video` through `learn`, then enable the “视频制作” toolkit with `genesis_toolkit` in that conversation. The toolkit is installed once; later operator edits or removal are preserved. Only the configured operator Life preset may execute it, including when a caller bypasses schema visibility. Group speakers cannot obtain video access by supplying a name or a project identifier. Editing and rendering require a writable Session file policy; the deployment grants this private project directory only to operator Life Sessions that have learned the tool.

Call `action: "guide"` for operation inputs and configured environment limits. Create an empty timeline project, import local media, and save a revision referring to the returned asset names. Timeline layers support video/image/color clips, source trimming, volume, cover/contain sizing, edge fades, timed titles/captions and audio. Overlapping layers with fades can form dissolves. Custom source exports a default React component and can import React/Remotion; use `staticFile` with imported asset names. All times in the built-in timeline are seconds, rounded to the selected frame rate.

Call `preview` with the project/revision IDs to compile an interactive Remotion Player. It needs no MP4 render or headless browser. The returned `previewPath` is the project’s stable `preview.genesis-remotion.html`; return it as a Markdown file link so the operator can open the Genesis sidebar viewer. `snapshotPath` retains the immutable preview for that revision/job. Rebuilding another revision updates the stable file; use the shared sidebar reload control to refresh an open preview. The viewer offers playback, seeking, volume and fullscreen, plus Open in browser and Download preview. Hidden sidebar previews pause. The viewer isolates scene code in opaque frames with no Host callbacks, and permits only embedded data/Blob media; import remote footage before building a preview.

Render `preview`, `final` or `still`; the tool returns a job ID immediately unless `wait: true`. Inspect `status` for bounded recent progress and terminal process facts, or `cancel` to stop and drain the process range. Live renders also register with the existing Harness jobs service, so its operator job controls can stop them. Cancelling an active owning turn, conversation disposal, archive-with-stop, plugin unload and the configured deadline stop owned rendering. A completed process establishes successful rendering, not a visual or audio quality judgment. Use `status` with `deliver: true` to attach a verified completed PNG/MP4 to the conversation.

Use `read` and `list` with explicit pagination to resume an existing project. Revisions preserve the previous source and timeline instead of overwriting them. `delete` with `confirm: true` removes one inactive project, imported copies and local outputs; delivered attachments and Session logs have separate retention/deletion owners. Unloading the plugin removes tools and grants without deleting projects.

-----

<a id="implementation"></a>
## Implementation

<details>
<summary>Artifact, process and permission ownership</summary>

The private root has a versioned receipt binding it to the existing Genesis life ID. Missing ownership on a nonempty directory, another life ID, incompatible records and unreadable JSON fail visibly; no new life or replacement project is created. Version 1 revision artifacts contain source/timeline settings, parent revision, creation time and originating Session/tool-call IDs. Render admission and terminal receipts are separate versioned files. No Session format or Life Core persistence format is changed.

Each render materializes one revision in a fresh job directory and invokes the pinned Remotion CLI through the managed subprocess provider. The Session sandbox wraps that exact argv; no operation requests escalation. The profile must provide local filesystem, subprocess, sandbox, jobs and attachment services. React/Remotion aliases and CLI options are deployment-owned; model source cannot supply Node configuration. Executable custom scenes retain the Session's standing file/network authority and are not a separate security sandbox.

Admissions for project mutations serialize. Projects, revisions, assets, jobs, input/output bytes, Player artifact bytes (`maxPreviewBytes`, 24 MiB by default), duration, concurrent render jobs, render workers and elapsed work have explicit configuration limits. Asset import and output verification buffer at most their configured byte limits. Output limits apply to delivery/verification, not an operating-system disk quota. Failed writes with uncertain publication stop further editing/rendering until verified reload. Failed jobs retain bounded diagnostics; partial outputs cannot be delivered as completed media. Delivery rechecks file length and SHA-256 before storing an attachment.

Restart loads artifacts only. An admission without a terminal receipt and without an owned process reports `interrupted`; it never becomes `completed` from a leftover output file and never restarts automatically. Explicitly render the same revision again to create a separate job. Read-only inspection does not execute saved source. Source, timeline and model-visible result evidence remain in normal tool-call/result events; background progress reaches the model only when requested through a logged status result.

Sources: [registration and budgets](src/index.ts), [artifact/process owner](src/controller.ts), [versioned parsers](src/model.ts), [timeline composition](src/composition.ts), [model operation guide](src/guide.ts).

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Genesis toolkits](../genesis/README.md#toolkits) · [Genesis subsystem](../../../docs/subsystems/genesis.md) · [Application profiles](../../../docs/architecture.md#application-launch) · [Remotion rendering](https://www.remotion.dev/docs/renderer) · [Remotion license](https://www.remotion.dev/docs/license)

<a id="model-experience"></a>
## Model Experience

### Learned tool and requested results

#### What the model sees

The registered `genesis_video` schema appears after ordinary learning and toolkit activation. The exact declaration is owned by [index.ts](src/index.ts), outside the product-only tool catalog's scope. `guide` returns the fixed [operation guide](src/guide.ts) plus actual configuration facts; other results contain selected artifact IDs, source slices, metadata, process facts or attachment references. Browser configuration, learning, successful rendering and visual review are distinct facts. No video-specific system prompt or auxiliary model request is added.

#### Token effect

Schemas add conditional context after learning/activation. Each result is bounded by `resultChars`, source reads by `pageChars`, lists by `pageSize`, and progress by `progressChars`. Rendering consumes local CPU/process resources and makes no model calls. Video frames and speech do not automatically become model input or established memories.

#### KV Cache effect

Tool calls/results append to the Session history. Learning or activating the toolkit changes subsequent tool declarations through Genesis's existing logged mechanism. Project edits and background render progress do not replace prior prompt tokens; new requested status results append their own observations.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Interactive previews embed source and imported media in a bounded self-contained document. Large footage must be shortened or reduced to fit `maxPreviewBytes` and Workspace Files’ complete-file read limit (32 MiB by default). Preview compilation does not certify browser codec support or playback quality; this is the Remotion Player, without the full Studio editor.
- Local rendering requires explicitly installed Chromium and FFprobe; automatic browser/dependency installation, cloud rendering, transcription, voice generation, automatic visual review and publishing are unavailable.
- Timed text uses installed system fonts. Install suitable CJK fonts for Chinese captions; font presence and rendering quality need inspection on the deployment host.
- Browser-backed integration verification requires `GENESIS_VIDEO_CHROMIUM`; the ordinary artifact/recovery test runs without a browser. Model-driven verification uses a deterministic model adapter, not a real provider.
- Revisions form an immutable parent-linked history and may branch; there is no implicit current revision or automatic source merging. Original footage remains untouched, but executable custom source can modify files allowed by the Session policy.
- Scene code must use already installed dependencies; browser/network access follows the deployment's existing controls. Remotion licensing depends on the deployment and organization; consult its current terms before broader distribution.

### Dev Note

None.
