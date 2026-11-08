---
description: "记录邮件通知来源的持久化兼容性与验证限制。"
kind: persistence-change
---

# 2026-11-07-genesis-mail-source

[English](2026-11-07-genesis-mail-source.md) | 中文

## 概述

新增 `genesis-mail` 通知来源，标识邮件处理会话中带来源的待阅通知。操作者认证与权限保存在独立邮箱状态中，不由邮件正文或来源标签授予。

## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-07-genesis-mail-source
baseline: false
changes:
  - root: event:agent/inbox/spliced
    previous: 2026-11-06-genesis-companion-source
    after: e8e98bd3d98cd5b1cc8f914c99dfc37d0dd58dfc54d9629e768753d887582db4
    decision: same-version
  - root: event:developer/message
    previous: 2026-11-06-genesis-companion-source
    after: 4ce571140422803a4e0a0b2de45cf9efd2daf69e6409b357ff85b7da692bfb91
    decision: same-version
  - root: event:session/title-llm-request
    previous: 2026-11-06-genesis-companion-source
    after: 1b0f831b4e7f1b63ddfa63421cef0f68bcfd2ac743a7b25c9199bb479b46326c
    decision: same-version
  - root: event:user/message
    previous: 2026-11-06-genesis-companion-source
    after: 6cab952fca6003f488530e2687c549388220d8d14e55679cf599377e270389a4
    decision: same-version
```

## 兼容性

已有来源保持原字段和含义。新增来源具有独立 kind、现有 notice 形式和必填 summary；消息来源是可合并扩展联合，读者保留未知来源并走默认分支。旧记录由新读者按原方式读取；旧读者可以保留新的来源数据，但不会因此实现邮件处理或获得操作者权限。Session 格式版本保持不变；独立 `genesis_mail` 存储域使用第一版校验，并通过生命初始化标记拒绝丢失后的静默重建。

## 验证

Loader 冒烟覆盖真实存储中的通知、睡眠积压、去重、重启连续性、操作者与外部工具权限、发送不确定结果及损坏状态拒绝；外部邮箱和模型被替换。自动登记与历史验证被既有的多份不含 nodes 的历史 schema 文件阻塞；本记录由当前源码提取器生成完整后继 schema，不改写这些历史文件，也不声称历史验证已通过。

## 开发说明

无。
