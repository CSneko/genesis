---
kind: upgrade-guide
description: "Genesis daily-use sections move from Settings to a dedicated main page in the left sidebar."
---

# Genesis main-page navigation

English | [中文](guide.zh.md)

## Change

Genesis contributes a left-sidebar entry beside Plugins and Scheduled tasks. Life information, memories, personality, emotion, relationship, goals and writings move out of Settings into this page. Delegated tasks and message-delivery receipts also appear there. Knowledge Base, Toolkits, Minecraft configuration and proactive sending policy remain in Settings. The old operational settings section IDs are no longer navigation targets.

The task monitor is read-only, bounded and authenticated. It never starts a model or resumes work; original conversations retain execution controls. This navigation change does not alter persisted life or Session formats, tool learning or permissions.

## Migration

1. Rebuild Genesis Host reflection and its browser companion together, then restart the existing supported `dsh` Web or Desktop profile with the same Genesis overlays and storage.
2. Open Genesis in the left sidebar for daily-use functions. Update any custom UI links targeting the former operational settings sections to the Genesis main page (`main` key `genesis`) and its `genesis.page` sections. Model and connection settings retain their settings entries.
3. Verify that Genesis → Delegated tasks shows actual accessible tasks or an explicit empty/unavailable state, and Genesis → Message deliveries shows receipts. Use Settings → Proactive message settings for sending policy.
4. Custom browser rosters must include `@deepseek-ai/dsh-client-ui-sidebar`, declared by the companion manifest. Disabling the companion removes its main-page and settings contributions without deleting data. See the [companion README](../../../../packages/experimental/client-ui-genesis/README.md).
