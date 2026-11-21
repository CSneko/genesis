---
kind: upgrade-guide
description: "Genesis Web and Desktop move model provider settings from individual profile patches into one shared document."
---

# Genesis provider settings

English | [中文](guide.zh.md)

## Change

Genesis Web and Desktop now save model providers and model lists under `$DSH_HOME/genesis-models.patch.yml`. Existing provider overrides in the two profile patches seed the shared document on first start. The migration keeps providers unique to either profile and uses the Web configuration for a provider configured in both. The original patches retain the old values for reference.

## Migration

1. Stop the older Genesis runtime and start the upgraded Web or Desktop with the same `DSH_HOME`. Open **Settings → Models** to confirm your existing providers and model lists. Credential references continue to use the existing credential store.
2. Edit provider settings in either application. For manual edits, move changes for `llm-pi-ai`, `llm-deepseek`, and `llm-deepseek-account` to the shared document. Those entries take their editable config from the shared document, and explicit home or command-line overrides still take precedence.
