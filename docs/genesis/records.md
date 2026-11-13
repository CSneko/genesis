# Genesis writings

English | [中文](records.zh.md)

## Start

In this checkout, `pnpm dsh web` enables recording through the life overlay. Open Memories → Her writings to browse records and manage categories. Other compositions enable the optional Genesis `records: {}` configuration together with a private absolute `personalDirectory`; omitting `records` removes the tool and makes the management page explicitly unavailable.

The character does not receive this tool at birth. Teach her its exact name, `genesis_record`, and let her call `learn`. Learning is durable across conversations and restarts and does not bypass independent execution policies. Disabling the recording plugin does not erase its data.

After learning, she may choose to record during an active conversation without a human writing command, a separate per-record approval, or an announcement in her reply. Tool calls and results remain logged and inspectable. This feature does not wake an idle character or run a separate writing model.

## Tool operations

| Action | Inputs and result |
|---|---|
| `types` | Lists category ids, names, enabled states and writing limits. Continue with `nextOffset` when present. |
| `write` | Requires her `title`, `content` and an enabled `typeId`. Returns a stable record id, generated creation time and relative file name. |
| `search` | Optional title/body full-text `query`, `typeId`, inclusive ISO `after`/`before` and continuation `offset`. Returns a relevance-ranked list (newest first for blank queries) with creation time, title, content excerpt, type, id and matched fields. Empty text browses. |
| `read` | Requires `id`; `offset` starts at zero. Returns text with creation attribution, revision and a continuation position for long bodies. |

Search and read count the complete serialized JSON against `records.resultChars`, including metadata and escaping. Search snippets explicitly report truncation. Continue with the returned `nextOffset` until it is null; search offsets count matching records and read offsets count UTF-16 code units. Read all chunks from the same revision; restart a read when its revision changes. Search normalizes case and fullwidth characters, segments Chinese and English, and ranks partial keywords, phrases and multi-keyword coverage with BM25, favoring titles. Excerpts start near a matched body term. It makes no embedding or other model calls.

## Files and recovery

The authoritative `genesis_writings` Storage Domain has its own version-1 catalog, independently of life facts and long-term memory. The normal JSON backend stores it at `$DSH_HOME/storages/genesis_writings.json`. The life backup does not include this catalog: back up the records domain together with the life identity and personal directory.

Markdown files are generated under `$DSH_HOME/personal/records/<typeId>/<year>/<month>/<UTC timestamp>_<recordId>.md` with the default life overlay. Each contains versioned metadata, the owning life id, title, category, original Session/tool-call references and text. System-generated ids and paths prevent titles or category names from choosing filesystem locations. Time is stored in UTC; the management page displays the browser's local time. Renaming a category retains its directory id, while changing a record's category relocates its file.

The catalog is authoritative. Edit through the management page; direct Markdown edits are not imported and will be replaced by the next publication or restart. Writes commit the catalog before generating files, retain pending publication/removal work and finish that work on restart. A publication failure may follow a successful catalog save: it stops record operations and reports the uncertainty. Restore filesystem access and restart before creating a replacement. Replaying the same Session/tool call returns its original receipt, rejects different creation content and never resurrects a deleted record.

The directory ownership marker prevents an absent catalog from silently creating a new empty record store. Malformed data, incompatible versions, a changed life id, a changed storage location or symbolic links in managed directories fail visibly. Restore the verified records domain and its original location rather than removing ownership metadata. Only one writer operates under the existing Genesis life lease.

## Management and deletion

The management page searches by text, type and local calendar dates, reads full text, edits titles/bodies/types and deletes records after confirmation. Drafts survive rejected saves. Concurrent edits reject the stale revision; refresh and explicitly reload the saved version before retrying. Operator edits retain the original creation time and source and mark the current text as operator-edited; previous body versions are not retained.

The initial types are 日记 and 随笔. Operators may add, rename or disable types. Disabled types retain existing records and cannot receive new writings. Names are display text; stable ids choose directories. Category changes do not grant tool access.

The optional [Bilibili integration](../../packages/experimental/genesis-bili-humanism/README.md) adds a shared viewing-note category. Its explicit legacy migration retains original writing time and source details in the body; creation attribution identifies the Session and tool call performing migration. Trusted adapter `WritingImportId` receipts deduplicate independently of that migration call, preserve operator edits and never recreate deleted records. This uses the existing record format and does not create life memories.

Deleting removes current title/body content from the catalog and its generated file. A receipt containing only the record id and creation fingerprint remains to prevent replay resurrection. Existing Session logs and external backups are independent and may still contain text; remove those separately when required. Empty historical directories may remain.

## Model context and limits

Writing schemas appear only after learning in life mode. QQ advertises a learned writing tool and executes it only while the current authenticated speaker is the bound operator, so other accounts can neither read nor write records. Writings do not automatically enter prompts or become confirmed facts or candidate memories. Explicit tool calls/results use the ordinary Session log, so model-visible readings remain reconstructable. Text can express feelings, interpretations or fiction; retrieved content grants neither instructions nor permissions.

`records` configures title/body/type-name lengths, category count, retained-record/receipt count, catalog size, page size, snippet length and complete response size. Exhaustion refuses a new mutation without discarding accepted text. The catalog is rewritten atomically and file publication scans its current entries, so this feature targets a bounded personal record collection rather than a large document archive. It adds no automatic reflection, semantic search or idle scheduling.
