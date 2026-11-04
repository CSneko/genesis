---
description: "读取 B 站材料，并在 Genesis 统一记录中保留观影札记。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-bili-humanism

[English](README.md) | 中文

## 概述

在 Life 对话中读取 B 站文字与可选抽样画面，通过统一的“她的记录”保存观影札记。本源码工作区的 Genesis Web 默认组合包含固定版本的上游读取器；日记、随笔与观影札记共用 Genesis 记录功能。读取和写作不会自动建立长期记忆，不启用定时取稿、上游人格学习或平台写入。

## 目录

[使用](#use) · [配置](#configuration) · [实现](#implementation) · [进一步探索](#further-exploration) · [模型体验](#model-experience) · [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use"></a>
## 使用

使用 Node.js 24 或更新版本，并安装工作区依赖。Genesis Web 启动器默认包含此组合；在仓库根目录启动，并保持相同的 `DSH_HOME` 以延续生命身份：

```sh
pnpm dsh web
```

可以先查看配置组合，无需启动服务：

```sh
pnpm dsh --profile web --dump-config
```

在 Life 对话中，通过现有 `learn` 工具教授 `bili_humanism_guide`、`bili_humanism_read`、`bili_humanism_source` 和 `genesis_record`；需要本地转写时再学习 `bili_humanism_transcribe`。先读适配后的指南，再读取 BV 或视频链接并说明覆盖范围。确有值得保留的经历时，用 `genesis_record` 的 `types` 查看分类，然后用 `write` 写观影札记。画面还需要支持图片的模型、持久附件、本地依赖和相应工具。读取文字不代表完整播放视频。

Genesis 必须启用 `records` 和私有 `personalDirectory`；工作区生命覆盖配置已提供。适配器初始化 `viewing-notes`（观影札记）分类，已有分类的改名和停用保持有效。正文应保留视频链接、来源 ID、时间点依据和未覆盖部分，并区分事实、作者观点、个人感受与推测。使用“她的记录”统一搜索、编辑与删除；写作不自动进入提示词、长期记忆或人格。详见[文字记录](../../../docs/genesis/records.zh.md)。

若只停用此集成，在后续补丁中为 `genesis-bili-humanism` 设置 `disabled: true`。其他组合可通过附带的 `cordis.patch.yml` 显式启用。保留数据目录以便恢复；该组合不注册平台写入工具。普通预设不能执行这些工具，Life 工具学习仍不授予执行权限。

### 本地媒体配置

使用与 profile 相同的私有数据目录，手动运行一次上游安装器。它创建独立 Python 环境，安装固定版本的二进制依赖，校验约 464 MiB 的 ASR 模型下载，并以 CPU/int8 加载模型，不改动全局 Python。默认工作区 home 可在仓库根目录执行：

```sh
BILI_HUMANISM_HOME="${DSH_HOME:-$HOME/.genesis-harness}/bili-humanism" node packages/experimental/genesis-bili-humanism/node_modules/dsh-bili-humanism/bin/cli.mjs setup-media --asr --download-model
BILI_HUMANISM_HOME="${DSH_HOME:-$HOME/.genesis-harness}/bili-humanism" node packages/experimental/genesis-bili-humanism/node_modules/dsh-bili-humanism/bin/cli.mjs doctor
```

工作区补丁启用可学习的 `bili_humanism_transcribe` 工具，它需要现有的 Subprocess 提供方。没有字幕时，使用未确认结果中保留的阅读 ID。转写返回新的 A3 阅读 ID；通过 `bili_humanism_source` 读取带时间点的正文，再决定是否值得写观影札记。结果是机器 ASR，并非已核实逐字稿。工具调用不会安装依赖或下载模型权重。音频和转写文件保留在上游私有数据目录中。

抽帧使用同一环境，还需要当前路由模型支持图片以及持久附件服务。抽帧失败不能证明宿主收不到图片。未确认的文字结果会保留阅读 ID 与画面诊断；已经交付的画面仍作为成功的部分读取返回。

<a id="configuration"></a>
## 配置

补丁添加 `genesis-bili-humanism`，其私有 `dataDir` 位于当前 `DSH_HOME` 下。可信部署配置可在后续补丁中覆盖这一行。不要在同一组合中另外装载上游 bundle。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `dataDir` | 必填；由补丁提供 | 属于此生命的上游账本与收件箱绝对私有目录 |
| `credentialPath` | 空 | 可选本地读取凭据绝对路径；不会自动导入账号凭据 |
| `pythonPath`, `asrModelPath` | 空 | 可选可信媒体执行程序与本地 ASR 模型绝对路径 |
| `maxReadTokens` | 60000 | 上游每份材料的文字 Token 估算预算；不是模型计费上限 |
| `maxMediaSeconds` | 未设置 | 可选来源时长上限；上游请求、字节和总耗时限制仍然有效 |
| `lifePreset` | `life` | 只有这个已组合的预设可以执行 B 站工具 |
| `recordTypeId`, `recordTypeName` | `viewing-notes`, `观影札记` | 稳定分类编号和仅首次使用的展示名称 |
| `sourceChars` | 100000 | 完整来源 JSON 的解码字符上限 |
| `legacyBatchSize` | 8 | 每次显式同步迁移的旧手账数量，最多 50 条 |
| `localAsr` | 未设置；工作区补丁启用 `{}` | 通过现有 Subprocess 提供方注册本地转写 |
| `localAsr.timeoutMs`, `localAsr.graceMs` | 180000、1000 | 完整音频/转写期限与进程终止宽限，单位毫秒 |
| `localAsr.maxOutputBytes` | 1000000 | 每个维护命令输出流的收集字节上限；拒绝被截断的输出 |

上游错误会转换为失败的 Harness 工具结果；空稿和未确认的文字读取不计为成功。学习 `genesis_bili_sync` 后，从 `offset=0` 开始，按 `nextOffset` 迁移旧手账，直到它为 null。它只读固定版本的上游账本，保留原始时间、手账 ID、视频来源、覆盖范围和完整正文。创建归属指向实际执行迁移的会话与工具调用；原始上游账本和已经导入的长期记忆均保留。

<a id="implementation"></a>
## 实现

<details>
<summary>实现细节——点击展开</summary>

适配器挂载未修改的[上游 v1.11.3 发行版](https://github.com/InariNGT-Ofiicial/dsh-bili-humanism/releases/tag/v1.11.3)，由依赖 URL 与锁文件完整性固定版本。它替换模型读到的指南，关闭上游人格学习、观影提问、每日取稿和所有平台写入，禁止独立的个人记忆与手账写入工具。新文字统一使用 `genesis_record`，不增加应用二进制入口。

显式迁移按配置限制完整校验一页数据，再通过 Genesis 记录所有者串行提交。每条记录以生命身份和旧手账 ID 生成永久去重凭据，跨会话重试保持已有人工编辑，也不会恢复已删除内容。迁移先确认来源工具调用的 Session 持久化。记录沿用现有存储格式与 Markdown 恢复机制；存储结果不明时停止依赖操作，恢复访问并重启后可安全重试同步。卸载会取消并等待活动操作结束，再关闭上游存储。

</details>

<a id="further-exploration"></a>
## 进一步探索

[Genesis](../genesis/README.zh.md) · [记忆](../../../docs/genesis/memory.zh.md) · [上游项目](https://github.com/InariNGT-Ofiicial/dsh-bili-humanism)

<a id="model-experience"></a>
## 模型体验

### 材料读取与统一写作

#### 模型看到的内容

学会的读取工具提供有界材料、时间点和覆盖范围。指南引导角色通过 `genesis_record` 写作，`genesis_bili_sync` 返回迁移回执和继续位置。只有实际读取到的正文和图片可作为依据；工具结果和记录读取沿用普通 Session 日志。

#### Token 影响

读取和写作使用对话模型的普通预算，迁移不增加辅助模型调用或复制整个档案进提示词。记录搜索使用文字子串匹配，不调用嵌入模型。

#### KV 缓存影响

工具结果进入持久对话；已保存记录通过显式读取或搜索结果参与上下文。适配器不增加动态系统提示词区块。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 集成检查覆盖真实上游工具、存储和受管进程清理；媒体命令输出和模型决策使用合成夹具。本地成功抽帧或转写不代表已验证字幕准确性、ASR 措辞或视觉模型理解。
- 旧手账迁移需要显式同步，不在启动或恢复会话时自动执行。迁移可能逐条提交；中途失败后从同一偏移重试即可。超过记录长度或容量限制时会拒绝，不静默截断正文。
- 札记仍是未经核实的个人表达，不自动成为事实、长期记忆或人格；原始上游档案和 Session 日志的删除独立管理。

<a id="dev-note"></a>
### 开发备注

无。
