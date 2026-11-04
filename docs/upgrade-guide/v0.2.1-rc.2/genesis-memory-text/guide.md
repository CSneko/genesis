---
kind: upgrade-guide
description: "Genesis recall results contain current text strings, and prompt memory lists omit record metadata."
---

# Genesis memory text output

English | [中文](guide.zh.md)

## Change

`genesis_recall` returns a JSON array of current memory-content strings instead of memory objects. IDs, sources, confidence, timestamps, summaries and historical versions are excluded. Existing consumers reading object fields must change.

Injected declarative summaries, non-declarative content and associated memories use plain text lines without JSON wrappers or record metadata. Internal sources, versions and management views remain available; life storage is unchanged.

## Migration

1. Upgrade Genesis and its client companion together, rebuild their runtime artifacts and restart the Web service.
2. Update custom recall consumers to read strings directly instead of `result[i].content`, IDs or source fields. Use the authenticated memory management interface for full records.
3. Remove custom prompt parsing that expects `entries`, `memories`, `omitted`, scores or IDs in injected memory sections. Use relevant keywords for model recall.
4. Recall a known topic and confirm that the tool returns only current text. Check that prompt memory sections contain plain lines and that the Memories page still displays sources and history. See [memory behavior](../../../genesis/memory.md).
