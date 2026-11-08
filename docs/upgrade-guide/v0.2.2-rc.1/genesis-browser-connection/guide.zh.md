---
kind: upgrade-guide
description: "Genesis 源码工作区 Web 使用外部 Chrome 连接，替代共享的托管浏览器。"
---

# Genesis 浏览器连接

[English](guide.md) | 中文

## 变更

Genesis 源码工作区 Web 在可编辑 profile 配置之下启用浏览器组合包，连接独立运行的服务器 Chrome，默认地址为 `http://127.0.0.1:9222`。DSH 不再启动默认浏览器。所有会话共享串行连接与浏览器状态，内置浏览器预览不再提供。原有 `config/genesis-browser.patch.yml` 工作区覆盖层和默认对 `GENESIS_BROWSER_EXECUTABLE` 的使用已移除。包的根插件仍支持显式配置 launch、attach 和 persistent 模式。

## 迁移

1. 删除对已移除工作区覆盖层的显式引用。按[服务器配置](../../../genesis/README.zh.md#浏览器操作)启动专用 Chrome，再新建或恢复需要浏览器的会话。它使用独立配置目录；原有 `$DSH_HOME/browser/playwright` 数据保留，不自动导入。
2. 使用 `pnpm dsh web` 重启。工作区将浏览器组合包加入 Genesis Web profile，不替换用户设置。
3. 检查“设置 → 浏览器”，在此保存服务器侧调试地址；重启 Genesis，让共享提供方连接新地址。仅保存不代表连接成功。停止 DSH 会保留独立运行的 Chrome。
