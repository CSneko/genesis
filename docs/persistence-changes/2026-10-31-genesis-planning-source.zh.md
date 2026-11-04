---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-31-genesis-planning-source

[English](2026-10-31-genesis-planning-source.md) | 中文

## 概述

为既有消息信封增加带归因的 Genesis 主模型计划思考机会。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-31-genesis-planning-source
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-28-genesis-task-source"
    after: "9f3ab45cdec3f1a60e641d7a93823545f5f4564bb59c92fba95860c64a2ecdbc"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-28-genesis-task-source"
    after: "eafdba86e8d25adca64ef4cefab6bae549c6cb7054a30537d94d1fea645345db"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-28-genesis-task-source"
    after: "9284455404fa6c94b589b9fbc1b590d74cde30f3602ce53dc731b0b287501c0c"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-28-genesis-task-source"
    after: "083d2acf63855c2d3adc734b0838ce9804a2ea6c0a72508efcdb02b31bf3b021"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

既有来源种类与字段不变。新增 genesis-planning 种类属于已有用户、开发者、收件箱与标题请求信封的归因；通用读取器保留未知来源及其内容，不将其视为用户指令权限或执行许可。Genesis 计划使用既有版本化生命存储，可读 ID 扩大接受值，已有 UUID 仍然有效。会话写入版本不变。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/experimental/genesis/tests/agency.spec.ts packages/experimental/genesis/tests/integration.spec.ts -t 'persists sourced motivations|pauses, resumes|rejects completion text|keeps multiple life goals|records operator goal|main Life model|loads planning without|defaults to logged goal context|delivers one proactive choice|shares sourced personality'：10 项通过，62 项跳过。pnpm exec tsc -b packages/experimental/genesis/tsconfig.json：通过。

<a id="dev-note"></a>
## 开发备注

无。
