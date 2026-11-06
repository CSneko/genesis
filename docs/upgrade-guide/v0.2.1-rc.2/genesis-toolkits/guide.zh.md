---
kind: upgrade-guide
description: "Genesis 唤醒模式下，已学会的浏览器与桌面工具需要在各对话中启用工具包。"
---

# Genesis 工具包

[English](guide.md) | 中文

## 变更

Genesis 唤醒模式中，已学会的浏览器和桌面工具此前自动进入每个新对话。默认“电脑操作”工具包现在会隐藏它们，直到 AI 通过 `genesis_toolkit` 启用该包。没有已学会成员的包不会出现在角色上下文。学习记录和已有权限保持不变，普通 Harness 任务预设不受影响。

即使已有工具包广泛开放浏览器权限，普通 QQ 发言者也仅能使用四种 Playwright 浏览操作。执行脚本、填写表单、传输文件和管理标签页要求已鉴权操作者及原有权限。QQ 浏览拒绝非 HTTP(S) 导航、地址中的内嵌凭据和输出文件名。新目录包含公开的 `browser-reading` 工具包，已保存目录保持原样。浏览器页面和登录状态仍按提供方管理，包括工作区共享的持久资料目录。

已绑定操作者的 QQ 私聊现在使用 Web 工具权限，包括禁用 QQ 访问的工具包。群聊和其他人的私聊仍受 QQ 受众限制。发言者或权限变化导致执行被拒绝时，已注册声明仍保持注入；主动关闭工具包会移除声明，成功压缩会清理未用声明。需要已清理的成员时，重新启用工具包。

## 迁移

1. 重建 Host 与浏览器产物后，通过受支持的工作区入口 `pnpm dsh web --test-no-login` 或已有启用 Genesis 的 `dsh` 配置启动。
2. 打开设置 → 工具包，检查名称、说明和成员规则。已保存编辑覆盖 Genesis 插件的 `toolkits` 默认值；保存空目录可让所有已学工具留在包外。移除包会释放其成员，除非其他包仍收纳该工具。
3. 在生命对话中，让 AI 按需启用“电脑操作”。下一次请求只包含当前可用且已学会的成员，未学会的名称仍需要 `learn`。新对话默认关闭，重新打开同一对话会恢复已记录的启用状态。
4. 确认新对话不包含成员 schema，启用工具包后展示已学会成员。限制、修订冲突与独立偏好存储见[工具包行为](../../../../packages/experimental/genesis/README.zh.md#toolkits)。
5. 已有 QQ 目录若允许向 QQ 展示共享浏览器状态，可添加 `qqAccess: anyone` 的包，仅包含 `mcp__playwright-mcp__browser_navigate`、`mcp__playwright-mcp__browser_snapshot`、`mcp__playwright-mcp__browser_take_screenshot` 和 `mcp__playwright-mcp__browser_wait_for`。确认非操作者学会并启用后能浏览，但脚本调用和指定截图文件名被拒绝。私密浏览器状态应保持在 QQ 权限之外，详见 [QQ 权限](../../../genesis/qq.zh.md#qq-toolkit-permissions)。
