---
kind: upgrade-guide
description: "Genesis QQ 添加独立的跨会话投递日志和原始文字 Session 记录。"
---

# Genesis QQ 跨会话发消息

[English](guide.md) | 中文

## 变更

QQ 添加仅操作者可用的 `genesis_message`，以及独立的 `outboundGroups`／`outboundUsers`，两者默认均为空。既有输入接收策略不授权主动发送目标。独立的第一版 `genesis_qq_messages` 域在现有生命写入租约下保留内容哈希和投递确认。新增可忽略的 `plugin:genesis-qq/message` 记录在相关 Session 中保存精确原文及投递计划；已有 Session 判别字段及格式代际保持不变。没有这些记录的旧原始消息不能通过此工具原样转发。

重启和重复调用不会重发结果未知的预留。目标 Session 会收到投递历史，但不启动新的模型轮次。此功能不等待答复，也不会自动将答复转回。

## 迁移

1. 保持相同生命、`DSH_HOME` 及原始 Session。按照[配置示例](../../../genesis/qq.zh.md#cross-conversation-messages)，将目标 QQ 账号加入 QQ 插件的 `outboundGroups` 和 `outboundUsers`，再通过 `pnpm dsh web --patch <file>` 重启。
2. 使用绑定的操作者 QQ 账号询问可用发消息目标，向其中一个发送简短测试文字。检查返回的投递 ID 和确认信息；目标不需要先发过消息。
3. 原样转发应选择升级后收到、位于最近 `historyLimit` 条原始消息窗口内的操作者纯文字消息，或先重新发送正文。发言者标头是额外归属信息，正文保持不变。
4. 备份和恢复时，将回执域与来源及目标 Session 一起保留。不要单独删除预留，也不要在移除日志后重放旧发送命令。降级可保留独立域和可忽略记录，但无法检查这些投递；更换运行时前先停止写入进程，发起新请求前检查结果未知的发送。
