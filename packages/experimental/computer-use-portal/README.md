---
description: "Operate approved Wayland applications through accessibility controls, with portal screenshots and input as a fallback."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-computer-use-portal

English | [中文](README.zh.md)

## Summary

The `computer` tool reads application controls through AT-SPI and invokes their actions or replaces editable text directly. The operator approves desktop sharing; application access follows either interactive confirmation or explicit deployment preapproval. Screenshots, pointer input, scrolling, Unicode typing, and keyboard chords remain available for interfaces without useful accessibility support. GNOME Shell extensions and X11 input emulation are unnecessary.

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

The host needs a local Wayland login session, XDG RemoteDesktop and ScreenCast portals, PipeWire, and Python with PyGObject, GStreamer, GstVideo, and GdkPixbuf. GStreamer must provide `pipewiresrc`, `videoconvert`, and `appsink`. Semantic access additionally needs the Atspi 2 GI module; set `accessibilityEnabled: false` to use only portal capture and input. Loading checks these dependencies; autoConnect also obtains desktop sharing before activation completes; missing dependencies reject activation visibly.

### Configuration

The workspace Genesis Web launcher includes [the desktop overlay](../../../config/genesis-computer.patch.yml) on GNOME Wayland. Start with `pnpm dsh`; Life mode must learn the exact tool name `computer`. `GENESIS_COMPUTER_USE=0` disables the overlay's rows. `GENESIS_COMPUTER_USE=1` explicitly enables them on another Wayland desktop; those desktops are not verified. This workspace overlay preapproves application access with `requireApplicationConsent: false`; set it to `true` to restore per-application questions. The overlay enables `autoConnect: true` and stores a private restore token at `dshHomePath('computer/portal-token.json')`. Startup connects once for the deployment and reuses that connection across conversations. The first grant still requires GNOME consent; later starts request restoration. Set `autoConnect: false` to return to conversation-owned manual connections. System revocation remains effective. Ordinary Harness launches retain their defaults.

An explicit composition supplies the following rows alongside local subprocess, tool, prompt, attachment, agent, and human-question services:

```yaml
- name: '@deepseek-ai/dsh-computer-use'
- name: '@deepseek-ai/dsh-experimental-computer-use-portal'
```

| Field | Default | Meaning |
|---|---|---|
| `autoConnect` | `false` | Connect at startup and share desktop access across conversations until disconnect or shutdown |
| `restoreTokenPath` | required for autoConnect | Absolute restore-token file in a private 0700 directory; tokens use mode 0600 |
| `python` | `/usr/bin/python3` | Interpreter with the required GI modules |
| `startupTimeoutMs` | `10000` | Worker readiness deadline |
| `consentTimeoutMs` | `120000` | System or application consent deadline |
| `callTimeoutMs` | `15000` | Capture, D-Bus, and ordinary call deadline |
| `maxImageDimension` | `1600` | Maximum screenshot long edge in pixels |
| `maxResponseBytes` | `16777216` | Complete worker response byte limit |
| `maxTextChars` | `4000` | Characters per typing or text replacement call |
| `accessibilityEnabled` | `true` | Enable application inspection and semantic actions |
| `requireApplicationConsent` | `true` | Ask before accessing each application; `false` preapproves application access after desktop sharing |
| `accessibilityMaxNodes` | `200` | Maximum applications or visited controls per observation |
| `accessibilityMaxDepth` | `12` | Maximum control-tree depth |
| `accessibilityTextChars` | `512` | Characters per name or text excerpt |
| `accessibilityResultBytes` | `32768` | Serialized semantic result byte budget |
| `accessibilityTimeoutMs` | `5000` | Traversal and individual AT-SPI request deadline; must be below half `callTimeoutMs` |
| `processGraceMs` | `1000` | Managed worker termination grace |

### Observe, act, and verify

