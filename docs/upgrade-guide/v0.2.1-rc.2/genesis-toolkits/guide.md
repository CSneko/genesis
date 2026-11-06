---
kind: upgrade-guide
description: "Learned browser and desktop tools require per-conversation toolkit activation in Genesis awakening mode."
---

# Genesis toolkits

English | [中文](guide.zh.md)

## Change

In Genesis awakening mode, learned browser and desktop tools previously entered every new conversation automatically. The default “电脑操作” toolkit now keeps them hidden until the AI enables that toolkit through `genesis_toolkit`. Groups with no learned members remain absent from character context. Learning and existing permissions are preserved. Ordinary Harness task presets are unaffected.

Ordinary QQ speakers are limited to four Playwright browsing operations even if an existing toolkit broadly grants browser access. Script execution, form input, file transfers and tab management require the authenticated operator and the existing permissions. QQ browsing rejects non-HTTP(S) navigation, embedded URL credentials and output filenames. New catalogues include the public `browser-reading` toolkit; saved catalogues are preserved. Browser pages and logins still follow provider ownership, including the workspace's shared persistent profile.

Bound operator private QQ conversations now use Web tool permissions, including toolkits with disabled QQ access. Groups and other private conversations retain QQ audience restrictions. Registered declarations stay injected when speaker or permission changes deny execution; explicit toolkit closure removes them, and successful compaction retires unused declarations. Re-enable a toolkit when its retired members are needed.

## Migration

1. Launch through the supported `pnpm dsh web --test-no-login` workspace entry or your existing Genesis-enabled `dsh` profile, with rebuilt Host and browser artifacts.
2. Open Settings → Toolkits to review names, descriptions and member rules. Saved edits override the Genesis plugin's `toolkits` defaults; use an empty catalogue to keep all learned tools outside groups. Removing a group releases its members unless another group contains them.
3. In a Life conversation, let the AI enable “电脑操作” when needed. Only learned and currently available members enter the next request; unlearned names still require `learn`. A new conversation starts disabled, while reopening the same conversation restores its recorded activation.
4. Confirm that a fresh conversation omits member schemas and that enabling the toolkit exposes learned members. See [toolkit behavior](../../../../packages/experimental/genesis/README.md#toolkits) for limits, revision conflicts and separate preference storage.
5. For an existing QQ catalogue, add a `qqAccess: anyone` toolkit containing only `mcp__playwright-mcp__browser_navigate`, `mcp__playwright-mcp__browser_snapshot`, `mcp__playwright-mcp__browser_take_screenshot` and `mcp__playwright-mcp__browser_wait_for` when shared browser state may be exposed to QQ. Confirm that a non-operator can browse after learning and activation, while script calls and screenshot filenames are refused. Keep private browser state outside QQ access; see [QQ permissions](../../../genesis/qq.md#qq-toolkit-permissions).
