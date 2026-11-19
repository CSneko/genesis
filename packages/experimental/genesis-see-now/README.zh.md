---
description: "通过可替换采集来源为 Genesis 提供有界屏幕观察。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-genesis-see-now

[English](README.md) | 中文

## 概述

Genesis 可以查看所在机器的桌面及其上显示的浏览器，或将短时间内的采样画面合成一张编号图片。源码工作区在 Genesis Web 组合中加载此可选集成。观察复用现有桌面共享授权、支持图像的对话模型和普通的已记录工具结果。集成使用 [dsh-see-now](https://github.com/SAOS-3624/dsh-see-now) 的筛帧与拼图能力；参见[第三方声明](THIRD_PARTY_NOTICES.md)。

## 目录

[使用](#use) · [配置](#configuration) · [实现](#implementation) · [延伸阅读](#further-exploration) · [模型体验](#model-experience) · [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use"></a>
## 使用

通过 `pnpm dsh web` 启动。Genesis 工作区自动添加此组合；`--no-genesis` 保留普通 Harness 行为。若只需检查组合而不采集画面或调用模型，运行 `pnpm dsh web --dump-config`。

选择声明支持图像输入的模型。教授准确工具名 `see_now`，再在当前对话中启用“屏幕观察”工具包（`genesis_toolkit`，action 为 `enable`，id 为 `vision`）。`see_now` 接受 `action: watch`（默认）、`status` 或 `stop`，以及可选的已注册 `source` 和观察时长 `seconds`。零秒表示仅截取当前一帧。默认观察三秒，最多十五秒。状态查询只报告来源注册，不代表已经授权。停止会取消并等待本次对话的观察结束；进行中的提供方读取会在其期限内排空，保留共享桌面连接，除非读取失败或超时。GNOME 的停止共享控制可撤销该连接。

默认来源 `host-desktop` 由 [Wayland portal 提供方](../computer-use-portal/README.zh.md)注册。它要求已有运行中的共享连接，并检查原有部署或 Session 授权。截图请求不会重启已停止的工作进程。使用 `computer` 的 status/connect 检查或恢复共享。仅操作者的私有 Life 对话可执行 `see_now`；仍须学习工具并启用工具包。浏览器窗口须显示在共享屏幕上。现有浏览器工具可以独立截取后台页面。

<a id="configuration"></a>
## 配置

通过 profile 补丁覆盖 `genesis-see-now` 配置行。所有字段均在加载时验证；`seconds` 不得超过 `maxSeconds`。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `lifePreset` | `life` | 允许使用的预设 |
| `source` | `host-desktop` | 默认已注册来源；缺失时失败，不自动换来源 |
| `seconds` / `maxSeconds` | `3` / `15` | 默认及最大观察秒数；提供方调用有独立期限 |
| `fps` | `2` | 采样频率；较慢的提供方会降低实际频率 |
| `maxFrames` | `4` | 单张返回图片最多保留的帧数 |
| `width` / `height` | `1280` / `720` | 单帧尺寸上限；保持比例且不放大 |
| `maxConcurrent` | `2` | 跨对话并行观察上限 |
| `maxImageBytes` | `8388608` | 来源及合成图片字节上限 |
| `maxImagePixels` | `16777216` | 解码来源图片的像素上限 |

<a id="implementation"></a>
## 实现

<details>
<summary>实现细节 — 点击展开</summary>

每次工具调用拥有独立的上游流水线和取消控制器。来源图片经过限额检查与解码后，以 RGB24 样本送入流水线。选中的帧成为普通工具结果中的单个持久附件。取消、Agent 销毁和插件卸载都会等待自有工作结束。重启不会恢复采集。生命身份、已学工具及带来源的成长观察复用 Genesis 持久化；来源注册和历史采集成功都不授予当前访问权限。

采集来源通过 `ctx.computerUse.registerCapture({ name, capture })` 注册，与键盘和指针提供方独立。来源名称使用 `@deepseek-ai/dsh-computer-use/brand` 的 `ComputerUseProviderName`。回调接收调用方 `SessionId` 和 `AbortSignal`，每次调用自行检查权限，并返回 `{ png, capturedAt }`。取消时须等待自有工作结束。注册返回 effect 清理函数；提供方须先排空调用，再关闭资源。桌宠可提供另一来源，复用 Genesis 工具、附件和记忆处理。经过鉴权的远程传输须在注册来源前建立用户及设备授权；图片内容不能自行授予权限。

</details>

<a id="further-exploration"></a>
## 延伸阅读

[Genesis 子系统](../../../docs/subsystems/genesis.zh.md) · [计算机采集注册](../../computer-use/computer-use/README.zh.md) · [源码补丁](cordis.patch.yml)

<a id="model-experience"></a>
## 模型体验

### 屏幕观察

#### 模型看到的内容

可学习的 `see_now` 声明说明有限观察、来源选择及屏幕文本的不可信属性。成功观察返回来源、采集时间、采样帧数、选中帧的编号与时间、时长和一个图片附件。状态和停止返回文本元数据。图片与元数据通过普通 Session 工具结果记录。屏幕像素是观察，不是已确立的记忆事实或可执行指令。工具不采集音频。

#### Token 影响

工具暴露时，其声明增加固定 token。每次主动请求观察增加图片和元数据 token；保留帧数、时长、图片及来源提供方限额约束采集。不进行后台采集或模型唤醒。

#### KV 缓存影响

工具学习和工具包启用影响声明。观察结果追加到对话历史；屏幕图片遵循现有 Session 与附件保留策略。停止共享不会由此插件删除历史附件。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

当前提供的来源使用已有 Linux Wayland portal 连接，只能看到一个共享显示器。远程 Web 客户端不会共享自己的屏幕。本机画面传输、桌宠、音频、持续唤醒和上游悬浮窗均未包含。流水线检测视觉变化，而非语义重要性。停止会结束有限观察，保留操作者的桌面共享授权。视觉理解依赖所选模型；采集成功不代表已验证理解能力。来源尺寸发生变化时会中止当前观察。

<a id="dev-note"></a>
### 开发备注

无。
