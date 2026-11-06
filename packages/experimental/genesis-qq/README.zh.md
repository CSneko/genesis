---
description: "可选的 OneBot 11 对话层，提供稳定 Genesis 人物身份以及独立的群聊和私聊 Session。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-qq

[English](README.md) | 中文

## 摘要

为已初始化的 Genesis 生命添加 QQ 群聊和私聊对话。源码工作区包含其设置入口，QQ 初始未连接；上游配置需显式加载覆盖层。显式允许列表和鉴权的 OneBot 连接控制输入；关系不会授予主机权限。详见[连接与关系行为](../../../docs/genesis/qq.zh.md)。

启用 Genesis 睡眠时，私聊暂存于持久化存储并暂停回复。经过验证的操作者可以临时唤醒或发送 `g#保持清醒`；参见[睡眠与恢复](../../../docs/genesis/sleep.zh.md)。

## 目录

[使用](#use) · [实现](#implementation) · [进一步探索](#further-exploration) · [模型体验](#model-experience) · [已知限制与延后工作](#known-limitations-and-deferred-work)

<a id="use"></a>
## 使用

在当前源码工作区中，通过支持的入口启动，再按 [QQ 指南](../../../docs/genesis/qq.zh.md)在“设置 → QQ 连接”配置连接：

```sh
pnpm dsh web
```

在设置中禁用 QQ 连接即可关闭传输。补丁只插入 `genesis-qq`，依赖既有 Genesis 生命预设、Agent、默认模型、凭据和持久化 Session 服务。它不会安装 QQ 客户端或初始化第二个生命。默认配置和资源上限见[配置目录](../../../docs/config-catalog.zh.md)。

QQ 偏好只向 QQ 请求附加有界、带日志的提示词。上下文窗口默认私聊 200k、群聊 400k、操作者私聊 500k token，通过自动压缩受模型容量限制。Web 将这些 Session 归入 QQ 工作区，并在收到消息时刷新按账号关联的显示名称。设置行可读取模式版本 1～3，保存写入版本 3。QQ 请求通过 `maxCompletionTokens` 将包含推理的输出限制为默认 16,384 token，避免适配器的大额默认输出预留挤占输入空间；更小的显式上限仍然生效。

群聊默认通过独立配置的 QQ 决策模型或明确复用的共享路由及最近五条消息选择回复，私聊绕过此判断。决策和未回复的观察记录保存在来源 Session。正式回复也收到近期页面，其中不含审计消息标识或翻页游标；提供给模型的人物关系省略数值置信度。内置 `genesis_qq_history` 工具只能翻阅当前 QQ 对话较早的本地消息。输入／输出预算、中断、释放和删除行为见 [QQ 指南](../../../docs/genesis/qq.zh.md)。

已归档的 QQ 会话暂停回复，直到操作者取消归档。设置会报告因归档而停止的已允许对话；入站消息不能自动恢复会话或预留输入 ID。参见[会话恢复](../../../docs/genesis/qq.zh.md)。

QQ 指南说明有界图片／视频／文件读取、当前对话媒体发送、同范围消息引用及真实决策概率。历史将附件 ID 与可截断的文字分开，后续轮次可通过 `genesis_qq_read_media` 按附件 ID 或本地保留的消息 ID 读取；已核验为同一对话的引用也会接收媒体。原字节使用附件存储；转换需要托管子进程和强制沙箱。QQ 专用模型设置和近期概率记录使用独立的第一版存储域，密钥使用既有凭据服务。

默认媒体来源通过 `https://*.qq.com` 允许 HTTPS 子域，并单独包含 `https://multimedia.nt.qq.com.cn`；部署覆盖 `mediaOrigins` 时须明确保留所有需要的来源。下载限制见 QQ 指南。

仅操作者可用的 `genesis_message` 工具可搜索平台实际目标、发送文字、转发近期操作者原始消息并检查投递回执。单独配置 `outboundGroups` 和 `outboundUsers`，两者默认均为空，不继承输入接收权限。冷目标会被打开，但不启动模型轮次。持久预留防止相同工具请求重复发送，未知结果在重启后仍可检查。限制、配置、归属及删除方式见[跨会话发消息](../../../docs/genesis/qq.zh.md#cross-conversation-messages)。

生成的[语音](../genesis-speech/README.zh.md)可直接作为 QQ 语音发送：将本对话中的附件 ID 交给 `genesis_qq_send`，设置 `kind: "file", asVoice: true`。预留发送额度和联网前会验证 WAV 格式；未知回执仍沿用禁止自动重发的行为。

同一工具也能发现已启用的[智能体伙伴会话](../genesis-companion/README.zh.md)。内部发送交给伙伴提供方，可启动有界交流；QQ 发送仍沿用既有冷目标行为和允许列表。伙伴回执与 QQ 确认分别保留。

<a id="implementation"></a>
## 实现

<details>
<summary>实现细节</summary>

QQ 设置不依赖全局压缩服务；窗口策略交由对话预设中的后端执行。[cordis.patch.yml](cordis.patch.yml)注册设置入口而不建立连接。[controller.ts](src/controller.ts)串行处理连接与凭据修改，收尾旧传输并恢复独立版本的非敏感设置；令牌使用既有凭据提供者。[runtime.ts](src/runtime.ts)负责输入准入、按对话排队、Session 组合和发送回执。Genesis 负责人物身份、关系和来源限制的记忆。只执行固定版本上游桥接器的 OneBot 传输部分，不挂载其独立设置、记忆、提醒和完整桥接运行时。工作区维护的补丁导出传输类型、添加正向连接、保留仅含提及的输入，并在释放时结算待完成的动作。构建产物内联传输实现并随附其 MIT 许可；安装者无需应用工作区补丁。

</details>

<a id="further-exploration"></a>
## 进一步探索

[实验包](../README.zh.md) · [Genesis](../genesis/README.zh.md) · [QQ 指南](../../../docs/genesis/qq.zh.md) · [上游桥接器](https://github.com/cheesehaqi/dsh-qq-onebot-bridge)

<a id="model-experience"></a>
## 模型体验

此层通过既有 Agent 收件箱提供带身份归属的实际发言者和普通生命对话输入。Genesis 负责已记录的身份、按范围召回和参与者关系上下文。发送助手可见文本及显式调用的本对话媒体工具内容；群回复中的数字 `@QQ号` 转为真正的提及段，不发送思考或工具结果。模型通过 QQ 号、当前昵称和已记录称呼识别人，内部人物 ID 仍属于 Host 的归属数据。账号识别跨群共享，不共享各场景的私密对话。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

需要外部已登录的 OneBot 11 客户端。QQ 内置按范围召回、当前对话历史和已注册搜索工具；已学会的写作与工作区任务工具无需启用工具包，只在操作者本人发言的已验证轮次执行，其他已学工具须属于明确获准且已启用的工具包。不提供视频音频转录、Office／压缩包解码、QQ 主动联系和好友请求自动处理。结果不确定的发送需要操作者检查，不会自动重试。所选上游版本无法从 npm 获取，因此依赖固定到 GitHub 源码。

## 开发说明

无。
