---
kind: upgrade-guide
description: "Minecraft connection choices move from saved settings to explicit connection parameters."
---

# Minecraft connection parameters

English | [中文](guide.zh.md)

## Change

Minecraft settings no longer contain `host`, `port`, `username`, `auth`, `version` or `sessionId`, and the settings page no longer has a Connect button. `minecraft_connect` requires `host` and `username`; optional `port` defaults to 25565 and `version` defaults to automatic detection. Game notifications use the calling character's current Life conversation.

The authenticated `genesisMinecraft.connect` method now accepts a `MinecraftConnection` before its cancellation signal. It creates a connection-owned Life conversation; it does not select a saved target.

## Migration

1. Enable Minecraft access and configure monitoring in Settings → Minecraft. Existing version 1 settings are validated and retain monitoring preferences; old connection fields are ignored, and the next save writes version 2. Invalid stored data still fails visibly.
2. Ask the character to connect through `minecraft_connect`, supplying the server and offline player name. Existing learning, toolkit and permission requirements still apply. Remote callers must supply `{ host, port, username, version }` to `genesisMinecraft.connect`.
3. Confirm the settings page shows the connection status and actual game conversation ID. Use Stop or Disconnect to end activity. Restarting does not reconnect automatically.
