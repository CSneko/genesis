---
kind: upgrade-guide
description: "Genesis 生命覆盖层可清理到期的普通记忆，较早的运行时可能拒绝含三档摘要或新时间字段的生命数据。"
---

# Genesis 记忆保留

[English](guide.md) | 中文

## 变更

生命覆盖层启用普通陈述性记忆的到期清理，首次启用时给已有记忆新的保留期。生命数据可包含三档摘要和实质修订的时间字段。较早的严格读取器可能拒绝含新字段的记录。

## 迁移

1. 如果以后仍需运行较早版本，升级前保留一份已验证的生命数据副本。为较早版本使用这份副本。
2. 重启现有受支持的 Genesis profile。若要长期保留普通记忆，请在重启前将覆盖层中的 `genesis.config.memoryDynamics.forgetting` 设为 `false`。
3. 打开一段新会话并回忆已有记忆。可在“记忆”中检查条目或重新生成摘要。豁免情形和 Session 历史的处理见[记忆指南](../../../genesis/memory.zh.md)。
