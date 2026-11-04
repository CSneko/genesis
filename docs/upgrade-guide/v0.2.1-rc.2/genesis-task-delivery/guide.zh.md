---
kind: upgrade-guide
description: "Genesis 任务投递与执行控制要求在工作区和会话数据之外保留其记录。"
---

# Genesis 任务投递与执行控制

[English](guide.md) | 中文

## 变更

Genesis 任务在创建工作会话前，将提交保存在版本 1 的 `genesis_tasks` Storage Domain。记录还可包含停止状态和幂等执行控制回执，单独的生命状态备份不能恢复它们。旧运行时可能拒绝控制字段或忽略回执，无法执行持久暂停的约束。

检查将最近一轮的 `state` 与 `execution_state` 分开，`result_complete` 现在要求没有未结束活动。使用 `attempts` 分页读取轮次历史。停止和恢复要求自己的 `request_id`，以及匹配检查结果的 `expected_turn`。Life 不能恢复已完成任务或用户发起的停止。

## 迁移

1. 停止旧写入方，备份完整 Harness 主目录以及单独路由的存储根目录。重启时沿用相同生命、写入租约、工作区及会话存储路径。
2. 在自定义 Storage Domain 路由和备份策略中包含 `genesis_tasks`。已有任务仍通过会话证据读取，不需要转换会话格式。
3. 使用 `genesis_tasks` 的 `list` 和 `inspect` 检查已存提交。用相同输入及 `request_id` 重试 `create` 以完成待投递提交，或用 `cancel` 清除尚未投递的排队提示词。对已投递的未完成工作使用显式 `stop` 和 `resume`，启动从不重试执行。恢复请求没有会话回执时，先检查结果并停止以核对状态，再使用新的控制标识。
4. 恢复时一同保留任务记录和会话存储。不含控制字段的已有记录仍可读取，版本 2 的任务投影缓存从会话事件重建。依赖提交或控制回执的部署不要降级。权限、恢复与删除语义见[工作区任务](../../../genesis/tasks.zh.md)。
