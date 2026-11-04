---
kind: upgrade-guide
description: "Genesis 分页生命清单需要匹配读取器，并以单记录限制替代历史总量预算。"
---

# Genesis 分页生命存储

[English](guide.md) | 中文

## 变更

Genesis 写入 `genesis-tree-v2` 提交清单及不可变 `indexes` 索引页。记忆版本从分组的 `memory_history` 组件转为独立的 `memory_revisions` 组件。既有完整快照及 `genesis-split-v1` 清单在下次成功启动时迁移，保留生命身份、诞生时间、来源 ID、历史顺序和记忆版本。旧读取器拒绝新清单；降级需要完整的升级前恢复副本。

历史总量不再消耗 `maxRecords` 或 `maxStateChars`；这些设置保留其他目录及记忆回退行为。`storage.pageSize` 默认将每个索引页／根清单限制为 256 条引用。`storage.maxRecordChars` 默认限制单个编码组件／根清单为 2,000,000 字符。模型上下文限制不变。启动和快照仍加载完整生命，硬件资源仍是限制因素。参见[存储与恢复](../../../genesis/data-model.zh.md#一致性与恢复)。

## 迁移

1. 停止 Host。保留 `genesis` 与 `genesis_records` Storage Domain 数据，以及独立备份清单和整个 `.d` 目录。另存匹配的旧运行时与配置，以便回滚。
2. 保持相同 `DSH_HOME`、存储路由和租约路径。在源码工作区通过 `pnpm dsh web` 启动；转换及独立备份完成后才恢复普通生命操作。不要删除写入锁文件强行启动。
3. 确认生命身份、记忆内容及来源历史不变。`states/life` 描述改用 `genesis-tree-v2`；JSON 存储的索引页位于 `storages/genesis_records/indexes/`。
4. 单个组件超限时，在 Genesis 插件覆盖层明确调高 `storage.maxRecordChars` 并重启。页面缺失／损坏或 I/O 结果未知会停止依赖操作；应一起恢复已验证主存储及备份，不创建空生命。
5. 降级前停止 Host，恢复完整且匹配的升级前数据及运行时。不要删除索引页或移除清单判别字段。
