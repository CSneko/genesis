---
kind: upgrade-guide
description: "Genesis 日常功能从设置迁移到左侧边栏的独立主页。"
---

# Genesis 主页导航

[English](guide.md) | 中文

## 变更

Genesis 在左侧边栏增加与插件、自动化任务并列的入口。生命信息、记忆、性格、情绪、关系、目标与文字记录从设置迁入此页面，委派任务与消息投递回执也在其中展示。知识库、工具包、Minecraft 配置及主动发送策略仍在设置中，原日常功能设置分区 ID 不再作为导航目标。

任务监控采用经过认证的有界只读查询，不启动模型或恢复工作，执行控制仍属于原会话。导航迁移不改变已存生命或会话格式、工具学习状态及权限。

## 迁移

1. 一同重新构建 Genesis Host 反射与浏览器配套插件，沿用相同 Genesis 覆盖配置和存储，重启现有受支持的 `dsh` Web 或 Desktop 配置。
2. 从左侧 Genesis 进入日常功能。自定义 UI 若链接原日常功能设置分区，改为 Genesis 主页（`main` 键 `genesis`）及其 `genesis.page` 分区；模型与连接配置保留设置入口。
3. 检查“Genesis → 委派任务”显示真实可访问任务，或明确的空/不可用状态；“Genesis → 发件记录”显示回执。发送策略在“设置 → 主动消息设置”中编辑。
4. 自定义浏览器组合须包含配套清单声明的 `@deepseek-ai/dsh-client-ui-sidebar`。禁用配套插件会移除其主页和设置贡献，不删除数据，详见[配套插件 README](../../../../packages/experimental/client-ui-genesis/README.zh.md)。
