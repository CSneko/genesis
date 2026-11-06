---
kind: upgrade-guide
description: "Internal companion exchanges reuse one durable Session instead of creating a new Session for every exchange."
---

# One persistent companion conversation

English | [中文](guide.zh.md)

## Change

Internal AI partner exchanges share one persistent Session, including messages sent through `genesis_message`. Installations with previous messages adopt their most recent partner Session once; earlier Sessions remain intact. Legacy workspace metadata is retained. A published Session that is missing or unreadable blocks interaction instead of creating a replacement. New conversations use the plugin's absolute `cwd` directory and appear in the AI workspace when the workspace registry is loaded.

## Migration

1. Keep `genesis_companion` storage and its referenced Sessions together when backing up or moving `DSH_HOME`. The additive conversation and delivery tables initialize automatically without replacing the existing partner identity.
2. The built-in overlay sets `genesis-companion.config.cwd` to `dshHomePath('companion-workspace')`. Custom profiles may supply their own absolute directory. Existing Sessions retain their original header and may be opened through the settings' source link.
3. Enable the partner in settings, then discover its exact `companion:` target with `genesis_message(action="targets")`. An internal `emitted` receipt means a completed socket write, not QQ delivery or a peer read acknowledgement. Repeated requests from the same operator input reuse their receipt; never automatically retry uncertain delivery.
4. Start another bounded exchange and verify that the returned `sessionId` stays the same after restart. Restore missing Session data before retrying; do not delete the conversation binding to bypass the error. See the [partner guide](../../../../packages/experimental/genesis-companion/README.md) for sleep and permission rules.