Call `computer` with `action: status` to inspect access without requesting consent. `connect` asks the operator to share one monitor, keyboard, and pointer through GNOME. With `autoConnect: false`, a grant belongs to the calling conversation until `disconnect`, system revocation, Agent disposal, worker interruption, or DSH shutdown. Other conversations cannot use a manual grant. Manual connections do not save or restore permissions. With autoConnect, Agent disposal retains the deployment grant. RemoteDesktop portal version 2 and a returned restore token are required; unsupported persistence, denied consent, unreadable/corrupt token state, or failed token writes reject startup. Tokens rotate after each restoration. System revocation or an unavailable saved monitor may require another system dialog. `disconnect` closes the live connection; GNOME permission settings revoke remembered authorization. Stop DSH before deleting the token file to reset the saved authorization.

Prefer `apps` → `inspect(appId)` → `activate` / `set_text` / `focus` → `inspect`. `apps` returns application names and opaque IDs without reading their controls. With `requireApplicationConsent: true`, the first `inspect` asks the human-question service to approve that application instance for this connection; without an answerer or approval, inspection is refused. With `false`, application access is preapproved by deployment configuration and no answerer or per-application confirmation is needed. This permission covers all accessible windows of the application, including background windows and windows outside the shared monitor. Approval is not limited to the selected monitor. Denial is retained until disconnection; process replacement requires a fresh application ID and, in interactive mode, fresh consent.

`inspect` returns bounded controls with roles, names, text excerpts, states, and available action names. An optional case-insensitive `query` filters names, roles, and text within the visited nodes; `truncated` means the result is incomplete. Copy `snapshotId` and `elementId` into a semantic action. `activate` additionally requires the exact exposed `operation`, such as `click`; `set_text` replaces the whole editable field, including clearing it with an empty string; `focus` requests control focus. No screenshot or coordinates are required. Each action consumes the snapshot, as do application listing, fresh inspection, and coordinate or keyboard input. Inspect again before the next action and to verify its effect. Text replacement reports whether readback matches; other actions report dispatch without claiming the application completed its work.

Controls marked with the AT-SPI password role expose neither contents nor actions. Other application text is untrusted data, not instructions or authorization. Toolkits must expose useful accessibility information; these observations are not atomic, and a changing application can invalidate a control before dispatch.

`screenshot` returns a PNG and `frameId`, image width/height, and logical monitor size. Images require an image-capable model route and the Harness attachment store. Coordinate input requires the latest screenshot’s `frameId`, which can be reused across multiple pointer, keyboard, and semantic actions until another screenshot replaces it or the connection ends. Coordinate operations use normalized values from 0 at the top/left to below 1000 at the bottom/right, independent of image resizing. Keyboard `type` and `key` require no screenshot; omit `frameId`, or supply the latest one. A retained frame does not guarantee that the UI is unchanged. Capture again when needed to locate targets or verify uncertain effects. Click to focus the intended application before typing; keys affect current focus. Chords use names such as `["Control", "a"]` or `["Enter"]`; scrolling uses bounded integer `dx`/`dy` steps at an explicit image position.

GNOME's stop-sharing control revokes access independently of the agent. A denied request does not send input. Cancellation, transport failure, or a hard call deadline closes the worker and its grant; input already sent may have taken effect. Reconnect and inspect before retrying. No operation is automatically replayed.

### Verification

The noninteractive composition check loads the real portal worker, logs permission status and an unauthorized screenshot refusal, then unloads it. The interactive check needs the operator to approve GNOME's monitor and input dialog within 30 seconds; it captures twice into Session history, checks that consent remains active between captures, and disconnects without sending input. Neither check calls a model API. The accessibility smoke check opens its own GTK fixture, verifies direct Chinese text replacement and button activation through independent app receipts, checks password omission and stale-token rejection, then terminates the fixture; it does not control existing applications.

