---
description: "Operate Chromium through Playwright MCP with isolated, attached, or shared persistent browser state."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-browser-use-playwright-mcp

English | [中文](README.zh.md)

## Summary

Use Playwright MCP to inspect pages and operate Chromium through its upstream tools. The provider initializes a Session's MCP connection before creation or resume completes and retains it across turns. Launch a separate browser, attach one Session to an existing browser, or share a persistent profile across Sessions. This published experimental package activates only when explicitly mounted.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount both entries before creating or resuming a Session, in a profile composition that supplies Agents, tools, system prompts, and the working-directory service. Launch and attach modes do not adopt Sessions that are already active; persistent mode publishes shared tools after provider startup. Browser installation follows the upstream runtime; select an existing Chromium installation with `executablePath`.

```yaml
- name: '@deepseek-ai/dsh-browser-use'
- name: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp'
  config:
    mode: launch
    headless: true
```

Use `mode: attach` and set `endpoint` to an HTTP(S) debugging URL or WS(S) browser endpoint to operate an existing browser. The new live Session claims the attachment during initialization and retains it until unloading. If the attachment is busy, that activation continues without this browser and does not retry on later turns. After release, a newly created or resumed activation can acquire it. Direct calls from another Session fail. Cleanup disconnects and leaves the external browser and its pages running.

| Field | Default | Meaning |
|---|---|---|
| `mode` | required | `launch`, `attach`, or `persistent`, fixed for this provider activation |
| `userDataDir` | required for persistent | Absolute, non-root browser profile directory |
| `headless` | `true` | Launch without a visible window |
| `executablePath` | upstream discovery | Chromium executable for launch |
| `endpoint` | required for attach | Existing browser debugging endpoint |
| `toolCallTimeoutMs` | MCP client default | Per-call timeout in milliseconds |
| `preview` | disabled | Persistent-mode Web preview |
| `preview.intervalMs` | `500` | Remote sample period in milliseconds (2 FPS), minimum 1 |
| `preview.localIntervalMs` | `1000 / 30` | Local/LAN sample period in milliseconds (30 FPS), minimum 1 |
| `preview.timeoutMs` | `5000` | CDP connection and screenshot timeout in milliseconds |
| `preview.jpegQuality` | `60` | JPEG quality from 1 to 100 |
| `preview.maxImageBytes` | `1048576` | Maximum raw JPEG bytes per image |
| `preview.actionLimit` | `30` | Retained action records, from 1 to 200 |
| `preview.tabLimit` | `50` | Maximum listed open pages, from 1 to 500 |
| `preview.tabTextChars` | `2048` | Character limit per page title and URL |
| `preview.inputTextChars` | `4096` | Character limit per operator text insertion or navigation address |

Use `mode: persistent` with `userDataDir` to share one browser and its login state across all Sessions in this deployment. The provider serializes individual tool calls, closes the browser before stopping MCP, and retains cookies with an expiry and website local storage across normal restarts. Separate multi-call workflows can still interleave. The directory must be a real directory rather than a symbolic link; newly created directories are private. Chromium rejects a profile already in use by another process. Tools report that failure without selecting another profile. Back up or delete the directory only after stopping DSH; it contains sensitive website data. Open tabs, session storage, and cookies without an expiry are not guaranteed to survive a restart.

In Web, set `preview: {}` alongside `mode: persistent` to enable the [preview companion](../client-ui-browser-preview/README.md), mounted separately, in the right Sidebar guide. Open it to see the current page title, URL, a viewport image and recent action names with running/succeeded/failed status. Genesis workspace defaults enable it. Preview sampling runs only while the panel is held, targets 30 FPS for viewers using a loopback/private server IP and 2 FPS for other addresses, and does not call a model or execute MCP tools. Capture duration counts toward the sample period; slower captures reduce the actual rate. Public DNS names use the remote rate even when they resolve to a private address. Only the authenticated owner can view the shared profile. Images and action metadata remain in process memory; the viewer copies no tool arguments or result text into its action list. The owner can list tabs, choose a preview without changing the AI’s page, and click, scroll, type, navigate, reload or close a page. Mutations share the AI tool queue and reject stale page identities. Preview images and action history do not survive restart. Capture failures retain the previous image with a visible stale notice. This mode opens a Chromium debugging endpoint on loopback; other local processes can reach that endpoint.

