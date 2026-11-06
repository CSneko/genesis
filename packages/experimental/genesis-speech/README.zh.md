---
description: "Genesis 语音合成，支持配置阿里云 CosyVoice 音色。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-speech

[English](README.md) | 中文

## 概要

使用阿里云 CosyVoice 将文本生成 WAV 音频，并作为持久对话附件保存。在设置 → 语音合成中配置默认内置音色或自定义音色。请求会将文本发送至配置的服务商，并可能产生费用。本源码工作区的 Genesis Web 组合包含此可选层；普通 Harness profile 保持不变。

## 目录

[使用](#use) · [实现](#implementation) · [模型体验](#model-experience) · [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use"></a>
## 使用此包

通过受支持的工作区入口 `pnpm dsh web` 启动应用。将 `DASHSCOPE_API_KEY` 保存在 `$DSH_HOME/.credentials.yaml` 的 `refs` 下，或设置到主机启动环境；设置页只接收凭据名，不接收密钥值。设置页由可选 Genesis 客户端 UI 包提供。显式自定义组合应在 Genesis 及其 Life preset 后加载本包的 `cordis.patch.yml`。

源码工作区启动器将语音包选入 Genesis Web profile，加载顺序先于用户设置，因此设置页修改可持久保存并在重启后恢复。显式 home 或命令行覆盖仍保留正常优先级。

设置 → 语音合成可以修改完整 HTTPS 接口地址、CosyVoice 模型、默认音色 ID 和API Key 凭据名（`keyEnv`）。路由设置通过标准配置编辑器保存，供后续调用使用。修改主机环境变量需要重启。默认模型为 `cosyvoice-v3-flash`，音色为 `longanyang`，接口为 `https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`；请按阿里云账号要求配置对应地域的业务空间接口。

工具每次调用均通过标准 Harness 凭据服务解析凭据名：依次优先使用受管 `.credentials.yaml`、继承环境变量、项目 `.env` 和 Harness home `.env`。已保存凭据的修改供下一次调用使用，无须重启插件。未挂载凭据服务的组合只使用启动环境。凭据文件格式如下：

```yaml
version: 1
refs:
  DASHSCOPE_API_KEY: your-api-key
```

使用自定义音色时，先在阿里云创建音色，再填写音色 ID 和该音色绑定的模型。参见[官方语音合成接口](https://www.alibabacloud.com/help/en/model-studio/cosyvoice-tts-http-api)。本工具不注册或克隆音色。

在操作者的 Life 对话中学习 `genesis_speech`，再传入 `text` 调用；可选 `voice` 仅覆盖本次调用的默认音色。响应包含可下载的 `speech.wav` 附件以及实际模型和音色 ID。现有工具包成员规则和学习策略仍然生效。仅安装不代表已有合成成功记录。

可选 `rate` 设置 0.5～2.0 倍语速，省略时使用 1.0；`instruction` 请求情绪表达或说话风格，例如 `请用温柔开心的语气说话。`。指令最多 100 个加权字符，汉字按两个计算。`cosyvoice-v3.5-plus` 和 `cosyvoice-v3.5-flash` 的自定义音色适用自然语言指令；其他模型和音色可能要求固定指令格式，或拒绝不支持的指令。这些字段记录请求的表达方式，不代表已验证听感效果。

```json
{"text":"你好，今天见到你真开心。","rate":0.9,"instruction":"请用温柔开心的语气说话。"}
```

使用 Genesis Web UI 与提供主机文件路径的附件服务时，新结果显示原生播放器，支持播放、拖动进度和下载。音频通过现有认证文件接口读取，不向浏览器发送服务商下载地址或 API Key。日志结果包含本地附件路径及请求的语速和指令，可用于重放。没有记录路径的旧结果保留附件，需要重新生成才能直接试听。播放受现有文件接口的字节上限约束。

QQ Life 对话默认向普通发言者开放已注册的 `genesis_speech`，无需学习或启用工具包。调用会向已配置的服务商发送文本，可能产生费用；操作者可在部署配置中从 `qqBasicTools` 移除 `genesis_speech`，改为要求普通发言者取得明确的工具包权限。使用相同的音色、语速和情绪指令参数，再通过 `genesis_qq_send` 传入返回的 `attachmentId`，设置 `kind: "file"` 与 `asVoice: true`。发送仅面向当前 QQ 对话，沿用白名单、字节限制和持久防重发记录。OneBot 实现须支持 WAV 语音转换。

<a id="implementation"></a>
## 理解实现

<details>
<summary>实现细节</summary>

此层插入 `genesis-speech` 插件行。[注册代码](src/index.ts) 在联网前检查调用方的 Life preset，以及操作者或已绑定 QQ 会话，一次性捕获实时设置，并返回普通的已记录工具结果。[HTTP 合成](src/synthesis.ts) 执行一次非流式请求，再下载完整音频，下载时不转发密钥。服务商返回的 HTTP 音频地址会转为 HTTPS，保留路径和签名查询参数。API 接口仍要求 HTTPS，URL 不得嵌入用户名或密码，两次请求均拒绝重定向。音频下载失败时不会回退至明文 HTTP。附件服务负责持久字节和现有附件保留行为。

默认将文本限制为 2,000 字符、音频限制为 16 MiB、完整操作限制为 120 秒。`maxTextChars`、`maxAudioBytes`、`timeoutMs` 和 `lifePreset` 属于部署配置。卸载会中止请求并等待已接收任务结束，再释放依赖。超时、网络失败或重启后不自动重试；即使下载失败，之前的语音合成也可能已计费。

</details>

<a id="model-experience"></a>
## 模型体验

### 可学习的语音工具

#### 模型可见内容

QQ 默认获得已注册的语音工具声明，其他 Life 对话在学习后获得。每次调用记录输入文本和可选的音色覆盖值；结果记录实际模型、音色及持久附件引用。不添加语音专用提示词或辅助语言模型请求。返回结果不包含 API Key 或带签名的下载地址。

#### Token 影响

工具声明及有界文本和结果消耗对话 token。音频保持为文件附件，不自动转写或作为音频模型输入。

#### KV Cache 影响

工具调用和结果追加至 Session 历史。配置修改影响后续调用，不改写已有结果。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

仅实现兼容 CosyVoice 的 HTTPS 合成。输出为 24 kHz WAV；不提供自动播放、流式播放、音色克隆或发布。下载响应须具有 WAV 文件标识；工具不验证听感质量或音色相似度。本地验证使用模拟服务商，尚未验证付费阿里云合成或浏览器交互。

### 开发笔记

<details>
<summary>维护者工作上下文</summary>

无。

</details>