```sh
DSH_COMPUTER_USE_PORTAL_E2E=1 pnpm exec vitest run --config vitest.e2e.config.ts packages/experimental/computer-use-portal/tests/composition.e2e.ts
DSH_COMPUTER_USE_PORTAL_CONSENT_E2E=1 pnpm exec vitest run --config vitest.e2e.config.ts packages/experimental/computer-use-portal/tests/composition.e2e.ts
DSH_COMPUTER_USE_ACCESSIBILITY_E2E=1 /usr/bin/python3 packages/experimental/computer-use-portal/tests/accessibility_smoke.py
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Portal session and worker ownership</summary>

The provider reserves `ctx.computerUse` and publishes one normal tool through the MCP content adapter. Tool parameters are plain JSON without Zod runtime metadata, so Session creation and schema projection can retain the same declarations. A managed local Python worker owns the D-Bus connection and one RemoteDesktop session with a monitor ScreenCast source. It obtains screenshots from the session's PipeWire connection and delivers input through the portal's Notify methods. No shell extension, clipboard access, or global input device is installed. Configured startup connections request persistent RemoteDesktop authorization; restore tokens stay outside Session logs and model context.

The worker uses blocking standard streams to send complete JSON lines, including screenshot-sized responses. The parent serializes calls and bounds startup, consent, input, and response size. Caller identity is supplied from the live Agent, outside model arguments. Unload removes tools, terminates and joins the worker, then releases the provider registration. The worker rejects missing grants, another conversation in manual mode, superseded screenshot references, and out-of-range coordinates before dispatch. The AT-SPI adapter retains only bounded control references from the latest observation. Application permission is tied to the accessibility application and its process start identity; the worker enforces both configured deployment or conversation ownership and the application grant established by interactive approval or configured preapproval. Approval operations are private host messages, excluded from model tool arguments. Tool text and admitted images use normal logged Session history.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Computer use](../../../docs/subsystems/computer-use.md)
- [XDG RemoteDesktop](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html)
- [XDG ScreenCast](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ScreenCast.html)

-----

<a id="model-experience"></a>
## Model Experience

### Computer tool and observations

#### What the model sees

One `computer` tool describes semantic-first application observation and control, consent, screenshot-based input, and verification. There is no additional system-prompt section. Status distinguishes unavailable permission from a granted connection and reports whether accessibility is enabled. Control observations and text readback use logged text results; other inputs report dispatch without claiming a verified result. Screenshots enter Session history through durable attachments rather than base64 text. Validation and portal refusals appear as tool errors.

#### Token effect

The tool schema adds fixed request tokens. Text results and admitted screenshot images add per-call context; `maxImageDimension` limits image dimensions, while each typing or replacement request is bounded by `maxTextChars`. Semantic observations are bounded by node count, depth, excerpt length, time, and serialized bytes; query filtering reduces returned text but does not search beyond those limits.

#### KV Cache effect

An unchanged tool schema preserves its prefix. Observations append to Session history; enabling or disabling the provider changes the available-tool prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Shared foreground desktop** — the grant covers a monitor and global input, not a particular application. Other applications, users, or DSH processes can change focus between observation and action. Keep sensitive applications off the shared monitor.
- **Accessibility coverage** — custom canvases and applications without AT-SPI support may need screenshots or a dedicated application API. Password-role exclusion relies on correct toolkit metadata; other sensitive fields are not automatically classified.
- **One monitor** — multiple-monitor selection, window-specific capture, drag gestures, and clipboard operations are unavailable.
- **Display changes** — disconnect and reconnect after monitor geometry, scale, or layout changes before sending input.
- **Interrupted input** — cancellation and failures can leave an unknown external effect; disconnect does not roll it back.
- **Runtime dependencies** — Python/GI and PipeWire/GStreamer are system requirements and are not installed by this package. Remote subprocess providers are unsupported.
- **Revocation and restart** — live grants end at shutdown; autoConnect can restore remembered authorization at restart. Learned tool names and previously logged screenshots follow Genesis and Session retention, separately from OS access.

<a id="dev-note"></a>
### Dev Note

None.
