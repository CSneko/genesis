---
kind: upgrade-guide
description: "The Genesis Life overlay can expire ordinary memories, and earlier runtimes can refuse life data containing three-tier summaries or new memory timestamps."
---

# Genesis memory retention

English | [中文](guide.zh.md)

## Change

The Life overlay enables expiration for ordinary declarative memories. Existing memories receive a new retention interval upon first activation. The life store can contain three-tier summaries and timestamps for substantive corrections. Earlier strict readers can reject records containing the new fields.

## Migration

1. Keep a verified copy of the life store before upgrading if you intend to run the earlier runtime again. Use that copy with the earlier runtime.
2. Restart the existing supported Genesis profile. To keep ordinary memories indefinitely, set `genesis.config.memoryDynamics.forgetting` to `false` in the profile overlay before restart.
3. Open a new conversation and recall an existing memory. Use Memories to inspect the stored entry or regenerate its summaries. The [memory guide](../../../genesis/memory.md) describes retention exceptions and Session history.
