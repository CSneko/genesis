---
kind: upgrade-guide
description: "Genesis automatic memory review defaults to batches and a larger context window instead of reviewing every reply."
---

# Genesis automatic memory review batches

English | [中文](guide.zh.md)

## Change

Deployments enabling Genesis `memory` now review four complete exchanges together (`memory.batchTurns: 4`), or a partial batch after three idle minutes (`memory.batchIdleMs: 180000`). The default context window increases from four to eight turns. The independent decision prompt considers concrete daily experiences separately from durable habits; the writer prompt and saved decision threshold remain unchanged.

A private, ignorable Session receipt tracks settled batches. First activation starts after existing complete replies without backfilling them. Subsequent Session reopen restores pending exchanges. Failed reviews retain evidence; successful life commits remain idempotent if the process exits before recording the receipt. Older runtimes skip this receipt and retain their own review cadence.

## Migration

1. Restart the existing supported `dsh` profile with the Genesis overlay. Existing saved model routes and thresholds require no changes.
2. To retain the previous cadence and context defaults, set `memory.batchTurns: 1` and `memory.windowTurns: 4` in the Genesis plugin configuration. Manual per-reply generation remains immediate in either mode.
3. With batch mode enabled, complete four exchanges or leave a partial batch idle for three minutes. Check the latest memory review in Memories or Knowledge Base; a valid no-update decision is also a completed review. See [memory behavior and recovery](../../../genesis/memory.md) for limits and failures.
