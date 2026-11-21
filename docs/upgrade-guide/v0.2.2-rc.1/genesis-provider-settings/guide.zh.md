---
kind: upgrade-guide
description: "Genesis Web 和 Desktop 将模型供应商设置从各自的 profile patch 移到同一份共享文档。"
---

# Genesis provider settings

[English](guide.md) | 中文

## 变更

Genesis Web 和 Desktop 现在将模型供应商及模型列表保存到 `$DSH_HOME/genesis-models.patch.yml`。首次启动时，会从两端旧有的 profile patch 导入已有供应商配置。迁移保留各端独有的供应商，两端都有的供应商使用 Web 的配置。原 patch 保留旧值供查阅。

## 迁移

1. 停止旧版 Genesis，用同一个 `DSH_HOME` 启动升级后的 Web 或 Desktop。打开 **设置 → 模型**确认已有供应商和模型列表。凭证引用继续使用原有凭证库。
2. 在任一应用编辑供应商设置。手动编辑时，将 `llm-pi-ai`、`llm-deepseek` 和 `llm-deepseek-account` 的改动放到共享文档。这些条目从共享文档读取可编辑配置。显式 home patch 或命令行覆盖仍然优先。
