# Genesis Phase 1

English | [中文](README.zh.md)

## Summary

Keep one life identity across Sessions and models, retain sourced candidate memories, and inspect actual Session tool availability and system growth. Genesis is optional and does not establish subjective consciousness.

## Contents

[First awakening](awakening.md) · [Memory](memory.md) · [Temporary memory](temporary-memory.md) · [Emotion](emotion.md) · [Interests](interest.md) · [Motivation and decisions](motivation.md) · [Proactive messages](social.md) · [Architecture](architecture.md) · [Data model](data-model.md) · [Development](development.md) · [Roadmap](roadmap.md) · [Writings](records.md) · [Remote access](remote-access.md) · [Workspace tasks](tasks.md) · [QQ conversations](qq.md) · [Spontaneous cognition](spontaneity.md) · [Sleep](sleep.md)

## Run from this workspace

Use Node.js 24 or newer for the default Genesis Web composition and install the workspace dependencies. Run the commands from the repository root. A complete build requires Git metadata; a source archive without `.git` cannot supply the build commit.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build:artifacts
pnpm run build:check
```

`--ignore-scripts` avoids package installation hooks; build the required native artifacts through the repository build command. A live model conversation needs a configured Harness model provider. The automated Genesis tests use a scripted adapter and need no API key.

Web launches in this workspace load the life core, first awakening, Bilibili integration and browser companion by default, listening on `0.0.0.0:4004` with browser key login. After building, run:

```sh
pnpm dsh
```

`pnpm dsh web`, `pnpm start:web` and `make web` use the same defaults, including development mode. The default `DSH_HOME` is `~/.genesis-harness`; explicit `DSH_HOME` and `--port` values take precedence, and additional `--patch` files apply after the defaults. You no longer need `PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS`. Configure an API or sign in, then complete embedding settings in Knowledge Base; see [First awakening](awakening.md).

For local browser testing, run `pnpm dsh web --test-no-login`. Open the authenticated URL printed at startup; it exchanges the launch token for a browser cookie without a key-entry form. This workspace-only flag applies the test overlay last, fixes the listener to `127.0.0.1` even when `--host` is supplied, and preserves `--port`. API authentication remains enabled; the bare root URL still requires a valid cookie. Omit the flag to return to key login. Use a dedicated temporary `DSH_HOME` for automated tests.

Use `pnpm dsh --no-genesis web` for ordinary Harness Web. This switch belongs only to the workspace launcher; the published `dsh` CLI, other profiles and Desktop retain their existing defaults. The examples below explicitly enable selected Genesis features.

### Bilibili experiences

Workspace Genesis Web includes the [Bilibili integration](../../packages/experimental/genesis-bili-humanism/README.md). Restart the service with `pnpm dsh web`, then teach its exact tool names through `learn` in Life mode. No extra patch argument is required. The integration keeps upstream personality learning, scheduled fetching and platform writes disabled; Genesis owns the candidate experiences.

### Browser control

Workspace Genesis Web also loads the existing [Playwright MCP provider](../../packages/experimental/browser-use-playwright-mcp/README.md) through `config/genesis-browser.patch.yml`. All conversations share one headless Chromium browser to navigate, read pages, click, fill forms and take screenshots. Its persistent profile is `$DSH_HOME/browser/playwright`, normally `~/.genesis-harness/browser/playwright`. Install the browser required by the repository-pinned `@playwright/mcp` dependency once:

```sh
pnpm --filter @deepseek-ai/dsh-experimental-browser-use-playwright-mcp exec playwright-mcp install-browser chrome-for-testing --no-remove
```

Alternatively, set `GENESIS_BROWSER_EXECUTABLE` to an absolute Chrome or Chromium executable path. Restart DSH to load the shared browser tools. A missing executable makes browser operations fail visibly; install the matching browser or correct the executable path before retrying.

In life mode, teach exact tool names through `learn`, for example `mcp__playwright-mcp__browser_navigate`, `mcp__playwright-mcp__browser_snapshot`, `mcp__playwright-mcp__browser_click` and `mcp__playwright-mcp__browser_fill_form`. Learning, cookies with an expiry, and website local storage persist across normal restarts. Open tabs and session-only website data are not guaranteed to return. The browser directory contains sensitive login data; stop DSH before backing it up or deleting it. Individual browser calls run in order; multi-call workflows from different conversations can still interleave. Learning a tool does not grant authorization for external actions. Other presets expose the available browser tools directly. Screenshots require an image-capable model route; text snapshots work with text models. The provider is experimental; see its README for configuration and recovery limits.

Open the right Sidebar guide and choose **AI browser** to watch the same persistent browser. The panel shows the page, URL, and recent AI action statuses, updating about once per second while open. The panel lists open tabs and lets you select a preview, reload or close a real page. **Follow AI** returns to her current page; preview selection does not change her active tab. Preview images and the short action list do not survive restart or enter model context.

### Desktop control on GNOME Wayland

Workspace Genesis Web loads the [desktop portal provider](../../packages/experimental/computer-use-portal/README.md) on GNOME Wayland. Restart with `pnpm dsh` and teach the exact tool name `computer`. Its first `connect` opens GNOME's screen-sharing and remote-input consent dialog. Prefer application inspection and semantic control: list applications, select an application instance, then read its controls, invoke exposed actions, or replace editable text directly. The tool also supports screenshots, pointer input, scrolling, and keyboard chords on one shared monitor when accessibility is insufficient. Coordinate and keyboard input require a recent screenshot; keys affect the current focused application. The workspace overlay preapproves application access without per-application questions; GNOME system sharing consent is still required. The provider uses XDG portals and PipeWire without a Shell extension.

Use `GENESIS_COMPUTER_USE=0` to disable desktop tools. The provider checks required Python/GI and GStreamer dependencies at startup; see its README for configuration and recovery. Consent is temporary and must be granted again after restart. GNOME's stop-sharing control revokes access. Learning persists separately and does not grant OS permissions; screenshots require an image-capable model route.

### Explicit compositions

Opt in to the foundation with the core overlay. Use a dedicated absolute `DSH_HOME` for experiments; keep the same home on subsequent launches to restore the same life.

```sh
pnpm dsh --profile headless --patch packages/experimental/genesis/cordis.patch.yml --dump-config
```

The dump verifies composition without starting a life or calling a model. Replace `--dump-config` with a task to converse after model configuration.

For the Web status view, apply both overlays below. The left sidebar gains Genesis for identity, capabilities, growth, memories, delegated tasks and message deliveries. Model and connection configuration remain in Settings → Knowledge Base. Refresh requests a new authenticated sample.

```sh
pnpm dsh --no-genesis web --patch packages/experimental/genesis/cordis.patch.yml --patch packages/experimental/client-ui-genesis/cordis.patch.yml --dump-config
```

After building, remove `--dump-config` to start Web. The explicitly composed listener and authentication settings apply; Genesis adds no separate listener. The UI shows the last refresh time and retains a previous sample with a warning when refresh fails.

For credential-first naming, the newborn character and persistent tool learning, use the [first-awakening tutorial](awakening.md). Its life overlay includes the independent memory pipeline and limits initial model tools to learning.

## Inspect and remember

Ask for identity or birth time through `genesis_self`; search with `genesis_recall`; query facts or growth with `genesis_history`. Explicitly request a memory and include its literal content: “Please remember: I prefer oolong tea”. `genesis_remember` admits only text from the latest observed real user message and stores it as a sourced candidate.

Disable default Genesis in workspace Web launches with the leading `--no-genesis` switch; omit Genesis overlays for other profiles. Disabling the Web companion only removes its settings section. Neither operation deletes life data.

## Limits

Optional [emotion](emotion.md) maintains immediate state and slower mood; the workspace life overlay enables it. Optional [interests](interest.md) form from cited exchanges without predefined favorite topics. Optional [deliberation](motivation.md) lets the main model manage persistent motivations and cross-Session plans through explicit tools and readable IDs; autonomous task scheduling, reflection and self-improvement remain unavailable. Tool discovery records availability, not mastery or permission. The optional [memory pipeline](memory.md) adds embedding search and independent updates. Automatic plugin installation and autonomous source modification remain unavailable.

## Dev Note

None.
