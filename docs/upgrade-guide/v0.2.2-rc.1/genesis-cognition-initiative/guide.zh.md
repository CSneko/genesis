---
kind: upgrade-guide
description: "Genesis 自发认知统一选择主动交流，并允许已学习的内联工具及已登记工作区选择。"
---

# Genesis 自发认知与主动交流

[English](guide.md) | 中文

## 变更

Genesis 同时组合 `spontaneity` 和 `socialInitiative` 时，由自发认知统一选择新的主动交流。独立消息定时器和事件决策停用；既有发件机制保留渠道策略、投递限制与回执恢复，尚未派发的机会标记为跳过且不会重放。界面在 Genesis → 自发认知与主动交流集中展示控制和回执。

`spontaneity.tools` 默认变为 `['*']`，探索期间允许已学习且已启用的内联工具。`genesis_workspace` 可以进入已登记工作区，并在 `workspace-write` 下为内部 Session 临时授权所选目录。只读策略、操作者停止与学习要求仍生效；委派、后台任务、通用消息、调度和 PTC 仍不可用。

工作区 `cordis.life.patch.yml` 的默认文件策略从 `workspace-write` 改为 `danger-full-access`，也适用于来源对话未显式收窄会话模式的主动认知。已接入的文件和 Shell 工具可在操作系统权限范围内修改工作区外的文件；`DSH_PERMISSION_MODE` 和后续策略补丁仍可显式覆盖部署配置。

## 迁移

1. 使用相同 `DSH_HOME` 重启现有 `dsh` profile，无需迁移生命或 Session 数据。
2. 打开 Genesis → 自发认知与主动交流，启用认知；需要 Web 主动投递时再启用渠道策略。QQ 仍要求原有主动目标允许清单。
3. 若要保留原工具限制，在 Genesis 插件配置显式设置 `spontaneity.tools: [read, write, edit, genesis_record, genesis_toolkit]`。
4. 将目标目录登记为已有工作区。完成真实 Life 交流后，检查下一次活动及工具结果；选择工作区不会恢复其中的会话，详见[自发认知](../../../genesis/spontaneity.zh.md)。
5. 若要保留仅限工作区的写入范围，启动时设置 `DSH_PERMISSION_MODE=workspace-write`，或添加后续 `sandbox-policy` 补丁并设置 `config.mode: workspace-write`。已有会话的显式模式仍优先。
