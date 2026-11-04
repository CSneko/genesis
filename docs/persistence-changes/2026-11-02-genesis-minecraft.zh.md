---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-02-genesis-minecraft

[English](2026-11-02-genesis-minecraft.md) | 中文

## 概述

增加独立的 Minecraft 设置与一次性工具包安装记录、带来源的游戏观察、辅助 Jev 审计记录及连接内短时任务的状态记录。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-02-genesis-minecraft
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-31-genesis-context-modules"
    after: "47a6c8ae8646f4d93f844863e1923a26c84d623333fb92b952dbedfda0695f2a"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-31-genesis-context-modules"
    after: "4a0bb89889aad437fa837c64a63b1834c69883624ae871d60a69ce89d52a5810"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-31-genesis-context-modules"
    after: "725d58ebb75cb9be7ec2ed88c5c8c4848f93854cbb4aff0e3c722fb80c6f5d66"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-31-genesis-context-modules"
    after: "0069ac69f185138ed06a32fbaf691d89ed2060879e06ea574d64d77f9090e969"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有 Genesis 生命与 Session 数据保持不变。新设置使用独立的版本 1 存储域，无效记录阻止加载。新消息来源具有独立判别字段，不具备用户权限。旧读取方将未知来源保留为带归属数据，并忽略插件审计记录；重放不连接游戏或执行动作。新读取方接受不包含这些记录的旧 Session。 Jev 失败审计记录可包含可选的不含秘密的原因；仍可读取不带此字段的旧记录。

<a id="verification"></a>
## 验证

已通过有针对性的 Loader 和设置组件检查，包括纯游戏会话、推理期间聊天、等待技能、匹配挖掘及受限短时任务执行。回归检查重现监测失败后派发任务，验证使用顶层图片引用立即调度，并检查失败终态的报告。真实离线 Java 版服务器检查验证第一人称采集与私聊。向已配置的 Span-02 路由发送最小真实请求，嵌套图片引用返回 HTTP 400，顶层引用返回 HTTP 200；这不验证游戏判断质量。

<a id="dev-note"></a>
## 开发备注

无。
