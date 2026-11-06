---
kind: upgrade-guide
description: "Default source-workspace Genesis Web launches include the Bilibili integration and require Node.js 24 or newer."
---

# Genesis Web includes Bilibili reading

English | [中文](guide.zh.md)

## Change

Source-workspace Genesis Web includes the Bilibili integration without an explicit patch argument. Its upstream reader requires Node.js 24 or newer, so Node.js 22 cannot run this default composition. Published Harness profiles and the workspace's leading `--no-genesis` launch retain their existing defaults. Tools still require Life-mode learning; platform writes, scheduled fetching and upstream personality learning remain disabled.

Bilibili viewing notes use `genesis_record` alongside diaries and essays. `bili_humanism_journal` is denied, and successful writing no longer automatically creates life memories. Existing memories and the original upstream ledger remain intact. Custom compositions must enable Genesis `records` and `personalDirectory`.

## Migration

1. Use Node.js 24 or newer and keep the existing `DSH_HOME` to preserve the same life. Restart with `pnpm dsh web`; an existing explicit copy of the Bilibili patch is deduplicated.
2. Confirm that `pnpm dsh --profile web --dump-config` contains `genesis-bili-humanism`. Learn `genesis_record` and reread `bili_humanism_guide` in a Life conversation. New viewing notes appear under the shared records interface, in `viewing-notes` by default.
3. Confirm the new viewing notes in the records interface. Remove obsolete `historyLimit` and `experienceChars` settings; `recordTypeId` and `recordTypeName` select the stable category and its initial label. See the [integration instructions](../../../../packages/experimental/genesis-bili-humanism/README.md).
4. To disable only Bilibili, apply a later patch setting `disabled: true` on `genesis-bili-humanism`. Use `pnpm dsh --no-genesis web` for ordinary Harness Web.
