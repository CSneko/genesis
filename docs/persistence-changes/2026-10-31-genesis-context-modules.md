---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-31-genesis-context-modules

English | [中文](2026-10-31-genesis-context-modules.zh.md)

## Summary

Adds attributed Genesis module snapshots to existing message envelopes.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-31-genesis-context-modules
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-31-genesis-planning-source"
    after: "f6aa3ded7c8b30d3e3c119d8542405d2a57ddea08282e0db7c718b3a5e2439ab"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-31-genesis-planning-source"
    after: "41672530e06e69dba1484482f44f67805b93761caee7017f891a843d986030e7"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-31-genesis-planning-source"
    after: "234314bfd49ab962c66a524079f51a9231d44eddb28f46f97dac8d22e6caa0dc"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-31-genesis-planning-source"
    after: "51a0b6b7679b03776c735db5ad21036ccc0442e8100645fec6d12ed36ed563d4"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing source kinds and fields remain unchanged. The new genesis-state kind carries the existing snapshot form with named sections. Each listed module replaces only that module; empty section text explicitly clears it. New code restores earlier logs by sending current modules once, without rewriting historical combined runtime snapshots. Generic older readers preserve unknown source kinds and ordinary message content; they do not interpret this attribution as operator authority or execution permission. No Session writer version changes.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/experimental/genesis/tests/emotion.spec.ts packages/experimental/genesis/tests/context-update.spec.ts packages/experimental/genesis/tests/integration.spec.ts -t 'degree|module|injects plain memory lines|records real tool addition|restores a life across': 9 passed, 75 skipped. pnpm exec vitest run packages/experimental/genesis/tests/context-update.spec.ts -t 'upgrading a conversation': 1 passed, 1 skipped. pnpm exec tsc -b packages/experimental/genesis/tsconfig.json: passed.

<a id="dev-note"></a>
## Dev Note

None.
