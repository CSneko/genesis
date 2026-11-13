---
kind: upgrade-guide
description: "Genesis 可选能力采用已保存的插件选择，其设置移至 Genesis 插件分区。"
---

# 选择 Genesis 可选插件

[English](guide.md) | 中文

## 变更

源码工作区的 `pnpm dsh web` 启动器不再每次强制加载 QQ、Minecraft 或 companion 补丁，也不再在关闭后重新加入邮件和钱包。新配置默认启用天气、语音、MCP 和浏览器，QQ、邮件、Minecraft、钱包及 companion 默认关闭。首次初始化默认值时保留已有的插件选择，之后重启保留可选能力的选择。MCP 属于工作区内置组合，缺少时会重新加入所选组合包。Genesis 核心功能保持启用，不逐个显示插件卡片。

可选能力设置从设置页移至“插件 → Genesis”。MCP 管理保留在“设置 → MCP 服务”，并自动维护只读服务工具包。性与亲密也在此配置；仅启用时在“Genesis → 情绪”显示性欲和吸引读数，采用粉色进度条。Genesis 专属包声明作者为 @CSNeko，npm 包名保持不变。

## 迁移

1. 使用原有 `DSH_HOME` 通过 `pnpm dsh web` 启动。在“插件 → Genesis”明确启用此前仅由启动器默认加载的 QQ、Minecraft 或 companion 集成，并在此分区配置可选连接。
2. 如果希望通过插件开关控制加载，请移除命令行中明确提供的可选插件补丁；明确指定的补丁仍然优先。
3. 重启相同配置，确认启用和关闭状态均保留。配置目录的 `package.json` 在 `dsh.profile.bundles` 中保存选择，并记录一次性标记 `genesisProfileDefaults: 1`，请保留该标记。不会删除生命记录或连接凭据。
4. 在“插件 → Genesis → 天气”填写城市后才会自动提供天气上下文。已有明确保存的天气设置仍优先于组合默认值。
