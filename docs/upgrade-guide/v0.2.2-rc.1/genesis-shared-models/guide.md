---
kind: upgrade-guide
description: "Genesis adds inherited model routes and optional embeddings; Minecraft inheritance selects the complete shared decision model."
---

# Genesis shared model configuration

## Change

Fresh Life profiles use the current DSH default model for memory writing and temporary summaries. Existing saved custom routes remain explicit. Embeddings are optional: disabled or wholly unconfigured deployments use bounded text retrieval while preserving source references. A partial embedding configuration still fails visibly.

Minecraft inheritance now selects the knowledge decision model itself rather than only its endpoint and credentials. Fresh settings disable vision. Shared provider and OpenAI-compatible routes support text-only judgments; image judgments require a compatible Jev route.

Saved inheritance flags and disabled embedding settings extend Genesis preference data. Older versions can reject these settings; this change does not provide downgrade support. Identity and life history are retained.

Local deployment replaces the Qwen GGUF and llama.cpp installer. `localDecision.modelUrl` and `modelSha256` now identify an Ollaya manifest; runtime URLs and checksums identify Ollaya archives. `binary` must be Ollaya, and `model` is a lowercase alphanumeric alias with optional hyphens. The llama.cpp-only `contextTokens`, `probeMaxTokens` and Windows ARM64 runtime fields are removed.

## Migration

1. Open Settings → Knowledge Base. Enable Use the current DSH LLM to replace a previously dedicated writer, or retain its custom settings. In temporary memory settings, enable Use the shared memory LLM to follow that writer dynamically.
2. Leave the embedding model disabled for text retrieval, or retain your existing endpoint. Choose cloud configuration or explicitly deploy the managed local decision model. Local deployment uses Laya multilingual and Ollaya through `/v1/systemone`. Automatic runtime installation supports Linux x64 and Windows x64; other hosts require an Ollaya `localDecision.binary`. Linux needs `tar` with Zstandard support; Windows needs built-in `tar` and the matching Microsoft Visual C++ Redistributable.
3. If you overrode local deployment fields, remove the Qwen/llama.cpp overrides to use the new defaults, and remove the retired fields. Stop the old local deployment and click local quick deployment to install the new assets; an existing selected deployment reports missing assets until installed. Old GGUF/runtime archives are unused; uninstalling local deployment removes these managed files without touching life data.
4. Review Minecraft settings. To retain a model different from the knowledge decision model, disable inheritance and configure the dedicated Jev route. Disable vision when using a text-only route.
5. Restart with the same `DSH_HOME`. Confirm the same life identity, effective models and existing memories. Back up the Genesis preference domains and credential store before attempting a downgrade. See [model configuration](../../../genesis/memory.md) for deployment and recovery limits.
