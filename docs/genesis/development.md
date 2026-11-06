# Genesis development

English | [中文](development.zh.md)

## Summary

Extend the life owner through sourced, atomic state changes; integrate new runtime facts through the adapter. Keep provider-specific execution and authorization outside the life core.

## DSH baseline

Genesis integrates DSH `0.2.2-rc.1` at [`fcc0ad46`](https://github.com/deepseek-ai/deepseek-harness/commit/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159). Git history retains upstream ancestry and the imported `0.2.1-rc.2` baseline for later merges. Genesis plugins, source-launch defaults and host adaptations remain local additions.

Custom compositions must follow the upstream [Node requirement](../upgrade-guide/v0.2.1-rc.2/node-24/guide.md), [tool executor configuration](../upgrade-guide/v0.2.1-rc.2/tool-executor-plugins/guide.md) and [Session projection registration](../upgrade-guide/v0.2.1-rc.2/session-projection-handles/guide.md). The workspace Life overlay selects native execution. Keep the same `DSH_HOME` to retain identity and memory; test upgrades against a separate copy and retain a matching pre-upgrade data backup for rollback. An older runtime must not write data already migrated by a newer runtime.

## Validate

```sh
node node_modules/typescript/bin/tsc -b packages/experimental/genesis --pretty false
node node_modules/typescript/bin/tsc -b packages/experimental/client-ui-genesis --pretty false
node node_modules/vitest/vitest.mjs run packages/experimental/genesis/tests packages/experimental/client-ui-genesis/tests
```

Tests allocate private temporary roots, exercise both JSON and SQLite, and load real Cordis configuration with the production Agent Loop and tool registry. Only model output is scripted; no real life history or credentials are required.

## Extend safely

New life facts need an actual producer, stable source key, JSON validation, source attribution and tests for duplicate delivery. Memory retrieval can be replaced independently of persistence. Keep ID/birth writes in initialization; application rename may change only the display name and update time.

Detect capabilities through actual scoped registration. A declaration hash change means the callable declaration changed; it does not establish a package version or learned skill. An installed disabled plugin is unknown to this adapter. Record successful/failed use from settled tool results.

## Diagnose storage

The supplied overlay uses `$DSH_HOME/storages/genesis.json` and `$DSH_HOME/genesis.writer.lock`. Stop the writer and back up the entire file before inspection or repair. After a crash, remove an abandoned lease only after confirming no process still addresses the data. Never delete life data to clear a startup error.

The supplied overlay keeps its writer lease at `$DSH_HOME/genesis.writer.lock`. Stop the writer and back up the entire home before recovery; [storage and recovery](data-model.md) describes the physical records. The kernel releases ownership when the process exits, including after a crash. Never remove or replace the lock file, and never delete life data to clear a startup error.

## Dev Note

None.
