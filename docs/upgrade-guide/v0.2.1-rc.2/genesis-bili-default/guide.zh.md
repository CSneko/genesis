---
kind: upgrade-guide
description: "源码工作区的默认 Genesis Web 启动包含 B 站集成，并要求 Node.js 24 或更新版本。"
---

# Genesis Web 包含 B 站读取

[English](guide.md) | 中文

## 变更

源码工作区的 Genesis Web 无需显式补丁参数即可加载 B 站集成。上游读取器要求 Node.js 24 或更新版本，因此 Node.js 22 无法运行此默认组合。已发布的 Harness profile 和工作区前置 `--no-genesis` 启动保留现有默认行为。工具仍须在 Life 模式学习；平台写入、定时取稿和上游人格学习保持关闭。

B 站观影札记与日记、随笔统一使用 `genesis_record`。`bili_humanism_journal` 被禁止执行，成功写作不再自动创建生命记忆。已有记忆与原始上游账本保持完整。自定义组合必须启用 Genesis 的 `records` 和 `personalDirectory`。

## 迁移

1. 使用 Node.js 24 或更新版本，并保持原有 `DSH_HOME` 以延续同一生命。通过 `pnpm dsh web` 重启；已有的显式 B 站补丁会自动去重。
2. 确认 `pnpm dsh --profile web --dump-config` 包含 `genesis-bili-humanism`。在 Life 对话中学习 `genesis_record`，并重新读取 `bili_humanism_guide`。新的观影札记会出现在统一记录界面，默认分类为 `viewing-notes`。
3. 在记录界面核对新的观影札记。移除过时的 `historyLimit` 和 `experienceChars` 配置；`recordTypeId` 和 `recordTypeName` 指定稳定分类与初始名称。详见[集成说明](../../../../packages/experimental/genesis-bili-humanism/README.zh.md)。
4. 若只停用 B 站，在后续补丁中为 `genesis-bili-humanism` 设置 `disabled: true`。需要普通 Harness Web 时使用 `pnpm dsh --no-genesis web`。
