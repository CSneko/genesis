---
kind: upgrade-guide
description: "Genesis source-workspace Web uses an external Chrome connection instead of its shared managed browser."
---

# Genesis browser connection

English | [中文](guide.zh.md)

## Change

Genesis source-workspace Web enables the browser bundle below editable profile settings and connects to independent server-side Chrome at `http://127.0.0.1:9222`. The default browser is no longer launched by DSH. All Sessions share a serialized connection and browser state, and the built-in browser preview is absent. The former `config/genesis-browser.patch.yml` workspace overlay and default use of `GENESIS_BROWSER_EXECUTABLE` are removed. Explicit configurations of the package's root plugin retain launch, attach and persistent modes.

## Migration

1. Remove explicit references to the deleted workspace overlay. Follow [server setup](../../../genesis/README.md#browser-control) to start dedicated Chrome before creating or resuming a browser-using Session. Its profile is separate; the previous `$DSH_HOME/browser/playwright` data is retained without automatic import.
2. Restart with `pnpm dsh web`. The workspace adds the browser bundle to the Genesis Web profile without replacing user settings.
3. Check Settings → Browser. Save the server-side debugging address there; restart Genesis to reconnect the shared provider at the new address. Saving alone does not confirm connectivity. Stopping DSH leaves independent Chrome running.
