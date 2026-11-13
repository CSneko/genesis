---
description: "Configure expiring conversation summaries alongside Genesis long-term memories."
---

# Genesis temporary memory

English | [中文](temporary-memory.zh.md)

## Summary

Temporary memories are read and written only in Life mode; other modes neither inject nor recall them and do not generate summaries. Without awakening configured, conversation-driven temporary memory stays inactive. Temporary memories are independent, expiring interpretations of conversation text. They coexist with [long-term memories](memory.md), keep source Session and event references, and never grant permissions or turn model statements into established facts.

## Configure

Start the supported source-workspace Web profile with `pnpm dsh web`. Open **Settings → Temporary memories**, retain Use the shared memory LLM, set the inactivity interval, enable the feature and save. Fresh settings follow the current memory writer dynamically; turn off inheritance to configure a registered provider/model or OpenAI-compatible Chat Completions endpoint. Existing saved summary routes remain explicit. The feature initially stays disabled; no particular model price or capability is assumed.

The default inactivity interval is 30 minutes, checked every minute. The summary endpoint can use the write-only `GENESIS_TEMPORARY_API_KEY` credential; save its key and endpoint settings separately. Registered providers use their existing credentials. Importance uses **Knowledge Base → decision model**, independently of the summary model. Changing these settings does not change the long-term memory writer or decision configuration. Current summaries, expiration times, deletion and explicit retry are on the same page, with text search across all unexpired summaries and previous/next page controls.

## Triggers and batches

A source conversation becomes eligible after inactivity. A real user message in a different conversation also marks the previous ordinary Life conversation for summarization. A QQ source conversation is never switched by messages in other conversations; instead it becomes eligible as soon as its unsummarized text completes one batch and that Agent is idle, so continuous QQ traffic is summarized without a quiet period. A short QQ tail still waits for the inactivity interval. Active turns finish before maintenance claims the source Agent; incoming follow-ups wait behind that maintenance and finish before a privately resumed Agent is released. Summaries do not generate chat replies or QQ sends.

The source projection retains real user text, visible assistant text and actual tool names in event order. It omits tool arguments, tool results, injected context and hidden reasoning. Count Unicode characters in those text fields, including punctuation; after at least 1,000 characters, finish the entire message that crosses the threshold. Each batch targets an approximately 100-character Chinese summary. An inactivity/switch trigger also summarizes the final short batch. A single oversized message is refused visibly instead of being truncated; `temporaryMemory.inputChars` bounds the complete inference input. The summary response has a separate character limit.

Recovery discovers stored Life conversations whose work has no cursor yet, including earlier messages in those conversations. Already committed progress is preserved. Deployment limits bound tracked Sessions, current records, queued work, sources per sweep, batches per run and complete context output; exhausting a limit reports failure rather than silently dropping evidence. A large backlog continues on later timer passes.

QQ summaries name conversation partners by their logged nickname or group card; the verified operator uses the configured name. Account IDs remain internal attribution and audience keys, not prose names. Display names do not establish identity or permissions, and identical nicknames do not merge speakers. This applies to newly generated summaries.

## Importance, sharing and forgetting

Each successfully created summary receives one importance decision. A provider returns importance from zero to one; a System One route supplies its probability. Values below one third retain the summary for one day, values below two thirds for two days, and other values for three days. Expiration is measured from the committed creation time. Expired entries immediately disappear from recall and context selection; the maintenance pass removes their current stored records, including while automatic summarization is disabled.

With `memorySharing: life`, selected by the life overlay, all participating Web and QQ conversations can recall unexpired summaries across source conversations. Original audience fields remain stored for attribution and switching policy. With `memorySharing: conversation`, ordinary operator conversations share their summaries with other operator conversations. Private QQ summaries remain with the same person, with the explicitly bound operator's private summaries also available in operator Web conversations. Group summaries stay in their originating group. The captured audience persists across nickname changes or deleted bindings. All access filtering occurs before recall or context selection.

Automatic context injection excludes summaries originating from the requesting Session, including after resume; explicit recall can still retrieve them. The next model request receives only additions and changed records, plus explicit withdrawals for entries that expired, were deleted or left the bounded selection. Unchanged retained modules are not repeated. The delivery ledger is reconstructed from the Session projection, so restart does not reset it; compacted-away current modules are supplied again when needed. `genesis_recall` can also find permitted unexpired temporary text by keywords; it marks these interpretations and their expiration explicitly.

## Recovery and deletion

The separate version-one `genesis_temporary_memory` domain atomically publishes each summary with its per-Session progress. A durable pending summary survives an interrupted importance request. A completed, logged importance response is reused after restart instead of reclassifying. If no completed response is recorded, an unknown request outcome stops that source until the operator chooses **Retry failed summary**; explicit retry can make another request when the previous outcome cannot be established. Failed or malformed responses never become memory facts. Unknown storage writes stop dependent work until verified reload.

Optional generation gets at most three automatic attempts per batch (`temporaryMemory.maxAttempts`, default 3). Once exhausted, the batch is skipped by durably advancing its source progress; the source Session keeps one safe failure audit with the stage and concrete diagnostic. Isolated skipped batches add no settings error rows. Three consecutive skipped batches in one Host runtime (`temporaryMemory.failureThreshold`, default 3) show one current diagnostic; a successful batch clears it. This health counter resets when the Host restarts; committed skips survive restart. Recovery, capacity, storage and unknown importance outcomes remain visible and stop their source. On startup, older model/JSON/validation failures are admitted to the bounded automatic policy. A `max-tokens` failure identifies `temporaryMemory.maxTokens` (default 2048); connection, credential and response-format failures retain their respective safe diagnostics.

**Forget now** removes a current summary without resetting its source progress. Original conversations and auxiliary audit records remain in their original Session logs; expiry and temporary-memory deletion do not erase those logs or existing long-term memories. Full data erasure therefore also uses the operator's existing Session and life-data deletion workflow. Life-state backups do not include this independent domain; keep matching temporary storage and source Session logs when restoring it. A foreign life identity, duplicate IDs, incompatible schema or invalid expiry fails visibly.
