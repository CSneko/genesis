---
kind: upgrade-guide
description: "Genesis 入睡和醒来问候改为依赖 QQ，不再使用已有 Web 会话。"
---

# 睡眠问候通过 QQ 发送

[English](guide.md) | 中文

## 变更

Genesis 不再挑选在线 Web Life 会话发送入睡或醒来问候。问候使用已有的已授权 QQ 私聊通道；没有符合条件的 QQ 目标或连接时不发送。问候开关、关系阈值和持久化防重复机制仍然生效。

## 迁移

1. 如需睡眠问候，在 Genesis QQ 插件的 `outboundUsers` 中配置已授权的私聊收件人，在当前 QQ 接收策略中允许该联系人，并连接 OneBot。
2. 下次计划入睡或醒来时，若关系和意愿允许，问候可能出现在 QQ 中；Web 会话不会插入问候。参见[睡眠问候](../../../genesis/sleep.zh.md)。
