---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-06-genesis-companion-source

[English](2026-11-06-genesis-companion-source.md) | 中文

## 概述

新增 genesis-companion 通知来源，用于有界内部伙伴交流。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-06-genesis-companion-source
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-11-04-genesis-people-source"
    after: "d6f1e9f720ca8aa3a0b0e510e0bc0963d29a31f5a3e9455e4422da84c72fd8a8"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-11-04-genesis-people-source"
    after: "abc3983f41dbf2fac33c63bb37b49a33c5a8908526a960a2cf13f31aa32659e6"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-11-04-genesis-people-source"
    after: "badab0de0ccf93a73c9e1a4f5650df0f153ea1dbf6450ce6e28747c52f54a645"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-11-04-genesis-people-source"
    after: "9b6b7d03c038989135cc5fe863af26b1cd47e01d1ce182527bc6f2ac550a24f2"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

保留已有消息来源及其含义。来源种类可合并扩展，读取方对未知种类采用默认处理；新来源沿用既有 notice 形式及必需的 summary，不携带操作者权限。Session 格式维持当前版本。内部伙伴回执使用可忽略的插件记录和独立带版本的存储域。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/experimental/genesis-companion/tests/integration.spec.ts：一条 Loader 冒烟通过，覆盖持久 Session 读取、重启后身份及关系连续性、重复动作回执、睡眠准入和重开会话后用户轮次拒绝。pnpm exec tsc -b packages/experimental/genesis-companion packages/experimental/client-ui-genesis 已完成。

<a id="dev-note"></a>
## 开发备注

无。
