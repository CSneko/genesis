---
kind: upgrade-guide
description: "Genesis uses the Numen mod through MCP in place of its previous Minecraft connector."
---

# Connect Genesis to Minecraft through Numen

English | [中文](guide.zh.md)

## Change

Genesis retires the `@deepseek-ai/dsh-experimental-genesis-minecraft` bundle, the Minecraft settings page, the `minecraft_*` tools, and the Jev monitor. Profile loading removes the retired bundle from saved selections. Numen supplies game actions through Settings → MCP services.

## Migration

1. Remove any explicit `genesis-minecraft` entries from profile overlays and any `--patch` argument pointing to the previous package. Keep the same `DSH_HOME` and life storage for the existing character, memories, and Session history.
2. Enable External brain in Numen, then [add the connection](../../../../packages/experimental/genesis-mcp/README.md#connect-numen) in Genesis. Numen uses its own companion and connection settings, so enter its endpoint and token.
3. Confirm the service is connected and ask Genesis to speak through Numen in a Life conversation. Learn the new MCP tool names when needed. The old Minecraft toolkit can be removed in Settings → Toolkits if it is still listed. Historical Sessions can still be opened.
