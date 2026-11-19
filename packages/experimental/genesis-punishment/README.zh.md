---
description: "向操作者指定的 webhook 发送可配置的 Genesis 惩罚等级。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-genesis-punishment

[English](README.md) | 中文

## 概述

在私有主人 Life 会话或显式启用的 QQ 群聊中向你自己的 webhook 发送惩罚等级。工具描述、等级含义和目标地址均由你配置。默认描述建议使用 0.0～1.0，但工具接受任何有限数值，不会截断数值。插件为可选功能，启动时不会发送请求。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

通过 `pnpm dsh web` 启动本仓库。进入 **插件 → Genesis → 惩罚**，填写 webhook 地址、工具描述和等级说明并保存，再在 Genesis 插件列表打开“惩罚”开关。集成已内置，默认关闭，无需环境变量或额外启动补丁。设置与开关在重启后保留，保存后即时生效，不会发送测试请求。

教会 Genesis `genesis_punish`，并通过 `genesis_toolkit` 启用 `punishment` 工具包；启用插件不代表已学习或已获得工具包权限。源码启动器先选择此 [profile 组合包](cordis.patch.yml)，再应用已保存的 profile 设置。配置开关控制功能启停；不要额外通过 `--patch` 加载组合包补丁，因为命令行覆盖层晚于已保存设置应用。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `false` | 即时开关；关闭时中止活动请求，并拒绝后续调用。 |
| `allowGroupChats` | `false` | 允许经传输层绑定的 QQ 群聊；仍检查工具学习、工具包激活和 QQ 权限。 |
| `webhookUrl` | 空 | HTTP(S) 绝对地址；拒绝内嵌凭证和片段。 |
| `webhookHeaders` | `{}` | `Authorization` 等私有 HTTP 请求头；Content-Type 始终为 application/json。 |
| `description` | 惩罚主人说明 | 模型可见的完整工具描述。 |
| `levelDescription` | 通常采用 0.0～1.0 | 模型可见的 `level` 含义；不强制限制范围。 |
| `lifePreset` | `life` | 允许使用工具的 Life 组合预设。 |
| `timeoutMs` | `10000` | 单次发送的截止时间。 |

需要鉴权时，在条目的 `config` 下添加 `webhookHeaders`，从环境变量读取值，不要提交密钥。两项描述中都不要包含凭证。webhook 地址为空时不会发送请求。清空地址并保存即可移除配置的目标。

调用 `genesis_punish({"level": 0.5})` 会发送一次 HTTP POST，JSON 正文为 `{"level":0.5}`。正文不包含会话、记忆或身份数据。当接收端返回 HTTP 204 时，2xx 响应产生结果 `{"accepted":true,"level":0.5,"status":204}`。这只确认 HTTP 请求已被接受；插件不验证下游动作。webhook 响应正文会被丢弃，不会被当作指令。

使用 `lifePreset` 的私有主人会话能够执行工具。要允许使用该预设的 QQ 群聊，请在惩罚设置中打开“允许群聊使用”并保存。群聊仍需有效的工具包激活记录，并通过已有 QQ 工具权限检查。该开关适用于所有已接入的 QQ 群聊；QQ 私聊和无关预设仍被拒绝。关闭开关后拒绝后续群聊调用。现有工具守卫继续生效。在描述中配置更大的等级范围不会扩大运行时权限。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节</summary>

[插件](src/index.ts)注册可学习的托管工具包，使用普通 Session 工具调用及结果记录模型可见内容。集成初始化单独记录可用状态，与学习及成功使用区分。可编辑设置使用可序列化的校验规则，浏览器能够校验从 Host 收到的配置。目标地址由部署配置持有，模型参数不能选择 URL。卸载会注销工具、中止活动请求并等待完成。没有新增持久化事件格式，也不会因回放而发送请求。

</details>

<a id="further-exploration"></a>
## 进一步探索

- [Genesis](../genesis/README.zh.md)：Life 归属和工具学习。
- [架构](../../../docs/architecture.zh.md)：配置组合和工具执行。
- [工具编写](../../../docs/cookbook/adding-a-tool.zh.md)：守卫和日志结果。

<a id="model-experience"></a>
## 模型体验

### 配置的工具与发送结果

#### 模型看到什么

学习并启用后，模型看到配置的描述和一个必填数值参数 `level`。结果包含提交的等级、HTTP 状态及接受标记，或不含凭证的失败消息。工具声明及结果进入普通 Session 日志。Web 默认使用通用工具卡片展示。

#### Token 影响

工具暴露时，配置的描述增加声明 token。每次调用追加简短结果；webhook 响应正文不会进入上下文。

#### KV Cache 影响

学习、工具包激活和描述修改可能改变工具声明。发送结果追加到历史记录中。插件不会创建后台提示词或唤醒。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

发送保证止于接收端的 HTTP 响应。

- 拒绝重定向。请求不会自动重试，包括 HTTP 拒绝、超时或取消之后。
- 发送后，网络失败、取消或非 2xx 响应无法确认下游动作是否已发生。再次发送前应检查接收端；没有持久化的恰好一次发送机制。
- 等级描述指导模型选择，但不强制执行强度策略。物理或具体应用的限制由接收端校验负责。
- 启用插件授予其访问操作者指定固定目标的网络权限；它不会获取单次调用的 shell 沙箱，也不会单独请求一次审批。

<a id="dev-note"></a>
### 开发备注

无。
