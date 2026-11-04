---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-04-genesis-people-source

[English](2026-11-04-genesis-people-source.md) | 中文

## 概述

添加 genesis-person 消息来源，用于鉴权的 QQ 人物与按来源限制的 Genesis 对话。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-04-genesis-people-source
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-11-02-genesis-minecraft"
    after: "f89b687af4c81798be17b5ec5a9a997a3fa4b58d89ed169e183e986cd79593a9"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-11-02-genesis-minecraft"
    after: "beb0fa92bb10b6a3e378e24d5c0727dd335f56cc48f07fa01078bbb3d1ce13c7"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-11-02-genesis-minecraft"
    after: "9e3a6eaa0e30f3a7897e206b9f57c6d9bd3d2286a85162928c335c9b28314593"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-11-02-genesis-minecraft"
    after: "5cfddc3d139ede23e62371656068aebd8b3ebe1d12f11b5ed4e6a6d472fdf866"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新来源使用独立的 kind 判别字段。通用来源读取器保留带归属的消息内容，不授予用户或操作者权限；插件专属评估要求对应的已注册来源。既有来源和 Session 信封保持不变，因此保留 Session 格式代际。Genesis 另行兼容缺少 people 状态的旧记录并保持生命身份；旧版严格生命读取器会拒绝新的可选版本 1 投影，降级需要完整的升级前备份。

<a id="verification"></a>
## 验证

使用脚本模型的 20 项聚焦 Loader、人物、情绪和真实 WebSocket 传输测试通过，覆盖按范围召回、鉴权来源回放、部分及不确定回执、拒绝损坏消息帧，以及生命和对话重启连续性。受影响包的 TypeScript 构建通过。通过 get_login_info 验证了真实 SnowLuma 登录；操作者的真实私聊和群内提及消息产生独立的持久化 Session，以及两条带消息 ID 的已确认 OneBot 回执。原生命 ID 和出生时间与重启前备份一致。这些检查不代表验证了模型质量或更广泛的 QQ 功能。

<a id="dev-note"></a>
## 开发备注

无。
