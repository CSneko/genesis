---
kind: upgrade-guide
description: "Genesis 情绪锚点与念头凭据增加无聊及自主交流字段，旧版严格读取器会拒绝这些字段。"
---

# Genesis 无聊与空闲交流

[English](guide.md) | 中文

## 变更

第三版情绪锚点增加可选 `boredom` 状态。已有锚点可读取，随后通过明确的初始化记录加入状态，不替换生命身份或历史事件。即使其他情感计入停机时间，无聊也排除停机时间。念头运行增加可选 `social` 预留与结果，旧记录仍可读取。写入新字段后，旧版严格读取器会拒绝它们。

同时启用情绪与自发认知时，无需新的用户消息也可获得周期性空闲机会，已有机会预算继续生效。自主 QQ 目标须单独配置 `proactiveGroups` 或 `proactiveUsers`，既有对外发送清单不授予此权限；两个新清单默认均为空。

## 迁移

1. 升级前停止运行时，保留已验证的生命存储、`genesis_spontaneity`、QQ 消息回执及来源会话备份。回滚时使用匹配的运行时与存储，不要手动删除字段。
2. 使用相同 `DSH_HOME` 从已有受支持的 `dsh` 配置启动，在 Genesis → 情绪确认无聊与孤独分别显示。已有状态损坏或不兼容时，恢复已验证存储，不要创建替代生命。
3. 在既有 Genesis 补丁中调整 `emotion.boredom.riseHalfLifeMs`、`fallHalfLifeMs`，以及可选的 `spontaneity.boredomThreshold`、`boredomCheckMs`、`boredomMinIntervalMs` 和 `boredomMaxIntervalMs`。在 Genesis → 念头暂停认知，可关闭后续空闲机会。
4. 如需自主 QQ 交流，明确配置 QQ 插件的 `proactiveGroups` 和/或 `proactiveUsers`，并通过 `spontaneity.socialCooldownMs` 与 `socialMaxPer24Hours` 配置共享发送限制。确认当前 QQ 连接并检查持久回执；不确定的发送不会自动重试。
