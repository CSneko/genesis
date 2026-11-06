---
kind: upgrade-guide
description: "内部伙伴交流复用唯一持久 Session，不再每次交流都新建 Session。"
---

# 唯一持久伙伴会话

[English](guide.md) | 中文

## 变更

内部智能体伙伴交流共享唯一持久 Session，通过 `genesis_message` 发送的消息也一样。有历史消息的安装首次采用最近一次伙伴 Session，更早会话完整保留。旧工作区元数据保持原样。已发布的 Session 丢失或不可读时阻止互动，不创建替代会话。新会话使用插件的绝对路径 `cwd` 目录，加载工作区注册表时归入 AI 工作区。

## 迁移

1. 备份或移动 `DSH_HOME` 时，将 `genesis_companion` 存储及其引用的 Session 一起保留。新增的会话和投递表自动初始化，不替换已有伙伴身份。
2. 内置覆盖层将 `genesis-companion.config.cwd` 设为 `dshHomePath('companion-workspace')`。自定义配置可提供自己的绝对目录。已有 Session 保留原始头部，可通过设置中的来源链接打开。
3. 在设置中启用伙伴，再通过 `genesis_message(action="targets")` 发现其精确 `companion:` 目标。内部 `emitted` 回执表示完成连接写入，不表示 QQ 已投递或伙伴已读。同一条操作者输入内的重复请求复用回执，不得自动重试未知投递。
4. 再发起一次有界交流，核对重启后返回的 `sessionId` 保持一致。重试前先恢复丢失的 Session，不要删除会话绑定来绕过错误。睡眠和权限规则见[伙伴指南](../../../../packages/experimental/genesis-companion/README.zh.md)。
