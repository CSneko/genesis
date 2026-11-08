---
description: "通过 Playwright MCP 操作 Chromium，支持隔离、附加或共享持久浏览器状态。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-browser-use-playwright-mcp

[English](README.md) | 中文

## 概述

通过 Playwright MCP 的上游工具检查网页并操作 Chromium。可以启动独立浏览器、让一个 Session 接入已有浏览器，或让多个 Session 共享托管或外部 Chrome。源码 Genesis Web 默认包含此实验组合包；普通 Harness profile 保留原有组合。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

组合包添加浏览器提供方和 `./connection` 适配器，默认连接独立管理的 Chrome，地址为 `http://127.0.0.1:9222`。可通过 `dsh plugin --profile <name> add @deepseek-ai/dsh-experimental-browser-use-playwright-mcp` 加入其他 profile，通过对应的 `remove` 命令移除。组合包默认配置位于可编辑的 profile 配置之下。Genesis 在“设置 → 浏览器”中提供地址编辑。`endpoint` 接受 HTTP(S) 或 WS(S) 地址，重启后保留，由提供方读取并保持到重启；保存不改变当前连接，也不探测连通性。所有 Session 共享一个 MCP 连接与浏览器状态，工具单次调用串行执行。提供方卸载只断开连接，不关闭外部 Chrome。Chrome 不可用时浏览器操作失败，不会启动其他浏览器。此适配器不提供持久模式预览。参见[服务器配置](../../../docs/genesis/README.zh.md#浏览器操作)。

根插件仍支持下面显式的 launch、attach 和 persistent 配置。在创建或恢复 Session 前，将以下条目挂载到已提供 Agent、工具、系统提示词和工作目录服务的 profile 组合中。launch 和 attach 模式不会接管已经活动的 Session；persistent 模式在提供方启动后发布共享工具。浏览器安装遵循上游运行时；使用 `executablePath` 选择已有 Chromium 安装。

```yaml
- name: '@deepseek-ai/dsh-browser-use'
- name: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp'
  config:
    mode: launch
    headless: true
```

使用 `mode: attach`，并在 `endpoint` 中设置 HTTP(S) 调试 URL 或 WS(S) 浏览器端点，即可操作已有浏览器。新的活动 Session 在初始化时占用附加连接，并持续保留直到卸载。如果连接已被占用，本次激活不使用该浏览器，但继续运行，后续轮次不会重试。连接释放后，新创建或恢复的激活可以获取它。其他 Session 的直接调用会失败。清理只断开连接，保留外部浏览器及其页面。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `mode` | 必填 | `launch`、`attach` 或 `persistent`，在本次提供方激活期间固定 |
| `userDataDir` | persistent 时必填 | 浏览器配置目录，须为非根目录的绝对路径 |
| `headless` | `true` | 启动时不显示窗口 |
| `executablePath` | 上游发现 | 启动使用的 Chromium 可执行文件 |
| `endpoint` | attach 时必填 | 已有浏览器调试端点 |
| `toolCallTimeoutMs` | MCP 客户端默认值 | 单次调用超时，单位为毫秒 |
| `preview` | 关闭 | 持久模式的 Web 预览 |
| `preview.intervalMs` | `500` | 远程采样周期，单位毫秒（2 FPS），最小 1 |
| `preview.localIntervalMs` | `1000 / 30` | 本地/局域网采样周期，单位毫秒（30 FPS），最小 1 |
| `preview.timeoutMs` | `5000` | CDP 连接和截图超时，单位毫秒 |
| `preview.jpegQuality` | `60` | JPEG 质量，范围 1 至 100 |
| `preview.maxImageBytes` | `1048576` | 每张 JPEG 图片的原始字节数上限 |
| `preview.actionLimit` | `30` | 保留的操作记录数，范围 1 至 200 |
| `preview.tabLimit` | `50` | 标签页列表数量上限，范围 1 至 500 |
| `preview.tabTextChars` | `2048` | 页面标题和网址各自的字符数上限 |
| `preview.inputTextChars` | `4096` | 每次操作者文字输入或导航地址的字符数上限 |

使用 `mode: persistent` 并设置 `userDataDir`，即可让此部署的所有 Session 共享同一浏览器及登录状态。提供方逐次串行执行工具调用，在停止 MCP 前关闭浏览器，并在正常重启后保留带有效期的 Cookie 与网站本地存储。由多次调用组成的不同工作流仍可能交错。该路径须为真实目录，不能是符号链接；新建目录使用私有权限。若另一进程正在使用此配置目录，Chromium 会拒绝打开，工具会报告失败，不会改用其他目录。该目录包含敏感网站数据，仅在停止 DSH 后备份或删除。不保证恢复打开的标签页、会话存储或未设有效期的 Cookie。

Web 中可在 `mode: persistent` 旁设置 `preview: {}`，配合单独加载的[预览插件](../client-ui-browser-preview/README.zh.md)，在右侧栏入口页启用 **AI 浏览器**。打开后可查看当前页面标题、网址、页面截图，以及最近操作名称和执行中、成功、失败状态。Genesis 工作区默认启用此功能。只有面板持有预览时才采样，通过回环或私有服务器 IP 访问时目标为 30 FPS，其他地址为 2 FPS，不调用模型，也不执行 MCP 工具。截图耗时计入采样周期；截图较慢时实际帧率降低。除 localhost 外的域名使用远程帧率，即使其解析为私有地址。只有已认证的所有者可以查看共享浏览器。图片和操作元数据仅保存在进程内存中；操作列表不复制工具参数和结果正文。所有者可以查看标签页列表，选择预览页而不改变 AI 当前页，并点击、滚动、输入文字、导航、刷新或关闭页面。页面修改与 AI 工具共用执行队列，并拒绝过期的页面标识。重启后不恢复截图和操作记录。截图失败时保留上一张图片，并明确提示画面已过期。此模式会在回环地址开启 Chromium 调试端口；其他本地进程也能访问该端口。

[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-experimental-browser-use-playwright-mcp)列出接受的字段。浏览器模式由 profile 或 preset 选择。子进程会清空继承的 `PLAYWRIGHT_MCP_*` 选项，避免其替换该配置。

为整个进程配置系统提示词的 `toolOrder` 时，将浏览器工具留在 `<unlisted-tools>` 中。显式列出浏览器工具名称可能导致未获得浏览器连接的 Session 无法组装提示词。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

视频检查指引通过提示词章节提供；工具声明由选定的执行器负责。

提供方解析固定版本 npm 包的可执行入口，并使用当前 Node 启动。服务进程之前可能运行临时协议探测进程。[共享运行时](../browser-use-runtime/README.zh.md)负责等待 Agent 初始化、逐 Session 串行执行与清理；[MCP 客户端](../../mcp/mcp-client/README.zh.md)负责传输、发现和结果投影。

只要活动 Session 保持连接，浏览器状态就会跨轮次保留。MCP 服务器在经验证的 Session 当前工作目录中启动；Session 后续改变目录时，服务器保留启动目录。销毁会等待服务器关闭，再释放资源。launch 模式在重新加载后创建新的浏览器状态。persistent 模式从 `userDataDir` 恢复网站数据，Session 日志不包含浏览器配置目录的备份。此模式的 MCP 工作目录为 DSH 启动目录，launch 和 attach 模式则使用 Session 目录。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [浏览器使用](../../../docs/subsystems/browser-use.zh.md) — 提供方选择与 Session 所有权。
- [浏览器使用服务](../../browser-use/browser-use/README.zh.md) — 提供方独占注册。
- [Playwright MCP](https://github.com/microsoft/playwright-mcp) — 上游安装与浏览器行为。

-----

<a id="model-experience"></a>
## 模型体验

### 浏览器工具与截图

#### 模型可见内容

工具以 `mcp__playwright-mcp__<tool>` 命名，使用上游 JSON schema，并启用坐标鼠标工具。截图和脚本求值工具的描述说明图片观察与 HTML 视频播放方法。不传 `filename` 截图才能返回图片；指定文件名时只保存文件。可通过 `browser_evaluate` 播放、暂停或跳转 HTML 视频，在播放或跳转完成后截图观察。这提供无声画面采样，不代表连续视频理解。文本与截图通过常规工具结果流程进入 Session 日志。截图需要附件存储及支持图片输入的模型路由；其他路由会收到 MCP 图片诊断。MCP 客户端还提供资源工具和注明服务器来源的指导。launch 和 attach 模式只向拥有连接的 Session 开放指导及定向资源。persistent 模式在 Session 间共享工具、指导、页面与网站身份；每个调用方仍记录自己的工具结果。

#### Token 影响

工具目录、资源工具和服务器指导会增加工具定义与提示词文本。调用会向 Session 历史加入参数、文本和获准输入的图片。内联图片字节不进入模型可见历史。

#### KV Cache 影响

不变的工具目录会保留工具定义前缀。结果追加到历史；更换提供方或目录可能降低前缀复用率。

## 已知限制与待办事项

<a id="known-limitations-and-deferred-work"></a>

本集成保留固定版本服务器的浏览器与工具限制。

- 仅支持 Chromium；不可选择 Firefox 或 WebKit。
- MCP 启动失败在 persistent 模式与 `./connection` 适配器中拒绝提供方激活，在根插件 launch/attach 模式中拒绝 Session 创建或恢复。连接不会自动重连。修复原因后重新加载提供方；launch/attach 模式还须新建或恢复 Session。
- 根插件 attach 模式的连接独占仅在此提供方实例内有效。其他进程与浏览器用户仍可修改相同页面。
- launch 和 attach 模式的共享资源服务器目录可以显示继承的服务器名称，但不会授予对其他 Session 浏览器的访问权限。
- 取消不会撤销已发送给浏览器的导航、点击或其他操作。
- 工具 schema 跟随固定的实验依赖版本，不承诺 DSH 稳定性。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
