---
kind: upgrade-guide
description: "Genesis 生命配置将已存记忆在 Web 与 QQ 之间共享，不再按来源对话隔离。"
---

# Genesis 跨对话记忆共享

[English](guide.md) | 中文

## 变更

`cordis.life.patch.yml` 选择 `memorySharing: life`。已存长期记忆和未过期临时摘要可以进入任何参与的 Web、QQ 私聊或 QQ 群聊中的有界提示词、回忆结果及辅助推理，包括升级前保存的记录。原人物、来源事件、历史和临时记忆受众字段继续保存。原始 Session 历史、附件、操作者身份描述、计划和工具授权仍遵循各自的访问规则。生命身份和存储模式保持不变。

单独挂载 Genesis 默认使用 `memorySharing: conversation`，保持来源受众隔离。切换策略不会改写记忆，也不会擦除已投递并记录在 Session 中的文字。

## 迁移

1. 保持同一 `DSH_HOME`，重启受支持的 `pnpm dsh web` 入口以加载更新后的生命覆盖层。不需要迁移记忆或重建嵌入。
2. 若需保留隔离，在生命覆盖层之后应用操作者补丁，在 Genesis 行设置 `id: genesis` 和 `config.memorySharing: conversation`。跨对话回忆使用 `life`。参见[记忆配置](../../../genesis/memory.zh.md)。
3. 在允许的 QQ 群中，使用 `genesis_recall` 查询已存 Web 记忆中的独特词语。`life` 下应能在普通结果限制内获取当前正文；`conversation` 下仍排除其他来源的记忆。
4. 切回隔离仅影响后续记忆选择。已经投递的 Session 消息会保留，直到通过现有 Session 删除控件移除。
