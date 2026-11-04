---
kind: upgrade-guide
description: "Genesis QQ adds an independent cross-conversation delivery journal and original-text Session records."
---

# Genesis QQ cross-conversation messaging

English | [中文](guide.zh.md)

## Change

QQ adds operator-only `genesis_message` and separate `outboundGroups`/`outboundUsers`, both empty by default. Existing incoming policy does not authorize outbound targets. The independent version-1 `genesis_qq_messages` domain retains content hashes and delivery acknowledgements under the existing life writer lease. New ignorable `plugin:genesis-qq/message` records preserve exact original text and delivery plans in the affected Sessions; existing Session discriminators and the format generation remain unchanged. Old original messages without these records cannot be forwarded verbatim by this tool.

Restart and repeated calls do not resend uncertain reservations. Target Sessions receive delivery history without a new model turn. This feature does not wait for replies or relay them back automatically.

## Migration

1. Keep the same life, `DSH_HOME` and original Sessions. Add intended QQ accounts to the QQ plugin's `outboundGroups` and `outboundUsers` using the [configuration example](../../../genesis/qq.md#cross-conversation-messages), then restart through `pnpm dsh web --patch <file>`.
2. From the bound operator's QQ account, ask for available message targets and send a short test text to one. Check the returned delivery ID and confirmed acknowledgement; the target need not have sent an earlier message.
3. For verbatim forwarding, select an operator-authored pure-text message received after this upgrade within the most recent `historyLimit` original messages, or resend the text first. The sender header is additional attribution; the body remains unchanged.
4. Preserve the receipt domain with source and target Sessions in backups and recovery. Do not delete its reservations independently or replay old send commands after removing the journal. A downgrade may retain the independent domain and ignorable records, but cannot inspect these deliveries; stop the writer before changing runtimes and inspect uncertain sends before issuing a new request.
