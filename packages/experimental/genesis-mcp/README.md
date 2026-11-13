---
description: "Add custom MCP services and install supported public catalog entries from Genesis settings."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-mcp

English | [中文](README.zh.md)

## Summary

Open **Settings → MCP services** to browse the official MCP Registry, open a service and click **Install**. Fill in required values only when the publisher declares them. Saved services connect automatically and survive restarts. Custom remote endpoints and local commands are also supported. Installation belongs to the authenticated operator; the character cannot install services through a model tool.

## Table of Contents

[Use](#use) · [Configuration and recovery](#configuration-and-recovery) · [Model experience](#model-experience) · [Limitations](#limitations)

<a id="use"></a>
## Use

The source-workspace Genesis Web profile includes this bundle. Start the supported application with `pnpm dsh web`; the Genesis browser companion supplies the settings page. Other Web compositions can add this bundle beside Genesis and its browser companion, with the existing global MCP manager, Settings and credentials services available.

Discover lists publisher-provided descriptions and supported connection choices. The detail page prefers a Streamable HTTP endpoint; otherwise it offers a supported, version-pinned npm or PyPI package. Install saves the connection and starts it without a separate enable step. Required inputs appear directly; optional inputs remain under Optional settings. Local installation downloads and executes software on the Genesis server, using its installed `npx` or `uvx`. Inspect the displayed package before clicking Install. Registry inclusion does not verify safety, availability or pricing.

Added services shows actual connection state and currently registered tool names. Connecting is distinct from connected. Operator-configured entries can be disabled, reconnected or removed; plugin-owned entries remain managed by their plugins. Removing an inherited entry restores its inherited configuration; disable it to keep it off. Custom remote services accept a URL, optional bearer token and advanced headers. Local services accept a program, a JSON argument array and a JSON environment mapping. These custom entries are additions; replace an existing service by removing and re-adding it.

Each enabled service automatically contributes a read-only toolkit under Settings → Toolkits. Membership follows its MCP namespace as tools change. Disabling or removing a service withdraws its group after tool cleanup; re-enabling uses the same group id. Manual groups are preserved. Installation does not teach or activate tools and does not grant QQ access.

<a id="configuration-and-recovery"></a>
## Configuration and recovery

`registryUrl` selects an official-registry-compatible API; `managerEntry` identifies the existing MCP manager profile row. Registry responses, caches, pages, tool discovery context and complete RPC results have configurable limits in `Config`. The directory is cached in memory and cannot block previously installed connections when unavailable. Metadata is display data, not installation authority; the Host resolves the exact displayed version and checks its recipe fingerprint before writing.

Connections use the existing profile patch and revision checks. Secret recipe inputs and custom header/environment values are stored in the credential provider; the patch stores references. Removing an entry deletes its generated credentials only when no remaining managed configuration references them. Back up the profile and credentials together. Failed writes may leave unused generated credential references; they are not automatically discarded when publication is uncertain. An unconfirmed configuration or credential write blocks further marketplace changes and displays a persistent warning for that runtime. Inspect both stores and restart Genesis before editing again. A stale revision requires refreshing, without overwriting another window's changes.

<a id="model-experience"></a>
## Model experience

Connected managed tool names enter a bounded, logged runtime context only in operator Life conversations. The character can learn exact names through the existing learning tool when useful, without manual transcription. Installation does not mark tools learned, tested or authorized; tool learning, toolkit activation, QQ access and execution guards remain independent. Current capability observations and successful calls retain their existing Genesis recording paths.

The context contains names, not the catalog or full schemas. It consumes the configured context budget; after learning, normal MCP tool schemas and results have their existing token and cache effects. Installation and removal can change the next request's available tools. The directory has no model-facing search or installation tool.

<a id="limitations"></a>
## Limitations

Interactive OAuth, legacy SSE, containers, MCPB, custom package registries and publisher-supplied runtime flags are not supported by catalog installation. Unsupported entries remain visible without an Install action. Local package runners must already exist; this bundle does not install Node.js or Python runtimes. The catalog may omit authentication requirements, and remote services may still require an account or payment. A connection failure retains the saved entry for inspection and retry. First-page browsing follows registry order rather than popularity. The UI supports Chinese and English.

## Dev Note

None.
