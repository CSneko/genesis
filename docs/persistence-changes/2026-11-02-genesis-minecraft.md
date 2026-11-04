---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-02-genesis-minecraft

English | [中文](2026-11-02-genesis-minecraft.zh.md)

## Summary

Adds independent Minecraft settings and one-time toolkit setup records, attributed game observations, auxiliary Jev audit records and connection-local short-task transition records.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-02-genesis-minecraft
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-31-genesis-context-modules"
    after: "47a6c8ae8646f4d93f844863e1923a26c84d623333fb92b952dbedfda0695f2a"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-31-genesis-context-modules"
    after: "4a0bb89889aad437fa837c64a63b1834c69883624ae871d60a69ce89d52a5810"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-31-genesis-context-modules"
    after: "725d58ebb75cb9be7ec2ed88c5c8c4848f93854cbb4aff0e3c722fb80c6f5d66"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-31-genesis-context-modules"
    after: "0069ac69f185138ed06a32fbaf691d89ed2060879e06ea574d64d77f9090e969"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing Genesis life and Session data remain unchanged. New settings start in an independent version-1 domain; invalid records fail loading. The new message source has its own discriminator and carries no user authority. Older readers retain unknown sources as attributed data and ignore plugin audit records; replay never reconnects or executes game actions. New readers accept older Sessions with none of these records. Failed Jev audit records may include an optional nonsecret reason; older records without it remain readable.

<a id="verification"></a>
## Verification

Focused Loader and settings-component checks passed, including game-only conversations, chat during inference, waiting skills, matched mining and guarded short-task execution. A regression reproduces a failed monitor followed by task submission, verifies immediate dispatch with top-level image references, and checks terminal failure reporting. A live offline Java server smoke verified first-person capture and private chat. Minimal real requests to the configured Span-02 route returned HTTP 400 for nested image references and HTTP 200 for top-level references; this does not validate gameplay judgment quality.

<a id="dev-note"></a>
## Dev Note

None.
