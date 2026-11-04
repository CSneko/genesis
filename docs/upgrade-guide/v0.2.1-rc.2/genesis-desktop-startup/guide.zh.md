---
kind: upgrade-guide
description: "Genesis 启动时连接桌面共享，并跨聊天复用持久授权。"
---

# Genesis 桌面启动连接与浏览器预览帧率

[English](guide.md) | 中文

## 变更

Genesis 工作区 Web 启动器在启动时连接桌面共享，不再等待聊天调用 `computer.connect`。配置的部署跨聊天共享授权，Agent 释放时保留连接。首次启动请求系统授权；后续启动使用私密、轮换的 portal 令牌请求恢复。要求 RemoteDesktop portal 版本 2 并支持持久授权。普通 Harness 组合默认仍使用手动连接。

通过 localhost、回环或私有服务器 IP 访问时，浏览器预览目标为 30 FPS；其他地址为 2 FPS。截图耗时可能降低实际帧率。`preview.intervalMs` 的远程查看默认值为 500 ms；`preview.localIntervalMs` 单独控制本地查看。

## 迁移

1. 继续通过 `pnpm dsh` 启动 Genesis。完成首次 GNOME 共享对话框；不支持持久授权，或保存的令牌无法读取、更新时，启动会明确失败。发送输入前确认 `computer` 状态为已连接。
2. 如需保留按聊天手动连接，在[电脑覆盖层](../../../../config/genesis-computer.patch.yml)设置 `autoConnect: false`。设置 `GENESIS_COMPUTER_USE=0` 可禁用提供方。保持 `restoreTokenPath` 私密；须先停止 DSH，再删除令牌文件以重置保存的授权。GNOME 停止共享与权限控制始终有效。
3. 如需明确固定采样周期，在 Playwright 提供方同时设置 `preview.intervalMs` 和 `preview.localIntervalMs`。除 localhost 外的域名即使解析为私有 IP，也使用远程帧率。部署时须一起重建 Host 与 Client 产物，以更新预览远程方法。
