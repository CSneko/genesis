---
kind: upgrade-guide
description: "Genesis QQ 连接配置从环境变量覆盖层迁入持久化设置。"
---

# Genesis QQ 连接设置

[English](guide.md) | 中文

## 变更

源码工作区的 Genesis Web 组合包含 QQ 设置入口。QQ 覆盖层不再读取 `GENESIS_QQ_WS_URL`、`GENESIS_QQ_BOT`、`GENESIS_QQ_OPERATOR`、`GENESIS_QQ_GROUPS` 或 `GENESIS_QQ_USERS`。未保存的连接默认禁用，保存后重启会重新连接；上游 Harness 默认配置保持不变。既有 QQ 准入策略和生命数据仍可读取。

对话策略行可读取模式版本 1，并显式继承新增提示词与窗口默认值；保存写入模式版本 2。旧构建会拒绝该行，避免丢弃新字段。自定义 Remote 客户端保存完整策略时必须提供 `extraPrompt`、`privateContextTokens`、`groupContextTokens` 和 `operatorContextTokens`。降级前应备份设置。QQ 显示名称与工作区归类沿用当前账号或群号，既有 Session ID 保持稳定。

QQ 对话请求现在通过 `maxCompletionTokens` 将包含推理的输出限制为默认 16,384 token，不再继承可能很大的适配器默认值；更小的显式上限保留。这可避免输出预留占用大部分对话窗口。既有 Session 历史仍可读取，首次新请求前仍可能按旧日志中的预留压缩一次。

## 迁移

1. 使用 `pnpm dsh web` 启动；当前工作区不再需要额外的 QQ `--patch` 参数。
2. 打开“设置 → QQ 连接”，保存 OneBot 共用令牌，再将旧端点、机器人和操作者账号填入连接配置，启用并保存连接。凭据提供者使用 `GENESIS_QQ_TOKEN`，管理的值优先于继承的值。
3. 将尚未保存的群和私聊允许列表填入对话准入并保存，已保存的策略保留原值。核对状态，通过已登录的 OneBot 客户端发送一条允许的消息。连接、重启和令牌移除行为见 [QQ 指南](../../../genesis/qq.zh.md)。

4. 重启 Host 加载 QQ 输出上限。需要更长 QQ 推理或回复的部署可在配置补丁中设置 `genesis-qq.config.maxCompletionTokens`；调大会减少可用输入空间。检查下一条 QQ `request/header` 中的实际 `maxTokens`。