The [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-experimental-browser-use-playwright-mcp) lists accepted fields. The profile or preset selects the browser mode. The child process clears inherited `PLAYWRIGHT_MCP_*` options so they cannot replace that configuration.

When configuring the system prompt's `toolOrder` for the whole process, leave browser tools under `<unlisted-tools>`. Explicitly listing browser tool names can make prompt assembly fail for Sessions without a browser connection.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Video-inspection guidance is a prompt section; tool declarations are owned by the selected executor.

The provider resolves its pinned npm entry and starts it under the current Node executable. A temporary protocol probe may precede the serving process. The [shared runtime](../browser-use-runtime/README.md) owns awaited Agent initialization, per-Session serialization, and cleanup; the [MCP client](../../mcp/mcp-client/README.md) owns transport, discovery, and result projection.

Browser state survives turns while its live Session remains attached. The MCP server starts in the Session's validated current working directory and retains that launch directory after later Session directory changes. Disposal waits for server shutdown before releasing resources. Launch mode starts fresh browser state after reload. Persistent mode reloads website data from `userDataDir`; the Session log does not contain a browser-profile backup. Its MCP working directory is the DSH launch directory, while launch and attach modes use the Session directory.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Browser use](../../../docs/subsystems/browser-use.md) — provider selection and Session ownership.
- [Browser-use service](../../browser-use/browser-use/README.md) — exclusive provider registration.
- [Playwright MCP](https://github.com/microsoft/playwright-mcp) — upstream installation and browser behavior.

-----

<a id="model-experience"></a>
## Model Experience

### Browser tools and screenshots

#### What the model sees

Tools use upstream JSON schemas under `mcp__playwright-mcp__<tool>` names. Coordinate mouse tools are enabled. Screenshot and evaluation descriptions explain visual inspection and HTML video playback. Take a screenshot without `filename` to return its image; a named screenshot only saves a file. HTML video can be played, paused or sought through `browser_evaluate`, then inspected using screenshots after playback or seek completion. This samples visual frames without audio or continuous video understanding. Text and screenshots use the normal tool-result pipeline and Session log. Screenshots require an attachment store and an image-capable model route; other routes receive the MCP image diagnostic. The MCP client also exposes resource helpers and attributed server instructions. Launch and attach modes expose instructions and targeted resources only to the owning Session. Persistent mode shares its tools, instructions, pages, and website identity across Sessions; each caller records its own tool results.

#### Token effect

The catalog, resource helpers, and server instructions add tool definitions and prompt text. Calls add arguments, text, and admitted images to Session history. Inline image bytes stay outside model-visible history.

#### KV Cache effect

An unchanged catalog preserves its tool-definition prefix. Results append to history; provider or catalog changes can reduce prefix reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The integration retains the pinned server's browser and tool restrictions.

- Chromium only; Firefox and WebKit are not selectable.
- MCP startup failure rejects provider activation in persistent mode, or Session creation/resume in other modes. Reconnection is disabled. Fix the cause and reload the provider; launch/attach mode also requires a new or resumed Session.
- Attachment exclusivity is local to this provider instance. Other processes and browser users can still modify the same pages.
- In launch and attach modes, the shared resource-server inventory can show inherited server names; it does not grant access to another Session's browser.
- Cancellation does not undo navigation, clicks, or other actions already delivered to the browser.
- Tool schemas follow the pinned experimental dependency and carry no DSH stability promise.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
