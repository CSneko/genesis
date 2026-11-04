---
kind: upgrade-guide
description: "Minecraft 连接信息从持久设置移到显式连接参数。"
---

# Minecraft 连接参数

[English](guide.md) | 中文

## 变更

Minecraft 设置不再包含 `host`、`port`、`username`、`auth`、`version` 或 `sessionId`，设置页也不再提供连接按钮。`minecraft_connect` 必须提供 `host` 和 `username`；可选 `port` 默认 25565，`version` 默认自动识别。游戏通知使用调用工具的角色当前生命会话。

经过身份验证的 `genesisMinecraft.connect` 方法现在在取消信号前接收 `MinecraftConnection`。它创建连接所属的生命会话，不使用已保存的目标会话。

## 迁移

1. 在“设置 → Minecraft”中启用访问并配置监测。已有版本 1 设置经过校验后保留监测偏好；旧连接字段被忽略，下次保存写入版本 2。无效存储仍会明确失败。
2. 让角色通过 `minecraft_connect` 连接，提供服务器与离线玩家名称。工具学习、工具包与权限要求仍然生效。Remote 调用方需向 `genesisMinecraft.connect` 提供 `{ host, port, username, version }`。
3. 确认设置页显示连接状态与实际游戏会话 ID。使用“停止动作”或“断开连接”结束活动。重启不会自动重连。
