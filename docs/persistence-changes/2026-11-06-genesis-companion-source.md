---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-06-genesis-companion-source

English | [中文](2026-11-06-genesis-companion-source.zh.md)

## Summary

Adds the genesis-companion notice source for bounded internal partner exchanges.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-06-genesis-companion-source
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-11-04-genesis-people-source"
    after: "d6f1e9f720ca8aa3a0b0e510e0bc0963d29a31f5a3e9455e4422da84c72fd8a8"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-11-04-genesis-people-source"
    after: "abc3983f41dbf2fac33c63bb37b49a33c5a8908526a960a2cf13f31aa32659e6"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-11-04-genesis-people-source"
    after: "badab0de0ccf93a73c9e1a4f5650df0f153ea1dbf6450ce6e28747c52f54a645"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-11-04-genesis-people-source"
    after: "9b6b7d03c038989135cc5fe863af26b1cd47e01d1ce182527bc6f2ac550a24f2"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The addition preserves existing message sources and their meaning. Source kinds are merge-extensible and readers fall through unknown kinds; the new source has the existing notice form and required summary. It carries no operator authority. Session format stays at the current version. Internal partner receipts use ignorable plugin records and their independent versioned storage domain.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/experimental/genesis-companion/tests/integration.spec.ts: one Loader smoke passed, including stored Session reads, restart identity/relationship continuity, duplicate action receipts, sleep admission and rejection of reopened user turns. pnpm exec tsc -b packages/experimental/genesis-companion packages/experimental/client-ui-genesis completed.

<a id="dev-note"></a>
## Dev Note

None.
