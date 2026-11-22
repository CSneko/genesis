---
description: "Records the Session message source used by Genesis IM."
kind: persistence-change
---

# 2026-11-22-genesis-im-source

[English](2026-11-22-genesis-im-source.md) | 中文

## 概述

为已鉴权的 Telegram 和 Matrix 文本添加通知来源 `genesis-im`。本次记录的来源联合也包含已有的天气通知 `genesis-weather`。

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-22-genesis-im-source
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-11-07-genesis-mail-source"
    after: "7e0307a8388cb0ccca217178b0ef8307e68c8e401c619f7ba4928b8aef21d704"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-11-07-genesis-mail-source"
    after: "3d7ebe7e1d4d2e7826995e951ee8a0391fd02fcca8996ae3588415fa09a6ae9a"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-11-07-genesis-mail-source"
    after: "0c4775523e1f03189b6cf706858869296754ac81def45aef93c13332a99390b9"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-11-07-genesis-mail-source"
    after: "c1ded783307d8a80b936f890b75a244d8e78e6a94e8d85bf95e72a747ec4bc50"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

读取器保留未识别的消息来源种类。现有来源含义保持不变，即时通讯来源仅记录平台归属，不授予操作者权限。Session 写入版本保持不变。

<a id="verification"></a>
## 验证

两个 Loader 冒烟用例覆盖 Telegram 与 Matrix 的会话恢复、发送结果不明后的去重，以及 QQ 的既有恢复路径。历史生成器遇到缺少共享节点表的早期 Genesis 快照即停止。使用源码提取器生成并核验此次后继快照及其与上一条记录的类型差异。

## Dev Note

None.
