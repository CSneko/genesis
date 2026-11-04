---
kind: upgrade-guide
description: "Genesis connects desktop sharing at startup and reuses persistent authorization across conversations."
---

# Genesis desktop startup and browser preview cadence

English | [中文](guide.zh.md)

## Change

Genesis workspace Web launches connect desktop sharing during startup rather than waiting for a conversation's `computer.connect`. The configured deployment shares that grant across conversations and retains it when an Agent is disposed. The first launch requests system consent; subsequent starts request restoration using a private, rotating portal token. RemoteDesktop portal version 2 and persistent permission support are required. Ordinary Harness compositions retain manual connections by default.

Browser preview sampling targets 30 FPS through localhost, loopback and private server IPs, and 2 FPS through other addresses. Capture time can lower the actual rate. `preview.intervalMs` now defaults to 500 ms for remote viewers; `preview.localIntervalMs` controls local viewers separately.

## Migration

1. Continue launching Genesis through `pnpm dsh`. Complete the first GNOME sharing dialog; startup fails visibly if persistence is unavailable or the saved token cannot be read or updated. Confirm `computer` status reports connected before sending input.
2. To retain manual, conversation-owned grants, set `autoConnect: false` in [the computer overlay](../../../../config/genesis-computer.patch.yml). To disable the provider, set `GENESIS_COMPUTER_USE=0`. Keep `restoreTokenPath` private; stop DSH before deleting its token file to reset saved authorization. GNOME stop-sharing and permission controls remain effective.
3. Set both `preview.intervalMs` and `preview.localIntervalMs` in the Playwright provider if your deployment needs an explicit fixed sampling period. Public DNS names use the remote rate even if DNS resolves them to private IPs. Rebuild Host and Client artifacts together when deploying the changed preview Remote method.
