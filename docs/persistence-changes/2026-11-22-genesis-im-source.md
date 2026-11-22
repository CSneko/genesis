---
description: "Records the Session message source used by Genesis IM."
kind: persistence-change
---

# 2026-11-22-genesis-im-source

English | [中文](2026-11-22-genesis-im-source.zh.md)

## Summary

Adds the `genesis-im` notice source for authenticated Telegram and Matrix text. The same recorded source union includes the existing `genesis-weather` notice.

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-22-genesis-im-source
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-11-07-genesis-mail-source"
    after: "7e0307a8388cb0ccca217178b0ef8307e68c8e401c619f7ba4928b8aef21d704"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-11-07-genesis-mail-source"
    after: "3d7ebe7e1d4d2e7826995e951ee8a0391fd02fcca8996ae3588415fa09a6ae9a"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-11-07-genesis-mail-source"
    after: "0c4775523e1f03189b6cf706858869296754ac81def45aef93c13332a99390b9"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-11-07-genesis-mail-source"
    after: "c1ded783307d8a80b936f890b75a244d8e78e6a94e8d85bf95e72a747ec4bc50"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Readers preserve unrecognized message source kinds. Existing sources retain their meaning, and the IM source records platform attribution without granting operator authority. The current Session writer version remains unchanged.

<a id="verification"></a>
## Verification

Two Loader smoke cases exercised Telegram and Matrix session recovery, duplicate suppression after an uncertain send, and the existing QQ recovery path. The history-wide generator stops at legacy Genesis snapshots that lack the shared node table. The source extractor produced and validated this successor snapshot against the previous recorded roots.

## Dev Note

None.
