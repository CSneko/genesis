---
kind: upgrade-guide
description: "工作区 Genesis Web 默认启用计划睡眠和私有自发认知。"
---

# Genesis 睡眠与自发认知默认值

## 变更

工作区 Genesis Web 之前保持清醒，自发认知需要额外补丁；现在 Life 组合默认启用两者。计划睡眠暂停自主活动和 QQ 回复，私聊保存在独立的持久化待阅箱中。不加载 Genesis 的普通配置不受影响。新睡眠与念头设置独立于 Session 数据存储。

## 迁移

1. 使用原有 `DSH_HOME` 启动 `pnpm dsh web`，检查设置 → 睡眠及 Genesis → 念头。默认中国时区工作日作息见[睡眠](../../../genesis/sleep.zh.md)。
2. 希望持续清醒时，在设置禁用睡眠；不需要私有探索时，在念头页面禁用。显式组合可以省略 `genesis.config.sleep` 和 `genesis.config.spontaneity`；工作区 Life 补丁默认提供这两个字段。
3. 完整备份用户目录，包括新增存储域和来源 Session。不要让旧运行时读取包含新探索决策或设置的数据。重启后确认横幅与设置显示预期的已保存状态。
