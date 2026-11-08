---
kind: upgrade-guide
description: "Genesis 支持模型继承和可选嵌入；Minecraft 继承完整共享决策模型。"
---

# Genesis 全局模型配置

## 变更

新的 Life 配置默认将 DSH 当前默认模型用于记忆写入和临时总结。已有自定义路由继续独立生效。嵌入模型可选：关闭或完全未配置时使用有界文本检索，并保留来源引用。只填写部分嵌入配置仍会明确失败。

Minecraft 继承现在包含知识库决策模型本身，不再只继承端点和凭据。新配置默认关闭视觉。共享提供方和 OpenAI 兼容路由支持纯文本判断；图片判断要求兼容的 Jev 路由。

新的继承标记和关闭嵌入设置扩展了 Genesis 配置数据。旧版本可能拒绝这些设置，本次不提供降级支持。身份和生命历史继续保留。

本地部署替换 Qwen GGUF 和 llama.cpp 安装器。`localDecision.modelUrl` 和 `modelSha256` 现在指定 Ollaya 清单，运行时地址及校验和指定 Ollaya 压缩包。`binary` 必须是 Ollaya，`model` 是小写字母数字别名，可包含连字符。移除仅用于 llama.cpp 的 `contextTokens`、`probeMaxTokens` 和 Windows ARM64 运行时字段。

## 迁移

1. 打开“设置 → 知识库”。启用“复用 DSH 当前 LLM”可替换原先独立的写入模型，也可继续保留自定义。在临时记忆设置中启用“复用全局记忆 LLM”，即可动态跟随该写入模型。
2. 可保持嵌入模型关闭以使用文本检索，也可保留现有端点。为决策模型选择云端配置或明确部署本地模型。本地部署通过 `/v1/systemone` 使用 Laya multilingual 和 Ollaya。自动安装运行时支持 Linux x64 和 Windows x64，其他平台需配置 Ollaya `localDecision.binary`。Linux 需支持 Zstandard 的 `tar`；Windows 需系统自带 `tar` 和对应架构的 Microsoft Visual C++ 运行库。
3. 若覆盖了本地部署字段，请移除 Qwen／llama.cpp 覆盖以使用新默认值，并移除停用字段。停止旧本地部署后点击“本地快速部署”安装新文件；已选中的旧部署在安装前会报告文件缺失。旧 GGUF 和运行时压缩包不再使用；卸载本地部署可清除这些托管文件，不影响生命数据。
4. 检查 Minecraft 设置。要保留不同于知识库的模型，请关闭继承并配置独立 Jev 路由。使用纯文本路由时关闭视觉。
5. 使用相同 `DSH_HOME` 重启，确认生命身份、实际模型及已有记忆。尝试降级前备份 Genesis 配置存储域及凭据库。部署与恢复限制见[模型配置](../../../genesis/memory.zh.md)。
