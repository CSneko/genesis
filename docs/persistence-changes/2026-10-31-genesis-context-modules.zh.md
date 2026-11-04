---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-31-genesis-context-modules

[English](2026-10-31-genesis-context-modules.md) | 中文

## 概述

为既有消息信封添加带来源标记的 Genesis 模块快照。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-31-genesis-context-modules
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-31-genesis-planning-source"
    after: "f6aa3ded7c8b30d3e3c119d8542405d2a57ddea08282e0db7c718b3a5e2439ab"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-31-genesis-planning-source"
    after: "41672530e06e69dba1484482f44f67805b93761caee7017f891a843d986030e7"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-31-genesis-planning-source"
    after: "234314bfd49ab962c66a524079f51a9231d44eddb28f46f97dac8d22e6caa0dc"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-31-genesis-planning-source"
    after: "51a0b6b7679b03776c735db5ad21036ccc0442e8100645fec6d12ed36ed563d4"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

既有来源种类和字段保持不变。新增 genesis-state 种类使用既有 snapshot 形式与命名节，各节仅替换自身模块，空文本明确清空对应模块。新代码读取旧日志时发送一次当前模块，不重写历史组合运行快照。旧版通用读取器保留未知来源种类与普通消息正文，不将此归属解释为操作者权限或执行许可。Session 写入版本不变。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/experimental/genesis/tests/emotion.spec.ts packages/experimental/genesis/tests/context-update.spec.ts packages/experimental/genesis/tests/integration.spec.ts -t 'degree|module|injects plain memory lines|records real tool addition|restores a life across': 9 passed, 75 skipped. pnpm exec vitest run packages/experimental/genesis/tests/context-update.spec.ts -t 'upgrading a conversation': 1 passed, 1 skipped. pnpm exec tsc -b packages/experimental/genesis/tsconfig.json: passed.

<a id="dev-note"></a>
## 开发备注

无。
