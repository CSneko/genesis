---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-04-genesis-people-source

English | [中文](2026-11-04-genesis-people-source.zh.md)

## Summary

Adds the genesis-person message source for authenticated QQ participants and source-restricted Genesis conversations.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-04-genesis-people-source
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-11-02-genesis-minecraft"
    after: "f89b687af4c81798be17b5ec5a9a997a3fa4b58d89ed169e183e986cd79593a9"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-11-02-genesis-minecraft"
    after: "beb0fa92bb10b6a3e378e24d5c0727dd335f56cc48f07fa01078bbb3d1ce13c7"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-11-02-genesis-minecraft"
    after: "9e3a6eaa0e30f3a7897e206b9f57c6d9bd3d2286a85162928c335c9b28314593"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-11-02-genesis-minecraft"
    after: "5cfddc3d139ede23e62371656068aebd8b3ebe1d12f11b5ed4e6a6d472fdf866"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The new source uses its own kind discriminator. Generic source readers retain attributed message content without granting user or operator authority; plugin-specific appraisal requires the matching registered source. Existing sources and Session envelopes remain unchanged, so the Session format generation is retained. Genesis separately accepts absent people state and preserves life identity; older strict Genesis life readers reject the new optional version-1 projection, requiring a complete pre-upgrade backup for downgrade.

<a id="verification"></a>
## Verification

Twenty focused Loader, people, emotion and real WebSocket transport tests passed with a scripted model, including scoped recall, authenticated source replay, partial/uncertain receipts, malformed frame refusal and stable life/conversation restart. The affected package TypeScript build passed. A live SnowLuma login was verified through get_login_info; real operator private and mentioned group messages produced separate durable Sessions and two confirmed OneBot receipts with message IDs. The original life ID and birth timestamp matched the pre-restart backup. Model quality and broader QQ features are not established by these checks.

<a id="dev-note"></a>
## Dev Note

None.
