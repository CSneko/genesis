---
kind: upgrade-guide
description: "Genesis 计划管理改为主模型显式工具调用，新计划使用可读 ID 替代 UUID。"
---

# Genesis 生命计划改用主模型工具

[English](guide.md) | 中文

## 变更

可选 `deliberation` 增加持久审议状态与先天工具 `genesis_plan`。主对话模型通过显式工具调用创建和更新动机、跨会话计划。新计划 ID 必须使用模型指定的描述性名称，例如 `review-capability-growth`；已有 UUID 保持身份与引用不变。辅助模型不能创建、更新或放弃这些承诺。所有旧 `deliberation.requestMode` 值均使用目标上下文，不再独立检查请求接受。可信入口 `LifeDeliberationEngine.deliberate` 现在返回 `Promise<void>`，向主模型排入已记录的 `genesis-planning` 思考机会，不再返回辅助模型选择。独立主动交流仍保留只读的说话/等待判断。已有身份和历史保持不变，旧版严格审议读取器可能拒绝可读 ID。Harness 会话格式版本不变。

## 迁移

1. 停止旧进程，保留两个生命存储域及独立备份的经验证副本，保持同一 `DSH_HOME`、存储路由和锁路径。
2. 重新构建 Genesis，保留 `deliberation: {}`。计划不要求记忆写入模型，记忆、情绪和主动交流保留既有模型要求。移除过时的 `requestMode` 覆盖值，或使用 `context-only`；这些值不能恢复外置请求判断。
3. 请主模型考虑一份长期计划，检查已记录的 `genesis_plan` 调用、可读 ID、具体下一步行动及重启连续性。主模型也可以选择不建立计划。可信适配器应等待 `deliberate` 完成，不再依赖返回选择；检查 `genesis-planning` 通知，并在重试不确定派发前检查预留记录。
4. 更新已有 UUID 计划时保留原 ID。包含可读 ID 的生命不应降级到旧版严格读取器；确需降级时，一起恢复经验证的兼容存储与对应备份。绝不删除无法读取的生命来创建替代身份。支持的 `dsh` 组合与字段见[生命计划](../../../genesis/motivation.zh.md)。
