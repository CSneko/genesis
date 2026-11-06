# Genesis development

[English](development.md) | 中文

## 概要

通过带来源的原子状态变更扩展生命核心，通过适配层接入新的运行事实。具体模型执行与授权保持在生命核心之外。

## DSH 基线

Genesis 集成 DSH `0.2.2-rc.1`，对应提交 [`fcc0ad46`](https://github.com/deepseek-ai/deepseek-harness/commit/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159)。Git 历史保留上游祖先关系和导入时的 `0.2.1-rc.2` 基线，供后续合并使用。Genesis 插件、源码启动默认值和宿主适配仍是本地扩展。

自定义组合须遵循上游的 [Node 要求](../upgrade-guide/v0.2.1-rc.2/node-24/guide.zh.md)、[工具执行器配置](../upgrade-guide/v0.2.1-rc.2/tool-executor-plugins/guide.zh.md)和 [Session 投影注册](../upgrade-guide/v0.2.1-rc.2/session-projection-handles/guide.zh.md)。工作区 Life 叠加配置选择原生执行。保留相同的 `DSH_HOME` 才能延续身份与记忆；先在单独的数据副本上验证升级，并保留配套的升级前数据备份供回退。旧运行时不得写入已被新运行时迁移的数据。

## 验证

```sh
node node_modules/typescript/bin/tsc -b packages/experimental/genesis --pretty false
node node_modules/typescript/bin/tsc -b packages/experimental/client-ui-genesis --pretty false
node node_modules/vitest/vitest.mjs run packages/experimental/genesis/tests packages/experimental/client-ui-genesis/tests
```

测试分配独立临时目录，覆盖 JSON 和 SQLite，并通过真实 Cordis 配置加载生产 Agent Loop 与工具注册表。仅模型输出使用脚本替身，无需真实生命历史或凭据。

## 安全扩展

新增生命事实需要真实生产方、稳定来源键、JSON 校验、来源归属与重复投递测试。记忆检索可以独立于持久化替换。ID 和诞生时间只由初始化写入，应用重命名只能修改显示名称与更新时间。

通过真实作用域注册检测能力。声明摘要变化只表示可调用声明发生变化，不代表包版本变化或技能习得。该适配器无法知道已安装但禁用的插件。使用结果只从已结算工具结果记录。

## 存储诊断

提供的补丁使用 `$DSH_HOME/storages/genesis.json` 与 `$DSH_HOME/genesis.writer.lock`。检查或修复前停止写入方并备份完整文件。崩溃后必须确认没有进程访问数据，才能移除遗留锁；绝不通过删除生命数据来消除启动错误。

叠加配置将写入租约保存在 `$DSH_HOME/genesis.writer.lock`。恢复前先停止写入进程并备份整个主目录；物理记录布局见[存储与恢复](data-model.zh.md)。内核会在进程退出时释放锁，包括崩溃退出。不得删除或替换锁文件，也不得通过删除生命数据清除启动错误。

## 开发说明

无。
