# Genesis architecture

English | [中文](architecture.zh.md)

## Summary

The experimental Genesis plugin owns one persistent life. Its life core depends on the Storage Domain interface and data types, while the integration adapter owns Cordis, Session evidence, prompt contributions and native tools. No Agent Loop or provider implementation is replaced.

## Loading and ownership

Loading acquires an exclusive writer lease, opens the `genesis` domain, validates stored records, restores or atomically creates the identity with its birth fact, and records startup. Domain reads that fail never create a replacement identity. The lease path must be shared by every process addressing the same data.

The core serializes read-modify-write operations and commits one complete state row. Its domain is closed only after accepted work and the graceful-stop fact settle. Plugin effects withdraw tools, prompts and listeners; the lease is released during teardown. A crash may leave no stop fact and an abandoned lease.

## Harness integration

`agent/created` binds a participating Life Session to the existing life. `system-prompt/assemble` supplies stable guidance and scoped tool visibility. `agent/pre-step` refreshes actual tool declarations and admits changed life modules as source-tagged `genesis-state` snapshots through the normal logged input pipeline. Retained projected messages determine which modules need updates; overflow retry recovery restores missing modules before retrying. Native tool results follow the existing durable tool pipeline.

`session/event` observes real user messages and tool results as metadata facts, identified by Session ID and sequence. It never republishes a Session event. Only the latest live user evidence and pending tool-call names are held in adapter memory; no deprecated synchronous historical Session readers are used.

Facts say what happened; memories contain attributed interpretations. Model output never changes identity. In awakening mode, a validated learning call records a learned capability without granting execution permission. Live availability is scoped to an Agent; old Session observations remain historical. Authorization stays with the Harness execution pipeline. A new life starts with no growth records. The first registry view of each Session is one baseline fact; only subsequent changes in that scope and explicit learning produce growth. Registry snapshots precede learned-tool filtering, which only controls character access and presentation. Repeated identical scans append no events. Existing persisted histories remain intact.

The optional [memory pipeline](memory.md) serializes reviews across Sessions at `agent/turn-stopping`. Registered Harness adapters or explicit Jev/Chat Completions endpoints receive logged bounded inputs; embeddings use a separate endpoint. Review failure is contained and reported without failing the completed chat. GUI model and embedding preferences own separate versioned domains under the life lease. Optional [emotion appraisal](emotion.md) has a separate serialized decision/write workflow and a bounded replayable dialogue projection, sharing model routes and the atomic life owner. Teardown cancels/drains memory and emotion work, closes preferences and core storage, then releases the lease.

The optional [awakening layer](awakening.md) applies its character prompt and learned-tool restriction only to the configured Life preset; only Life conversations participate in identity, memory, affect and capability history; ordinary presets remain outside that lifecycle. The browser creates the first Session through the existing Session API, then the life Gateway enqueues a source-tagged built-in greeting once. Turn projection state rejects nonblank targets. The life event records its canonical Session before admission; independent Sessions do not share transcript state.

Optional [deliberation](motivation.md) calls the independent writer at `agent/pre-step` and retains its committed choice as a source-tagged notice in the Session log. A monotonic tool guard restricts task execution according to the live decision; a trusted event entry uses the ordinary Agent inbox to continue life goals. Model text cannot complete a goal or expand permission. Cancellation and disposal drain accepted deliberation and result settlements before storage closes.

## Web status

The optional browser companion mounts its generated experimental Remote contribution separately from stable API assemblies. `GenesisStatusGateway.inspect` samples real live tools and bounded persisted previews through the existing authenticated Gateway. The separate Life information and Knowledge Base pages uses the shared resource model, with explicit refresh and reconnection refresh, no polling and no additional port. With awakening enabled, the authenticated `initialize` operation prepares the configured routes, probes embeddings and commits the user-selected name once. API/account configuration uses existing provider services. Naming operations are cancelled and drained before life teardown.

## Dev Note

None.
