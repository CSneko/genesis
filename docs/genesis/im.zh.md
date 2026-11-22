---
description: "为 Genesis 的 im 插件接入 Telegram 和 Matrix 文本对话。"
---

# Genesis 即时通讯

[English](im.md) | 中文

## 概要

打开**插件 → Genesis → im**，配置 [OneBot QQ](qq.zh.md) 并查看 Telegram 和 Matrix 状态。新渠道使用同一 Genesis 生命名称和 profile 的对话模型，按平台账号和会话分别保存历史。Telegram 话题也分别保存历史。

## 目录

[连接](#connect) · [回复与恢复](#replies-and-recovery)

<a id="connect"></a>
## 连接

运行 `pnpm dsh web` 并完成[首次唤醒](awakening.zh.md)，然后在**插件 → Genesis** 启用 **im**。打开其**设置**，各渠道标题旁有启用按钮。

1. 展开渠道的连接设置并填写两份允许名单。Telegram 使用数字会话 ID 和用户 ID。Matrix 使用以 `!` 开头的房间 ID 和以 `@` 开头的完整用户 ID。用逗号或空格分隔多项。入站消息须同时符合两份名单。
2. Matrix 需填写服务器来源地址，例如 `https://matrix.example.org`。本机也可使用 HTTP 回环地址。点击**保存并应用**，再在对应渠道标题旁点击**启用 Telegram**或**启用 Matrix**。
3. 保存 BotFather 颁发的 Telegram 机器人令牌，或已加入允许房间的 Matrix 账号访问令牌。每个 Telegram 机器人只运行一个轮询实例，并须关闭 Webhook。令牌存入 Harness 凭据库，保存后界面隐藏其值。

设置立即应用，重启后自动恢复。刷新面板查看最新状态，再从允许的账号向允许的会话发送纯文本。Telegram 群消息须满足平台隐私设置才能到达机器人。Matrix 首次同步只建立游标，之后回复新收取的普通文本，跳过加密消息、编辑、引用回复和线程消息。

已有部署设置作为各渠道第一次在界面保存前的默认值。凭据库没有令牌时，仍可读取进程环境提供的令牌。更改 Matrix 服务器地址前，请先移除当前令牌。若令牌来自进程环境，请在启动环境中清除后重启，再修改地址。

<a id="replies-and-recovery"></a>
## 回复与恢复

Telegram 和 Matrix 回复原会话，Telegram 话题回复留在原话题。输入和回复写入 Session 日志。各渠道从已保存的游标恢复，跳过已经记录的输入。Genesis 睡眠期间暂停轮询。两种文本对话均不可执行工具、检索私人生命记忆、传输媒体或主动发信。QQ 使用其既有功能和权限。

发送失败会停止该渠道，宿主日志会报告发送结果可能不确定。重新应用设置或发送新消息前请查看原对话，已进入 Session 的输入会被跳过。Matrix 返回受限时间线时，宿主日志会报告消息缺口。在渠道标题旁点击**关闭 Telegram**或**关闭 Matrix**可停止轮询，按常规流程删除 Session 可移除本地对话记录。
