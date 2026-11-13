---
kind: upgrade-guide
description: "Genesis 主动认知移除三项执行上限，并将预算编辑器改为百万 token 单位。"
---

# 主动认知预算

[English](guide.md) | 中文

## 变更

主动认知移除 `requestTokens`、`maxRequests` 和 `maxToolCalls`。总输出预算默认为 50,000,000 token（50M），`maxOutputTokens` 接受不超过 9,007,199,254,740,991 的正安全整数。念头编辑器使用 M token，配置和设置接口继续使用原始 token。已有保存预算保持原额度。旧存储控制项在加载时迁移，下次写入时移除三个旧字段。当前设置接口拒绝这些字段。旧运行时不一定能读取迁移后的控制项或超过旧上限的预算；降级前保留匹配备份。

## 迁移

1. 从 Genesis `cordis.yml` 补丁的 `spontaneity` 配置段及设置接口请求对象中移除 `requestTokens`、`maxRequests` 和 `maxToolCalls`。这些配置字段不再生效。
2. 打开 Genesis → 念头，将输出预算设为 `50`，即 50M token，也可输入更大的值。已有显式预算会保留；没有保存值或配置覆盖时才采用新默认值。在配置或接口请求中，使用 `maxOutputTokens: 50000000` 表示相同额度。
3. 保存、刷新并重启，确认显示额度保留。主模型请求使用路由或服务的输出限制；两者均未声明时使用剩余总预算。输出预留仍包含辅助调用和重试，且不退回未用额度。整次机会期限、每日次数、授权和停止控制继续有效。参见[预算说明](../../../genesis/spontaneity.zh.md)。
