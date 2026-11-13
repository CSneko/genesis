---
kind: upgrade-guide
description: "Genesis sleep and waking greetings require QQ instead of an existing Web conversation."
---

# Sleep greetings use QQ

English | [中文](guide.zh.md)

## Change

Genesis no longer selects a live Web Life conversation for sleep or waking greetings. Greetings use the existing authorized QQ private route. Without an eligible QQ target or connection, no greeting is sent. The greeting setting, relationship threshold and durable duplicate prevention still apply.

## Migration

1. If you want sleep greetings, configure an authorized private recipient in the Genesis QQ plugin's `outboundUsers`, allow that contact in the current QQ admission policy and connect OneBot.
2. At the next scheduled sleep or waking boundary, a greeting may appear in QQ if relationship and willingness permit it; no greeting is inserted into a Web conversation. See [sleep greetings](../../../genesis/sleep.md).
