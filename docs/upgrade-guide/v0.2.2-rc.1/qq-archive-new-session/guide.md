---
kind: upgrade-guide
description: "QQ archival starts a new Session on the next incoming message instead of pausing the route."
---

# QQ archival starts a new conversation

English | [中文](guide.zh.md)

## Change

Archiving a QQ Session previously paused incoming replies until the operator restored it. The next admitted message now creates a new Session for the same user or group. Historical bindings remain in the life data, and the latest binding receives new messages, including after restart. Unarchiving an earlier Session does not select it again. Proactive sending does not rotate archived targets.

Life data can contain several historical Session bindings for one QQ route. Older readers that require one binding per route reject these records. Keep a verified backup before upgrading or downgrading.

## Migration

1. To stop receiving messages, disable the QQ connection or remove the target in QQ settings instead of archiving its Session.
2. Archive a group or private Session, then send one allowed message. Confirm that a new Session receives it and the previous Session remains archived.
3. Before downgrading, restore a compatible life-data backup together with its Session and workspace data; do not edit bindings by hand.
