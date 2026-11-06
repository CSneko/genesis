---
description: "Configure Genesis sleep, temporary wakefulness and waking-cycle memory organization."
---

# Genesis sleep

English | [中文](sleep.zh.md)

## Summary

Workspace Genesis Web enables sleep and [spontaneous cognition](spontaneity.md) by default. Start with `pnpm dsh web`; Settings → Sleep edits the persisted schedule and Genesis → Thoughts manages private thoughts and exploration budgets. The Life conversation banner shows the current mode and wake controls. Ordinary Harness profiles without Genesis retain their behavior.

## Schedule and controls

Schedules use Asia/Shanghai. Defaults sleep Monday–Friday 09:00–12:00 and 14:00–18:00; weekends remain awake, including compensatory work weekends. Each boundary is sampled within five minutes of its configured time, without crossing adjacent windows. The persisted sample survives restart. Settings can change weekly intervals, jitter, temporary timeout, exempt dates and greetings.

Official 2026 vacation dates are exempt, using the [State Council holiday notice](https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm). An uncovered calendar year suspends automatic sleep and displays a warning. Add explicit exempt dates for deployment-specific closures; future official calendars require an update. Disabling holiday exemption explicitly permits the weekly schedule in any year.

While actually asleep, short verified-operator messages such as “快醒醒” can ask the existing decision model to recognize a wake request. Only this asleep admission path performs wake classification. Temporary wakefulness allows operator conversation and requested work, including tool continuations, under ordinary willingness and permission rules. It blocks autonomous work. Mild sleepiness or irritation is optional; the prompt does not force disagreement. Ten minutes without new operator input returns to sleep by default.

The exact operator command `g#保持清醒` and the corresponding Web button bypass wake classification. They keep her awake until the next distinct scheduled sleep period, permit ordinary autonomous opportunities and do not induce irritation. A temporary wake does not extend the sampled end of the sleep period. Operator stop controls remain authoritative.

## Messages and greetings

Sleep blocks Life replies in QQ and autonomous activity. Admitted private QQ messages are durably queued before media processing, then delivered in received order as bounded batches after normal or kept-awake waking. Temporary wakefulness does not drain the backlog. Group messages are not accumulated. Current allowlists are checked again before delivery. Dispatches with uncertain durable acknowledgement remain uncertain and are never automatically replayed. The UI exposes pending and uncertain counts.

At a scheduled sleep or waking boundary, she may send one short greeting or remain silent according to an existing modeled relationship. Temporary wakes and temporary re-sleep do not create greetings. Web uses an existing live operator Life conversation. QQ requires an explicitly authorized outbound private target, the current admission policy and an available connection. A shared recipient receipt prevents repeated greetings across adapters and restarts. Relationship estimates never grant messaging permission; uncertain sends are not retried automatically.

## Memories and recovery

Entering sleep fixes the IDs of sourced memories from the preceding waking interval. The existing memory writer organizes selected memories in bounded batches, returning multiple results to merge related records, split independent topics and retain unrelated information separately. Every input must be cited; omitted sources, invalid citations, increased confidence without new evidence or exceeded output budgets reject the complete batch. Results commit atomically and originals remain; new records are attributed model interpretations with source-event references. The cycle does not recursively compress these results or merge across batches. Progress, remaining IDs and failure status persist; an interrupted or uncertain model call requires explicit retry rather than automatic repetition. Settings shows cycle progress and retry controls. Sleep scheduling continues independently of a failed memory batch.

The separate versioned `genesis_sleep` and `genesis_qq_sleep_inbox` Storage Domains belong to the existing life identity and writer lease. Keep them with life data and source Sessions when backing up. Missing initialized records, identity mismatch, corruption and uncertain writes fail visibly. Disabling sleep retains its history; it does not delete QQ payloads or Session logs. Stop the runtime before administrative backup or recovery.

The conversation banner reads only the lightweight rhythm status, including the configured Life preset. It does not request full life inspection or scan other live conversations when opening a new or historical conversation.

## Verification limits

The focused local smoke covers sampled boundaries, holiday exclusions, temporary wake, kept-awake mode and restart continuity with real storage. Package type checks cover the host, QQ adapter and client. Live decision/writer responses, OneBot delivery and rendered browser interactions require deployment verification.

## Dev Note

None.
