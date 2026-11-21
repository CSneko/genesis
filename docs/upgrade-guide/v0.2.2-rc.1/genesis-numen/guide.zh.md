---
kind: upgrade-guide
description: "Genesis 通过 MCP 接入 Numen 模组，替换原 Minecraft 连接器。"
---

# 通过 Numen 将 Genesis 接入 Minecraft

[English](guide.md) | 中文

## 变更

Genesis 停用 `@deepseek-ai/dsh-experimental-genesis-minecraft` 组合包、Minecraft 设置页、`minecraft_*` 工具和 Jev 监测。加载配置时会从已保存的组合包列表移除旧条目。Numen 通过“设置 → MCP 服务”提供游戏动作。

## 迁移

1. 从 profile 覆盖配置移除显式的 `genesis-minecraft` 条目，以及指向旧包的 `--patch` 参数。沿用同一 `DSH_HOME` 和生命存储，以继续使用已有角色、记忆和 Session 历史。
2. 在 Numen 启用“外接大脑”，然后在 Genesis [添加连接](../../../../packages/experimental/genesis-mcp/README.zh.md#connect-numen)。Numen 使用自己的同伴和连接设置，请填入它的地址和令牌。
3. 确认服务已连接，请 Genesis 在生命对话中通过 Numen 发言。按需学习新的 MCP 工具名。如果“设置 → 工具包”仍列有旧 Minecraft 工具包，可以移除它。历史 Session 仍可打开。
