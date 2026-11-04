---
description: "通过无障碍控件操作获准的 Wayland 应用，并保留 portal 截图与输入作为补充。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-computer-use-portal

[English](README.md) | 中文

## 概要

`computer` 工具通过 AT-SPI 读取应用控件，直接调用控件动作或替换可编辑文本。操作者须批准桌面共享；应用访问根据配置采用逐应用确认或明确的部署预授权。对于无障碍支持不足的界面，仍可使用截图、指针输入、滚动、Unicode 文字输入和快捷键。无需 GNOME Shell 扩展或 X11 输入模拟。

## 目录

- [使用此包](#use-this-package)
- [实现原理](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

宿主需要本地 Wayland 登录会话、XDG RemoteDesktop 和 ScreenCast portal、PipeWire，以及具备 PyGObject、GStreamer、GstVideo 和 GdkPixbuf 的 Python。GStreamer 必须提供 `pipewiresrc`、`videoconvert` 和 `appsink`。语义访问还需要 Atspi 2 GI 模块；设置 `accessibilityEnabled: false` 可只使用 portal 截图与输入。加载时检查这些依赖；autoConnect 还会在激活完成前连接桌面共享；缺少依赖会明确拒绝激活。

### 配置

工作区 Genesis Web 启动器在 GNOME Wayland 下包含[桌面覆盖层](../../../config/genesis-computer.patch.yml)。使用 `pnpm dsh` 启动；Life 模式须学习准确工具名 `computer`。`GENESIS_COMPUTER_USE=0` 禁用覆盖层中的条目。`GENESIS_COMPUTER_USE=1` 可在其他 Wayland 桌面显式启用，但尚未验证这些桌面。本工作区覆盖层通过 `requireApplicationConsent: false` 预先批准应用访问；设置为 `true` 可恢复逐应用询问。覆盖层启用 `autoConnect: true`，并将私密恢复令牌保存在 `dshHomePath('computer/portal-token.json')`。启动时建立部署级连接，跨聊天复用。首次仍须完成 GNOME 授权，后续启动请求恢复。设置 `autoConnect: false` 可恢复按聊天手动连接。系统撤销共享始终有效。普通 Harness 启动保留原有默认配置。

显式组合可在本地 subprocess、工具、提示词、附件、agent 和人工问答服务旁加入以下条目：

```yaml
- name: '@deepseek-ai/dsh-computer-use'
- name: '@deepseek-ai/dsh-experimental-computer-use-portal'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `autoConnect` | `false` | 启动时连接并跨聊天共享桌面访问，直到断开或关闭进程 |
| `restoreTokenPath` | autoConnect 必填 | 私密 0700 目录中的绝对令牌文件路径；文件权限为 0600 |
| `python` | `/usr/bin/python3` | 具备所需 GI 模块的解释器 |
| `startupTimeoutMs` | `10000` | worker 就绪期限 |
| `consentTimeoutMs` | `120000` | 系统或应用授权期限 |
| `callTimeoutMs` | `15000` | 截图、D-Bus 和普通调用期限 |
| `maxImageDimension` | `1600` | 截图最长边像素上限 |
| `maxResponseBytes` | `16777216` | 完整 worker 响应字节上限 |
| `maxTextChars` | `4000` | 每次文字输入或替换调用的字符上限 |
| `accessibilityEnabled` | `true` | 启用应用检查与语义操作 |
| `requireApplicationConsent` | `true` | 访问应用前询问；`false` 在桌面共享后预先批准应用访问 |
| `accessibilityMaxNodes` | `200` | 每次观察最多列出的应用或访问的控件数 |
| `accessibilityMaxDepth` | `12` | 控件树最大深度 |
| `accessibilityTextChars` | `512` | 每段名称或文本摘录的字符上限 |
| `accessibilityResultBytes` | `32768` | 序列化语义结果的字节预算 |
| `accessibilityTimeoutMs` | `5000` | 遍历与单个 AT-SPI 请求期限；须小于 `callTimeoutMs` 的一半 |
| `processGraceMs` | `1000` | 受管 worker 终止宽限时间 |

### 观察、操作与验证

调用 `computer` 的 `action: status` 可在不请求授权的情况下检查访问。`connect` 通过 GNOME 请求共享一个显示器、键盘和指针。`autoConnect: false` 时，授权归调用聊天所有，直到 `disconnect`、系统撤销、Agent 释放、工作进程中断或 DSH 退出。手动连接不保存或恢复权限。autoConnect 模式下，Agent 释放保留部署级授权。该模式要求 RemoteDesktop portal 版本 2 并返回恢复令牌；不支持持久授权、拒绝授权、令牌文件不可读或损坏、令牌写入失败均会拒绝启动。令牌每次恢复后轮换。系统撤销或已保存显示器不可用时，可能再次显示系统对话框。`disconnect` 关闭当前连接；GNOME 权限设置可撤销记住的授权。须先停止 DSH，再删除令牌文件以重置保存的授权。

优先使用 `apps` → `inspect(appId)` → `activate` / `set_text` / `focus` → `inspect`。`apps` 返回应用名称和不透明 ID，不读取控件。`requireApplicationConsent: true` 时，首次 `inspect` 通过人工问答服务请求批准本次连接中的该应用实例；没有应答服务或未获批准时，拒绝检查。设置为 `false` 时，部署配置已预先批准应用访问，不需要应答服务或逐应用确认。此权限覆盖该应用所有可访问窗口，包括后台窗口和共享显示器以外的窗口。批准范围不限于选中的显示器。拒绝状态保留至断开连接；进程替换后须使用新的应用 ID；交互模式下还须重新授权。

`inspect` 返回有界的控件角色、名称、文本摘录、状态和可用动作名。可选的 `query` 对已访问节点的名称、角色和文本做不区分大小写的筛选；`truncated` 表示结果不完整。将 `snapshotId` 和 `elementId` 复制到语义操作中。`activate` 还要求准确的 `operation`，例如 `click`；`set_text` 替换整个可编辑字段，空字符串可清空字段；`focus` 请求控件焦点。无需截图或坐标。每次操作都会消耗该快照，列出应用、重新检查、坐标输入或键盘输入也会使快照失效。下次操作前重新检查，并验证效果。文本替换报告读回是否匹配；其他动作只报告发送情况，不声称应用已完成工作。

标记为 AT-SPI 密码角色的控件不提供内容或动作。其他应用文本属于不可信数据，不能授予指令权威或授权。工具包须提供有用的无障碍信息；观察并非原子的，应用变化可能在动作发送前使控件失效。

`screenshot` 返回 PNG 和 `frameId`、图像宽高及显示器逻辑尺寸。图像需要支持图像输入的模型路由和 Harness 附件存储。坐标输入要求最近截图的 `frameId`，可在多个指针、键盘和语义操作之间复用，直到新截图替换它或连接结束。坐标操作使用从左上角 0 到右下角小于 1000 的归一化值，不受图像缩放影响。键盘 `type` 和 `key` 无需截图，可省略 `frameId`，也可提供最近一次的值。保留的截图不保证界面没有变化，需要定位目标或验证不确定的效果时再截图。输入文字前先点击目标应用以获取焦点；按键作用于当前焦点。快捷键使用 `["Control", "a"]` 或 `["Enter"]` 等名称；滚动在明确的图像位置使用有界整数 `dx`/`dy` 步数。

GNOME 的停止共享控制独立于 agent 撤销访问。拒绝请求不会发送输入。取消、传输失败或调用达到硬截止时间会关闭 worker 及其授权；已发送的输入可能已经生效。重试前须重新连接并观察。任何操作都不会自动重放。

### 验证

非交互组合检查加载真实 portal worker，记录权限状态和未授权截图的拒绝结果，然后卸载。交互检查需要操作者在 30 秒内批准 GNOME 的显示器和输入对话框；它将两次截图记录到 Session 历史，检查两次截图之间授权仍有效，随后断开，不发送输入。两种检查均不调用模型 API。无障碍冒烟检查打开自有 GTK 测试窗口，通过应用独立回执验证直接填写中文和按钮激活，检查密码内容省略和旧令牌拒绝，然后终止测试窗口；不会操作现有应用。

```sh
DSH_COMPUTER_USE_PORTAL_E2E=1 pnpm exec vitest run --config vitest.e2e.config.ts packages/experimental/computer-use-portal/tests/composition.e2e.ts
DSH_COMPUTER_USE_PORTAL_CONSENT_E2E=1 pnpm exec vitest run --config vitest.e2e.config.ts packages/experimental/computer-use-portal/tests/composition.e2e.ts
DSH_COMPUTER_USE_ACCESSIBILITY_E2E=1 /usr/bin/python3 packages/experimental/computer-use-portal/tests/accessibility_smoke.py
```

-----

<a id="understand-the-implementation"></a>
## 实现原理

<details>
<summary>Portal 会话与 worker 归属</summary>

provider 预留 `ctx.computerUse`，并通过 MCP 内容适配器发布一个普通工具。工具参数是纯 JSON，不包含 Zod 运行时元数据，因此 Session 创建和 schema 投影可以保留相同声明。受管本地 Python worker 持有 D-Bus 连接，以及包含一个显示器 ScreenCast 来源的 RemoteDesktop 会话。它从该会话的 PipeWire 连接取得截图，通过 portal 的 Notify 方法发送输入。不安装 Shell 扩展、剪贴板访问或全局输入设备。配置的启动连接请求持久 RemoteDesktop 授权；恢复令牌不进入 Session 日志或模型上下文。

worker 使用阻塞标准流发送完整 JSON 行，包括截图大小的响应。父进程串行执行调用，并限制启动、授权、输入和响应大小。调用者身份由运行中的 Agent 提供，不属于模型参数。卸载时先移除工具、终止并等待 worker 退出，再释放 provider 注册。worker 在发送前拒绝缺少授权、手动模式下的其他对话、已被替换的截图引用和越界坐标。AT-SPI 适配器仅保留最近观察中的有界控件引用。应用权限绑定无障碍应用及其进程启动身份；worker 同时检查配置的部署或对话所有权，以及通过交互批准或配置预授权建立的应用访问权限。批准操作属于宿主私有消息，不包含在模型工具参数中。工具文本和获准图像进入普通 Session 日志历史。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Computer use](../../../docs/subsystems/computer-use.zh.md)
- [XDG RemoteDesktop](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html)
- [XDG ScreenCast](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ScreenCast.html)

-----

<a id="model-experience"></a>
## 模型体验

### Computer 工具与观察结果

#### 模型看到的内容

一个 `computer` 工具说明优先采用语义的应用观察与控制、授权、基于截图的输入和验证。不添加额外系统提示词段落。状态区分尚未授权与已授权连接，并报告无障碍功能是否启用。控件观察和文本读回使用已记录的文本结果；其他输入只报告发送情况，不声称效果经过验证。截图通过持久附件进入 Session 历史，不作为 base64 文本。参数校验和 portal 拒绝以工具错误呈现。

#### Token 影响

工具 schema 增加固定请求 token。文本结果和获准截图增加每次调用的上下文；`maxImageDimension` 限制图像尺寸，每次文字输入或替换受 `maxTextChars` 限制。语义观察受节点数、深度、摘录长度、时间和序列化字节数限制；query 筛选可减少返回文本，但不会搜索这些限制以外的节点。

#### KV Cache 影响

工具 schema 不变时保留其前缀。观察结果追加到 Session 历史；启用或禁用 provider 会改变可用工具前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **共享前台桌面** — 授权覆盖一个显示器和全局输入，不限定特定应用。其他应用、用户或 DSH 进程可能在观察与操作之间改变焦点。请将敏感应用移出共享显示器。
- **无障碍覆盖范围** — 自绘画布和不支持 AT-SPI 的应用可能需要截图或专用应用 API。密码角色排除依赖工具包正确标记；其他敏感字段不会自动分类。
- **单显示器** — 不支持多显示器选择、窗口专属截图、拖拽手势和剪贴板操作。
- **显示变化** — 显示器尺寸、缩放或布局变化后，发送输入前须断开并重新连接。
- **输入中断** — 取消和失败可能留下未知的外部效果；断开连接不会回滚。
- **运行时依赖** — Python/GI 与 PipeWire/GStreamer 是系统依赖，本包不会安装。远程 subprocess provider 不受支持。
- **撤销与重启** — 活动授权在关闭进程时结束；autoConnect 可在重启时恢复记住的授权。已学习的工具名和之前记录的截图分别遵循 Genesis 与 Session 保留策略，与操作系统访问权限分离。

<a id="dev-note"></a>
### 开发备注

无。
