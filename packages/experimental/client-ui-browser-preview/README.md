---
description: "Watch the character-owned browser page and recent AI actions in the right Sidebar."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-browser-preview

English | [中文](README.zh.md)

## Summary

Watch the page that the AI actually operates, together with recent browser action names and their running, succeeded or failed status. The preview shares the character's persistent browser across conversations and shows viewport images without calling a model. The authenticated Host owner can inspect tabs, click and scroll the page, type, navigate, reload or close a page.

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

Genesis workspace Web launches enable this companion by default. Open the right Sidebar guide and choose **AI browser**. Before the first successful browser operation, the panel shows an empty state. The panel displays the current page title and URL, a viewport image with its capture time, and a bounded list of action names and outcomes. It does not duplicate tool arguments or result text in the action list. Select a tab to preview it without changing the AI’s active page; **Follow AI** returns to automatic selection. Each tab has **Reload** and **Close** actions that affect the real shared browser. Closing the selected tab returns the preview to the AI’s page or a remaining page. Click the viewport image to operate the real page, scroll over it, or focus it to type and send browser keys. Local Tab moves focus out of the viewport; the **Tab** button sends Tab to the remote page. Use the text field and **Insert text** for Chinese or other IME input after focusing a page field. The address field accepts HTTP(S) URLs; **Back** returns to the previous page. Operator actions are marked separately in the recent action list.

For another Web composition, mount this plugin beside the [Playwright provider](../browser-use-playwright-mcp/README.md) configured with `mode: persistent` and `preview: {}`. The plugin has no configuration of its own. The viewer requests 30 FPS for localhost, loopback and private server IPs, and 2 FPS for public IPs or other DNS names; this classification changes cadence only, never access permissions. Actual capture speed can be lower. The provider owns sampling intervals, JPEG quality, response limits and loopback debugging access. The existing Host authentication protects the Remote stream.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Page mutations use stable page identities and share the AI tool queue. Each captured image carries its page identity; input targets that page even if preview selection changes. Scaled coordinates map to browser viewport coordinates. Capture failures disable image input, and failed text insertion retains the local draft. Stale identities fail instead of acting on a shifted tab index. Failures retain the list and show a shell-owned toast; a failed reload may already have started navigation and is not retried automatically. The companion mounts the provider's generated Remote definitions and exposes its observation stream through the shared Client resource model. A keyed tab body consumes that resource through the standard resource hook. Releasing its last holder cancels the stream; capture or transport failures retain the last image beside a visible notice. Each successful capture includes its own title and URL so another tool result cannot relabel an older image. The viewport remains an image rather than an embedded page with access to the application.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Browser use](../../../docs/subsystems/browser-use.md) — runtime provider ownership.
- [Playwright provider](../browser-use-playwright-mcp/README.md) — persistent profile and preview limits.
- [Right Sidebar](../../../docs/subsystems/sidebar-right.md) — tab composition and lifecycle.
- [Client resources](../../../docs/subsystems/client-resources.md) — stream retention and cancellation.

-----

<a id="model-experience"></a>
## Model Experience

None, as the panel uses operator-only browser operations and registers no tools, prompts or Session events.

#### KV Cache effect

None; preview images and action metadata do not enter model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The panel samples viewport images rather than streaming video. Video previews have no audio and retain the configured sampling interval; input and subsequent frames can be delayed by an AI operation. The panel does not support drag gestures, file selection or native browser dialogs, and it does not restore images or the recent action list after restart. It follows the active page identified by pinned upstream browser results; results without an active-page marker may leave the previous target selected until a later recognized result. An unavailable target reports a capture failure. Losing the connection can leave the preceding image visible until the next successful sample. Page metadata and tab counts are bounded by the provider configuration, with an explicit omitted-tab count. Preview selection is shared between operator viewers. Closing a page does not recover unsaved form data.

<a id="dev-note"></a>
### Dev Note

None.
