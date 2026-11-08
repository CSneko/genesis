---
description: "Record mail notice source compatibility and verification limits."
kind: persistence-change
---

# 2026-11-07-genesis-mail-source

English | [中文](2026-11-07-genesis-mail-source.zh.md)

## Summary

Adds the `genesis-mail` notice source for attributed pending-mail notifications. Operator authentication and permissions belong to separate mailbox state; neither email text nor the source tag grants authority.

## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-07-genesis-mail-source
baseline: false
changes:
  - root: event:agent/inbox/spliced
    previous: 2026-11-06-genesis-companion-source
    after: e8e98bd3d98cd5b1cc8f914c99dfc37d0dd58dfc54d9629e768753d887582db4
    decision: same-version
  - root: event:developer/message
    previous: 2026-11-06-genesis-companion-source
    after: 4ce571140422803a4e0a0b2de45cf9efd2daf69e6409b357ff85b7da692bfb91
    decision: same-version
  - root: event:session/title-llm-request
    previous: 2026-11-06-genesis-companion-source
    after: 1b0f831b4e7f1b63ddfa63421cef0f68bcfd2ac743a7b25c9199bb479b46326c
    decision: same-version
  - root: event:user/message
    previous: 2026-11-06-genesis-companion-source
    after: 6cab952fca6003f488530e2687c549388220d8d14e55679cf599377e270389a4
    decision: same-version
```

## Compatibility

Existing sources retain their fields and meaning. The addition has a distinct kind, the existing notice form and a required summary; message sources are merge-extensible and readers preserve unknown sources through their default branches. New readers retain old records. Old readers can retain the new source data without implementing mailbox processing or granting operator authority. The Session format version is unchanged. The independent version-one `genesis_mail` domain validates records and uses a life initialization marker to refuse silent reconstruction after loss.

## Verification

The Loader smoke exercises real persisted notices, sleep backlog, deduplication, restart continuity, operator versus external tool authority, uncertain sends and damaged-state refusal; external mail and model calls are replaced. Automatic recording and history verification are blocked by existing historical schema files missing nodes. This record uses the current source extractor to emit a complete successor schema, leaves historical files unchanged and does not claim history verification passed.

## Dev Note

None.
