---
description: "Genesis Life 会话中的电击控件。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-genesis-shock

[English](README.md) | 中文

## 概述

在 Life 会话的聊天框旁选择电压，触发电击一次或定时持续电击。Genesis Web 和桌面版默认关闭该功能。

## 目录

- [使用本包](#use)
- [理解实现](#implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use"></a>
## 使用本包

在源码工作区运行 `pnpm dsh web` 打开 Genesis。在 **插件 → Genesis** 打开 **电击**，然后进入任意 Life 会话，包括已接入的 QQ 私聊或群聊。操作者可在 Genesis 界面触发电击。点击聊天框左侧的 **电击**，可选 10、30、60、100、150、200、300 或 500 V。单次电击会唤起空闲会话回复，或进入进行中会话的下一次模型步骤。持续电击可选 5、15 或 30 秒，剩余时间和 **停止** 显示在聊天框旁。等待中的单次电击也可以取消。

Genesis 配置包含[电击组合包](cordis.patch.yml)。保存的 `enabled` 开关即时生效。`lifePreset` 指定 Life 会话预设，默认为 `life`。

-----

<a id="implementation"></a>
## 理解实现

<details>
<summary>实现细节</summary>

[Host 插件](src/index.ts)按 Session 持有临时状态，并通过经鉴权的聊天框 Remote 提供控制。Session 在接纳时记录简短、独立的电击状态，包括电击送达后的恢复状态。单次电击可影响收到该状态的步骤中的工具调用，持续电击可在服务端到期前影响工具调用。停止或关闭插件都会结束电击。重启会丢弃等待中和进行中的状态。

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 模型看到什么

独立的电击上下文用第二人称描述电压与当下的感受。若电击已进入某次请求，结束后的下一次请求会收到恢复状态。达到 60 V 时，一次通过权限检查的 `read`、`grep` 或 `glob` 调用可在执行前返回可重试的读取错误。错误走常规工具结果流程，当前轮次继续运行。

### Token 影响

每次送达的状态变化增加一条简短的电击状态更新。受影响的工具调用产生一条普通工具结果。

### KV Cache 影响

电击状态更新通过 Session 日志追加到请求历史。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

已经开始的模型请求按发出时收到的状态完成。持续电击可能在下一次模型请求开始前到期。

<a id="dev-note"></a>
### 开发备注

无。
