---
kind: upgrade-guide
description: "Genesis writer leases use kernel locks and retain the lock file after release, requiring all writers to upgrade together."
---

# Genesis writer lease protocol

English | [中文](guide.zh.md)

## Change

Genesis uses a kernel lock at `leasePath` instead of treating file existence as ownership. Normal shutdown and process death release ownership automatically. The file remains in place and must not be deleted or replaced. Older Genesis versions use a different locking protocol and cannot run alongside upgraded writers for the same life data.

## Migration

1. Stop every old Genesis process before starting an upgraded writer. Keep the same `DSH_HOME`, storage routes and `leasePath`; an existing abandoned lock file can remain in place.
2. Upgrade all writers that share the life data together. POSIX requires the packaged native flock binding; Windows uses an exclusive kernel file handle. Use a local filesystem with working kernel locks.
3. Start the usual `dsh` profile. Verify that Genesis activates and retains its life ID and birth timestamp. A second writer must fail while the first holds the lock; after the first process exits, a new writer must start without deleting the file.
