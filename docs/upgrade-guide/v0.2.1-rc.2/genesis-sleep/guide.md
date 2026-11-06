---
kind: upgrade-guide
description: "Workspace Genesis Web now enables scheduled sleep and private spontaneous cognition by default."
---

# Genesis sleep and spontaneous cognition defaults

## Change

Workspace Genesis Web previously remained awake and required a patch for spontaneous cognition. Its Life composition now enables both. Scheduled sleep pauses autonomous work and QQ replies; private QQ inputs wait in a separate durable inbox. Ordinary profiles without Genesis are unaffected. New sleep and thought settings are stored separately from Session data.

## Migration

1. Launch `pnpm dsh web` with the existing `DSH_HOME`. Review Settings → Sleep and Genesis → Thoughts. The default China/Shanghai weekday sleep windows are documented in [sleep](../../../genesis/sleep.md).
2. To retain continuous wakefulness, disable sleep in Settings. To prevent private exploration, disable it in Thoughts. Explicit compositions can omit `genesis.config.sleep` and `genesis.config.spontaneity`; the workspace Life overlay supplies them by default.
3. Keep the complete home backup, including the new Storage Domains and source Sessions. Do not run older runtimes against stores containing new exploration decisions or settings. Confirm the banner and settings show the intended saved state after restart.
