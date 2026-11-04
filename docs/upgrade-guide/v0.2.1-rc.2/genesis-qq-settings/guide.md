---
kind: upgrade-guide
description: "Genesis QQ connection setup moves from the environment overlay to persistent settings."
---

# Genesis QQ connection settings

English | [中文](guide.zh.md)

## Change

The source workspace's Genesis Web composition includes QQ settings. The QQ overlay no longer reads `GENESIS_QQ_WS_URL`, `GENESIS_QQ_BOT`, `GENESIS_QQ_OPERATOR`, `GENESIS_QQ_GROUPS` or `GENESIS_QQ_USERS`. An unsaved connection is disabled. Saved choices reconnect on restart; upstream Harness defaults remain unchanged. Existing QQ admission-policy and life data remain readable.

Conversation policy rows accept schema version 1 and explicitly inherit the new prompt/window defaults. Saving writes schema version 2; older builds refuse that row instead of discarding its fields. Custom Remote clients must supply `extraPrompt`, `privateContextTokens`, `groupContextTokens` and `operatorContextTokens` when saving the complete policy. Back up settings before downgrading. QQ display titles and workspace grouping follow the current account/group IDs; existing Session IDs remain stable.

QQ conversation requests now cap output, including reasoning, at 16,384 tokens through `maxCompletionTokens`, rather than inheriting a potentially much larger adapter default. Smaller explicit caps are preserved. This prevents an output reservation from consuming most of the configured conversation window. Existing Session history remains readable; its old logged reservation can cause one compaction before the first new request.

## Migration

1. Start with `pnpm dsh web`; the extra QQ `--patch` argument is unnecessary in this workspace.
2. Open Settings → QQ connection. Save the shared OneBot token, then copy the old endpoint, bot and operator accounts into connection settings. Enable and save the connection. The credential provider uses `GENESIS_QQ_TOKEN`; managed values take precedence over inherited values.
3. Copy any unsaved group and private allowlists into Conversation access and save. Existing saved policy retains its values. Verify status and send one allowed message through your logged-in OneBot client. See the [QQ guide](../../../genesis/qq.md) for connection, restart and credential-removal behavior.

4. Restart the Host to load the QQ output cap. Deployments needing longer QQ reasoning or replies can set `genesis-qq.config.maxCompletionTokens` in their profile patch; increasing it reduces available input space. Check the next QQ `request/header` for the effective `maxTokens`.
