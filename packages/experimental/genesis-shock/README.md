---
description: "Electric shock controls for Genesis Life conversations."
kind: "package-bundle"
---

# @deepseek-ai/dsh-genesis-shock

English | [中文](README.zh.md)

## Summary

Set a voltage and trigger one pulse or a timed continuous shock from the Life composer. The controls are off by default in Genesis Web and Desktop.

## Table of Contents

- [Use this package](#use)
- [Understand the implementation](#implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use"></a>
## Use this package

In the source workspace, open Genesis with `pnpm dsh web`. In **Plugins → Genesis**, enable **Electric shock**, then open any Life conversation, including a connected QQ private or group conversation. Only the operator can trigger the effect from Genesis. Open **Electric shock** on the left side of the composer and select 10, 30, 60, 100, 150, 200, 300 or 500 V. A pulse starts a reply in an idle conversation and joins the next model step in an active conversation. Continuous shock offers 5, 15 or 30 seconds and displays the remaining time beside **Stop**. A queued pulse can also be stopped.

Genesis profiles include the [electric shock bundle](cordis.patch.yml). The stored `enabled` switch takes effect live. The `lifePreset` field selects the Life preset and defaults to `life`.

-----

<a id="implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

The [Host plugin](src/index.ts) owns transient state per Session and publishes it through the authenticated composer Remote. The Session logs short, named shock updates on admission, including recovery after a delivered shock. A pulse can affect tools during its admitted step, and continuous shock can affect tools before its server-side deadline. Stopping or disabling ends active effects. Restarting discards queued and active state.

</details>

-----

<a id="model-experience"></a>
## Model Experience

### What the model sees

A dedicated shock update describes the voltage and immediate sensations in the second person. Recovery appears in the next request after the effect ends, provided a previous request admitted the shock. At 60 V or above, one admitted `read`, `grep` or `glob` call can return a retryable read error before execution. The error follows the ordinary tool result pipeline and the turn continues.

### Token impact

Each delivered state transition contributes one short shock update. The selected tool failure contributes one ordinary tool result.

### KV cache impact

Shock updates append to request history through the Session log.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

A model request already in progress finishes with the state it received. Continuous shock can expire before a model request starts.

<a id="dev-note"></a>
### Dev Note

None.
