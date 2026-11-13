---
kind: upgrade-guide
description: "Genesis optional capabilities use saved profile selections and their settings move to the Genesis plugin tab."
---

# Select optional Genesis plugins

English | [中文](guide.zh.md)

## Change

The source-workspace `pnpm dsh web` launcher no longer forces QQ, Minecraft or companion patches on every start, or re-adds mail and wallet after disabling them. New profiles enable weather, speech, MCP and browser support. QQ, mail, Minecraft, wallet and companion start disabled. Existing saved bundle selections are retained when defaults are initialized; subsequent starts preserve optional selections. MCP is part of the workspace composition and is restored if missing from the selected bundles. Core Genesis services remain enabled without individual plugin cards.

Optional capability settings move from Settings to Plugins → Genesis. MCP management stays in Settings → MCP services and automatically maintains read-only service toolkits. Sexuality and intimacy settings also live there; enabled desire and attraction readings appear only on Genesis → Emotion, with pink meters. Genesis-owned packages declare author @CSNeko without changing npm names.

## Migration

1. Start through `pnpm dsh web` using the existing `DSH_HOME`. Open Plugins → Genesis and explicitly enable any QQ, Minecraft or companion integration previously loaded only by launcher defaults. Configure optional connections in this tab.
2. Remove explicit command-line copies of optional plugin patches if you want the plugin switch to control loading. Explicit patches remain authoritative.
3. Restart the same profile and confirm the chosen enabled and disabled states persist. The profile's `package.json` stores selections under `dsh.profile.bundles` and the one-time `genesisProfileDefaults: 1` marker; retain this marker. No life records or connection credentials are deleted.
4. Set your city in Plugins → Genesis → Weather before expecting automatic weather context. Existing explicit weather settings retain precedence over bundle defaults.
