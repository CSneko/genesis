---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-31-genesis-planning-source

English | [中文](2026-10-31-genesis-planning-source.zh.md)

## Summary

Adds attributed Genesis main-model planning opportunities to existing message envelopes.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-31-genesis-planning-source
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-28-genesis-task-source"
    after: "9f3ab45cdec3f1a60e641d7a93823545f5f4564bb59c92fba95860c64a2ecdbc"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-28-genesis-task-source"
    after: "eafdba86e8d25adca64ef4cefab6bae549c6cb7054a30537d94d1fea645345db"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-28-genesis-task-source"
    after: "9284455404fa6c94b589b9fbc1b590d74cde30f3602ce53dc731b0b287501c0c"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-28-genesis-task-source"
    after: "083d2acf63855c2d3adc734b0838ce9804a2ea6c0a72508efcdb02b31bf3b021"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing source kinds and fields are unchanged. The new genesis-planning kind is attribution on existing user, developer, inbox and title-request envelopes; generic readers preserve unknown source kinds and their content without treating them as user authority or execution permission. Genesis plans use the existing versioned life store; readable IDs broaden its accepted values and existing UUID IDs remain valid. No Session writer version changes.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/experimental/genesis/tests/agency.spec.ts packages/experimental/genesis/tests/integration.spec.ts -t 'persists sourced motivations|pauses, resumes|rejects completion text|keeps multiple life goals|records operator goal|main Life model|loads planning without|defaults to logged goal context|delivers one proactive choice|shares sourced personality': 10 passed, 62 skipped. pnpm exec tsc -b packages/experimental/genesis/tsconfig.json: passed.

<a id="dev-note"></a>
## Dev Note

None.
