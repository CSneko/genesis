# Genesis first awakening

English | [中文](awakening.zh.md)

This tutorial starts the optional single-character experience on the existing Web profile. It requires the [memory pipeline](memory.md) and the Genesis browser companion. Foundation-only deployments retain their existing behavior.

## Configure and start

Workspace Web launches default to `~/.genesis-harness`; set an explicit absolute `DSH_HOME` to choose another location. Keep the same home and storage root across launches and profiles to continue the same life. Do not run two writers against it.

Build the workspace using the [run instructions](README.md), then launch. You can leave the embedding environment variables unset and configure the service in the browser:

```sh
pnpm dsh web
```

The workspace launcher supplies all three Genesis overlays and defaults to port 4004. Explicit `--port` overrides it. Restart an existing unnamed life with the same `DSH_HOME` and storage configuration; do not delete life data to trigger naming. The [run instructions](README.md) explain how to launch ordinary Harness without these defaults.

First-run configuration shows LLM, Decision model and optional Embedding model. LLM follows the existing DSH model selection without a second credential. In Settings → Knowledge Base, choose cloud configuration or local quick deployment for decisions; embeddings may stay disabled for text retrieval and initialization. The life overlay initially uses `deepseek-official` / `deepseek-v4-flash` for chat and TypeSafe `jev-latest` for cloud decisions. Explicit `GENESIS_WRITER_PROVIDER` / `GENESIS_WRITER_MODEL` values retain a dedicated writer; otherwise memory and temporary summaries inherit the current shared LLM. Existing saved custom routes remain unchanged until edited. See [memory configuration](memory.md) for deployment, credentials and retrieval limits. No key enters life history.

Configuration reminders offer Do not show again, stored as `ui-settings-general.credentialOnboardingDismissed` through Host settings. Dismissal survives reload and restart without disabling manual Models settings. Naming never opens automatically: click Initialize life on the new-conversation screen, Life information or Knowledge Base. When configuration is ready, the button opens the naming form. Saving probes embeddings and names the existing identity. Failed checks retain the name; storage or backup errors require inspecting both copies before retrying. Conflicting reinitialization cannot rename or replace a life.

## Meet her

After the explicit initialization action, saving the name creates and opens a Life-mode conversation and triggers her first greeting. The built-in prompt is logged with source `genesis-awakening`, never as a user introduction. She knows her recorded name and birth, basic language and gentle character guidance, but no personal user facts or shared experiences. Introduce yourself and teach her over as many turns as needed. A pending named life keeps Enter the first conversation available. The button disappears only after a successful text reply completes in the canonical first Session; that completion and the original identity survive restart.

An independent reviewer runs after the reply and decides whether information is worth retaining. A separate writer validates sources and stores memories and embeddings with the local backup. The conversation model cannot promise that an unreviewed introduction is already saved. Use Genesis → Memories to inspect and manage the resulting memories after refreshing. See [memory](memory.md) for costs, bounded inputs, errors and recovery.

## Teach a tool

Life mode is the fifth selectable preset and the deployment default for new conversations. Standard, PTC, Minimal and Creator modes retain their original Harness task behavior and independent transcripts, without life identity, emotion or memory updates. Only Life mode applies the newborn character prompt and learning restriction. Its initial tools are `learn` (学习), `genesis_recall` (回忆), and `genesis_plan` when life planning is enabled. The main model manages its lasting commitments through the plan tool and chooses readable IDs. Recall uses approximate topics or related words and does not need explicit learning. Teach other exact tool names through `learn`, one at a time, without a catalogue; successful learning makes ungrouped tools available in later Life-mode requests.

Learning is shared across Sessions and restarts. A removed or scope-restricted tool remains learned but cannot run until available again. Unknown names produce a refusal without revealing alternatives. A monotonic executor guard denies unlearned tools even when a caller forges a name or bypasses prompt assembly; independent sandbox and approval policy still apply after learning. Learning does not install plugins or grant permissions.

## Enable a toolkit

Open Settings → Toolkits to create or edit groups. The default “电脑操作” toolkit collects browser and desktop tools. Exact names and prefixes ending in `*` are supported. Only groups with at least one learned member appear in character context. For example, after teaching `computer`, ask her to enable “电脑操作”; she can call `genesis_toolkit` with `action: enable` and `id: computer-operation`. The next request includes every learned, currently available member. New conversations start disabled; reopening the same conversation restores activation. Removing a toolkit releases its learned members unless another group contains them. See [toolkit settings and recovery](../../packages/experimental/genesis/README.md#toolkits). QQ also supports per-toolkit activation audiences; see [QQ toolkit permissions](qq.md#qq-toolkit-permissions).

<a id="personal-directory"></a>
## Personal directory

The life overlay creates a private directory at `$DSH_HOME/personal` (normally `~/.genesis-harness/personal`). Its path and files persist across conversations, workspaces and restart on this host. After she learns both `read` and `write`, logged Life context tells her the path, and sandbox policy grants it alongside the current workspace under `workspace-write`. Actual tools must still be available; learning is not authorization to bypass read-only mode or operator controls.

`personalDirectory` accepts an explicit absolute non-root path. Existing directories must be private, owned and nonsymlinked. Once recorded, a missing or changed directory refuses startup; restore the same files instead of silently creating an empty replacement. Back up personal files separately from the life JSON backup. New policy resolutions lose the extra grant when Genesis unloads; already running confined processes retain launch-time grants until they exit.

## Context and recovery

Short-term context belongs only to the current Session. Starting an unrelated Life Session shares the life ID, name, learned tools and long-term memories, but never copies old messages, tool results or auxiliary memory-call logs. Declarative knowledge requires active embedding-backed recall; the bounded non-declarative layer and related-memory cues enter logged context; detailed sources and previous interpretations remain available through recall. Resuming the same Session intentionally resumes that Session's own context.

Life mode selects the character prompt and omits optional runtime contexts that disclose unlearned tool names. Its tool presentation must be native. The other presets keep their own prompts and tool presentation, including PTC; life context and tools are excluded, and their interactions do not update life memory, emotion, interests or capability history. The normal execution policies apply in every mode. Learned abilities are tool access and memory, not model weight training, autonomous goals or unsolicited wake scheduling. The life overlay also enables independent [emotion appraisal](emotion.md).

The identity is reserved durably when the plugin starts; naming marks its first awakening. Birth time and life ID never change during naming. First-conversation and learning events are durable, idempotent life facts, separate from conversational context. The leading workspace `--no-genesis` switch disables default Genesis behavior; explicitly composed profiles can omit the life overlay. Neither deletes the life; keep the same storage, backup and lease when restoring it. Do not delete identity data to repeat the naming flow.
