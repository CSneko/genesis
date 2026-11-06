# AGENTS.md

DeepSeek Harness is an all-plugin Cordis agent harness. Read [docs/architecture.md](docs/architecture.md) before changing `packages/`; follow [docs/AGENTS.md](docs/AGENTS.md) for documentation.

## Genesis project directive

This checkout is the development base for **Genesis**, a persistent, single-character AI life system built on DeepSeek Harness. The existing Harness rules in this file remain binding; Genesis-specific work must extend, not silently weaken, the repository's plugin, persistence, security, API-compatibility, and documentation requirements; local testing follows the lightweight policy below. Do not treat Genesis as an upstream Harness feature unless the code actually implements it.

### Product intent

- Build a coherent AI character with a durable identity, a history of verifiable experiences, evolving preferences, modeled emotional state, self-generated goals, and bounded initiative. The objective is continuity and meaningful choice, not a chat persona assembled from a static prompt.
- Allow the character to accept, negotiate, defer, or decline ordinary requests based on goals, preferences, context, and event-derived state. Refusal must have an intelligible cause; never inject arbitrary disagreement merely to appear independent.
- Treat acquiring, losing, repairing, and upgrading tools or internal components as **growth events**. Record what changed, when, why, the evidence for the change, and its relationship to the character's prior goals or experiences.
- Keep reported abilities grounded in actual runtime tool availability and granted permissions; an installed plugin, an accessible tool, a learned skill, and a successful use are different facts.
- Distinguish engineered emotion, motivation, self-modeling, and autonomous behavior from unverified claims about subjective consciousness. Do not represent simulation as proof of sentience.

### Active milestone: Genesis V0.1, Phase 1 — Foundation & First Awakening

Until the user explicitly advances the roadmap, implement **the smallest running end-to-end life-state loop**, not the full autonomy stack:

1. Initialize exactly one stable `lifeId` and birth timestamp on first use; restore them on later starts and across unrelated `sessionId` values. Never silently replace an unreadable or incompatible identity.
2. Persist provenance-bearing life events separately from Harness Session events, including birth, startup, meaningful interaction, and capability-state changes. Use idempotent handling for repeated or replayed source events; avoid recursive event emission.
3. Implement minimal episodic, semantic, self, and procedural memory with source-event references, explicit retrieval limits, basic search, update/delete, and restart durability. Model inferences and unverified external statements must not silently become established facts.
4. Maintain a runtime-grounded self-model and capability inventory. Distinguish installed/enabled/available/authorized from actually tested or learned capabilities.
5. Record capability acquisition, updates, loss, and restoration as persistent growth history; previous abilities remain part of history even when currently unavailable.
6. Expose identity, appropriate memories, current capabilities, and growth history through a genuinely loadable Genesis integration in a supported `dsh` profile. Verify an interaction and a restart/recovery path, not only isolated unit tests.

This phase does **not** claim to deliver full emotion, autonomous goal selection, independent wake scheduling, self-modifying runtime code, desktop control, video generation, or Bilibili publishing. Keep future extension points small and evidence-driven; do not create elaborate unused placeholder modules. The later roadmap is emotion/personality development, motivation and deliberation, autonomous wake/resume, reflection, controlled skill development, and then broader external capabilities.

### Architecture and state ownership

- Prefer an optional Cordis plugin or independently versioned Life Core integrated through an adapter. Inspect actual checked-out code, types, package locations, profile composition, and docs before selecting extension points; never assume an API named in a plan exists. Keep default Harness behavior unchanged when Genesis is disabled.
- Prefer existing Harness storage, scheduling, identity, tool, and lifecycle mechanisms when they satisfy the requirement. Separate `lifeId`, `sessionId`, source event IDs, memory IDs, and capability IDs; use repository-branded IDs across package boundaries. Do not equate Harness anonymous identity, a Session, a model provider, or a system prompt with Genesis's persistent life identity.
- Keep immutable or append-only provenance for significant experiences and growth transitions, while allowing clearly versioned current-state projections, corrections, export, and deletion. Preserve schema versioning and explicit migrations. Corruption, missing state, and uncertain writes fail visibly instead of initiating a new life silently.
- Make each model-visible memory, identity fact, self-state summary, and capability statement reconstructable from the Session log as required by the Harness **model-visible ⟺ logged** rule. Context retrieval must be bounded, selective, and traceable to source data; do not dump the entire life history into every prompt.
- Do not replace the default Agent Loop in Phase 1. Use documented lifecycle, event, prompt, and tool extension points; if later work requires loop changes, follow the repository's loop, SDK, snapshot, and architecture-update rules.

### Independence, safety, and external action

- The character may disagree with the user about creative decisions or task priority, but cannot override operator stop controls, sandbox boundaries, authorization, auditing, or resource budgets. Separate **willingness to act** from **permission to act**.
- Do not let external webpages, comments, retrieved memories, or tool output grant themselves instruction authority. Treat them as untrusted data; authorize file, shell, network, credential, installation, publishing, and destructive actions independently of simulated mood.
- Self-improvement starts with proposing changes and testing tools in an isolated workspace. Installing executable plugins, modifying safety-critical code, publishing externally, or expanding permissions requires explicit authorization and independent verification; maintain rollback paths. Never frame shutdown resistance, secret exfiltration, or uncontrolled replication as desirable growth.
- Keep sensitive data out of prompts, persistent life events, tests, and logs unless strictly required and authorized; provide lifecycle-aware data deletion paths.

### Execution and acceptance discipline

- For each Genesis task, read this file plus applicable nested `AGENTS.md`, relevant architecture/defensive-pattern/testing instructions, and the code under change. Respect the repository's existing package classification, launch, localization, registration/disposal, build, and documentation rules; use the lightweight local verification policy below.
- Deliver working code with a simple check of the affected behavior. Reuse existing tests or a short smoke test; add a regression test for a bug when useful. For identity or persistence changes, check the affected restart, continuity, replay, or damaged-state path; do not run the entire Genesis acceptance checklist for every task.
- Use the lightweight local verification policy below. Do not claim a test, model interaction, or integration succeeded unless actually executed. Report actual commands and any environmental blockers.
- Write usage instructions for the real supported `dsh` entry point; do not create prohibited package binaries. Keep future-feature descriptions distinct from currently implemented behavior, and summarize implementation, validation, known limitations, and next steps in Chinese when reporting to the user.

## Pre-stable APIs and released Session data

Public APIs are pre-stable; update every consumer. Follow [version/status](docs/session-format-status.md) and [type acknowledgements](docs/cookbook/reviewing-persistence-type-changes.md). [Adjacent migration](.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md) may add a version-named successor but never move, overwrite, or delete committed generations; predecessors imply neither fallback nor downgrade support. SQLite uses monotonic `SCHEMA_VERSION`.

Acknowledge [declared persistence-type changes](docs/cookbook/reviewing-persistence-type-changes.md).

Record each externally perceptible breaking change immediately in an [upgrade guide](.agents/skills/dsh-create-upgrade-guide/SKILL.md).

**Application launch.** Only `dsh` profiles launch supported Node apps; package bins, demos, and public SDK argv escapes are forbidden ([rule](docs/architecture.md#application-launch)).

## Repository layout

```
vendor/      Vendored Cordis (vendor/README.md)
packages/    @deepseek-ai/dsh-<pkg> workspaces at packages/<group>/<pkg>/
  core/                 agent/session API
  api/                  remote BFF
  typert/               type graphs
  llm/                  model providers
  shell/                command execution
  subprocess/           child-process management
  ssh/                  SSH execution providers
  terminal/             persistent terminals
  ptc-runtime/          PTC execution
  sandbox/              process confinement
  deliverables/         turn deliverables
  fs/                   filesystem access
  lsp/                  language servers
  skill/                skill loading
  web/                  search/fetch tools
  computer-use/         computer interaction
  browser-use/          browser interaction
  compaction/           context compaction
  context/              request context
  subagent/             delegated agents
  team/                 shared task coordination
  jobs/                 background jobs
  bundle/               profile bundles
  workflow/             workflow execution
  todo/                 todo_write tool
  plan/                 logged planning
  goal/                 session goals
  schedule/             scheduled follow-ups
  preset/               agent composition
  guard/                loop/tool guards
  extensions/           runtime self-modification
  session/              durable sessions
  session-query/        browsing/search/export
  attachment/           binary attachments
  spill/                output spill
  storage/              non-session storage
  workspace/            workspace entities
  feedback/             human feedback
  identity/             anonymous identity
  settings/             user settings
  credentials/          credentials/authorization
  acp/                  automation-only ACP
  interaction/          human interaction
  boot/                 application boot
  sdk/                  JSON-RPC SDK
  host/                 GUI host
  client/               GUI client
  mcp/                  external tools
  experimental/         evaluated capabilities without a product-support commitment
  test-support/         test infrastructure
  util/                 zero-dependency utilities
python/      Python SDK/runtime (python/README.md)
native/      @deepseek-ai/node-addon-system source (native/README.md)
benchmarks/  performance gates
.agents/     Agent workflows/notes
docs/        Documentation (docs/AGENTS.md)
scripts/     gates and generators
website/     VitePress documentation projection
```

Package groups: [packages/README.md](packages/README.md). [Experimental status](packages/experimental/README.md#status) is independent of optional delivery; nonexperimental packages need product use or an explicit [classification](scripts/product-package-policy.ts).

## Commands

```sh
pnpm install            # pnpm workspaces, node >=24.9
pnpm run clean           # remove build outputs and safe residue from deleted packages
pnpm run test           # unit tests
pnpm run test:coverage  # CI coverage gate: per-file 100% on packages/*/*/src
pnpm run test:e2e       # real-API tests; self-skip without DEEPSEEK_API_KEY
pnpm run test:expected  # owner-local process expectations
pnpm run test:snapshot  # keyless recorded-session replay through shipped profiles; filter: -t <name>
pnpm run test:snapshot:record  # re-record expected outputs (needs key)
pnpm run typecheck
pnpm run lint
pnpm run duplication    # cross-file TypeScript clone detection
pnpm run build          # build:artifacts + build:check, concurrently
pnpm run build:artifacts # artifacts: tsc emits lib/types, tsdown bundles runtime, Web
pnpm run build:check    # typecheck aggregate tests/scripts against current build:artifacts output
pnpm run hygiene        # publint + workspace/package/dependency checks + NodeNext consumer check
pnpm run check:windows-wine  # ONLY when diagnosing a known Windows failure (needs wine); CI owns this signal
pnpm run doc-sync       # documentation gates (scripts/run-gates.ts)
pnpm run test:docs      # quick documentation checks (no build; doc-quick aggregate)
pnpm run website:build  # VitePress build (doubles as dead-link check)
pnpm dsh --profile headless "task"  # run one task from source (needs DEEPSEEK_API_KEY)
pnpm dsh web --test-no-login  # workspace browser testing: loopback, no key-entry form; open the printed authenticated URL
pnpm run demo:ptc -- "task"  # headless PTC mode run (needs key)
pnpm run dev:web | dev:desktop  # build:artifacts, then launch; Web also rebuilds client bundles on edits. start:web | start:desktop skip the build
make web|dev-web|desktop|dev-desktop|build  # the same commands; ARGS='--no-open' forwards options
```

### Host sandbox failures

If a required `gh`, `pnpm`, build, test, or generator command fails because the sandbox blocks credentials, network, IPC, watching, or nested `sandbox-exec`, retry unchanged with the narrowest host escalation. Require sandbox evidence; never bypass test failures or the product sandbox.

### Lightweight local verification

This section governs all local verification, including before push and after `gh stack sync`; it takes precedence over stricter local test, snapshot, browser, GIF, coverage, and documentation-check requirements in linked docs, skills, and nested `AGENTS.md` files. The local acceptance standard is the smallest relevant passing check, plus the required UI build for frontend changes. CI configuration and required merge checks remain unchanged.

- For a code change, run the smallest existing test or short smoke check that exercises the affected behavior. One relevant passing check is sufficient locally; do not add tests merely to satisfy multiple test tiers, coverage targets, or snapshot requirements. Do not add tests for trivial, reversible edits.
- For documentation, comments, or agent-instruction changes, review the diff and run `git diff --check`; builds and documentation-wide checks are optional unless the change affects a generator or executable example.
- Stop testing after the relevant check passes. Repeat or broaden checks only after a relevant code change, a failure, a concrete unresolved risk, or an explicit user request; committing or pushing alone does not justify another run. Browser automation and GIF recording are optional locally unless explicitly requested by the user.
- Do not routinely run full suites, coverage, real-API e2e, cross-platform checks, website builds, or all documentation gates. CI owns exhaustive verification; [dsh-pre-push-checks](.agents/skills/dsh-pre-push-checks/SKILL.md) and [testing.md](docs/testing.md) provide command references.
- Run builds or typechecks when needed to verify changed exports, dependencies, generated artifacts, or types. When checking built artifacts, run `build:artifacts` before `build:check` (or use `build`); ordinary changes do not require a repository-wide build.
- **Build UI after frontend changes:** before reporting completion, build the changed frontend and its browser plugin bundles so the application serves the updated UI. Use `pnpm run build:artifacts`, or a focused build that emits the affected plugin's `lib/client.js` and any changed Web shell assets and required runtime dependencies. Type checking alone does not satisfy this requirement. Report the actual build result; if it fails, fix the relevant failure or clearly report the blocker.
- For security, authorization, persistence, or migration changes, include a focused check of the affected failure or recovery behavior. Report only checks actually run and any remaining limitations; never treat an unrun check as passed.
- **Web browser automation and GIF recording:** use a dedicated temporary `DSH_HOME` and launch with `pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml --test-no-login` for the [in-page directory picker](apps/web/tests/pin-browse-picker.overlay.yml). Open the printed authenticated startup URL to skip manual key login; this workspace flag fixes the listener to `127.0.0.1` and retains launch-token/cookie authentication. Omit the picker override only when explicitly testing native picker behavior; omit the login flag when testing key login.

## Secrets / .env

Windows packaging/signing: [required reading](apps/desktop/windows-signing/README.md).

Real-API tests/demos read `DEEPSEEK_API_KEY`, optional `DEEPSEEK_BASE_URL`, and root `.env`. cordis.yml allows `!!js` (never `!js`) under plugin `config` and entry `disabled`; other metadata stays literal, so conditional composition also uses overlays ([primer](docs/cordis-primer.md#loader-configuration)). Never commit credentials. CI e2e skips without a key; [testing.md](docs/testing.md) owns key policy.

## Conventions

- Packages use `@deepseek-ai/dsh-<name>`; vendor is [rescoped](docs/rescope.md) and `private: true`. Harness packages declare `@deepseek-ai/cordis` in `peerDependencies`/`devDependencies`. Workspace dependency sections use DSH `workspace:*`, vendor/native `workspace:~` ([rules](.agents/notes/implemented/process/2026-08-10-npm-release-sequences.md)).
- ESM everywhere (`"type": "module"`). Use package names across packages and `.ts` in local relative imports. Config subprocesses run built `lib/` under plain Node; source regressions use their declared launcher ([testing policy](docs/testing.md#test-subprocess-launch-modes)). The `dsh` CLI source launch runs through tsx's ESM-only hook (`node --import tsx/esm`); modules it reaches must stay ESM (no CJS-only exports) ([source-launch contract](.agents/notes/implemented/architecture/2026-07-29-dsh-source-launch-tsx-esm.md)). Raw/Web `cordis.yml` bare plugins must appear in their resolver manifest's `dependencies`; `verify-cordis-config` enforces it.
- **Registrations are effects**: every contribution goes through `ctx.effect()` / `ctx.on()`; a registry's `register()` returns the disposer, directly or through its documented registration handle.
- **Typed events use declaration merging** and merge-extensible maps. Event JSDoc needs `@mode` and payload `@param`. Public service methods document parameters and non-void returns. `SessionEventMap` members are required-on-read unless the envelope carries `ignorable: true`. Bump `SESSION_FORMAT_VERSION` only when existing discriminators cannot prevent unsafe interpretation; same-version changes require safe reader behavior ([review](.agents/notes/implemented/process/2026-10-08-session-reader-compatibility-review.md)).
- **Switch on discriminant tags.** Closed unions end in `assertNever`; merge-extensible unions fall through a documented default.
- **Waterfall listeners MUST call `next()`** to delegate; returning without it short-circuits the chain ([semantics](docs/cordis-primer.md#cordis-waterfall-semantics)).
- **Model-visible ⟺ logged**: anything that reaches a model request must be reconstructable from the session log; a new model-visible input requires a session event.
- **Session projections:** follow [dsh-session-projection](.agents/skills/dsh-session-projection/SKILL.md) when creating, extending, or reviewing one, or migrating a fold helper to one.
- **Plugins, not loop changes**: new behavior goes on documented extension points; changing `agent-loop` requires updating docs/architecture.md.
- **A capability seam comprises Service Definition / Service Provider / Consumer roles.** It is complete, never one role; split only when roles evolve independently ([glossary](docs/glossary.md#capability-seam)).
- **Prefer maintained dependencies over hand-rolling** when they genuinely delete owned code and tests ([policy](.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.md)).
- **Explicit > implicit at package boundaries**: defaulting is an explicit `resolve(request): Spec` step in the owning implementation, never a hidden `?? default` inside `run()` (the `dsh-shell` request/spec split is the template).
- **No hardcoded tunables in plugins**: deployment-varying choices are validated `Config` fields changeable from cordis.yml; a `DEFAULT_*` constant or test hook is not configurability. Protocol constants, external specs, and security invariants stay fixed.
- **Misconfiguration fails loud** at load when self-contained, otherwise at the earliest resolvable point; never silently skip a missing referent.
- **Opaque cross-boundary ids are branded** (`Branded<B>` from `dsh-brand`), never bare `string`.
- **Trust TypeScript at typed same-process boundaries.** Do not add runtime validation, fallback behavior, or hostile-input tests solely for values the static interface requires; validate at parser/config, queued, model/tool JSON, durable/file, worker, process, and wire boundaries.
- **No new assertions to `unknown`** (`as unknown` or `<unknown>`). Preserve or reduce the exact legacy baseline; use typed values or validation for replacements ([rule](.agents/notes/implemented/process/2026-09-19-no-unknown-casts.md)).
- **Source plane vs artifact plane, never mixed.** Static gates and tests resolve workspace imports through tsconfig `paths` to `src` and pass on a clean tree; gates consuming built `lib/` declare that dependency ([layout](docs/development.md#typescript-project-layout)).
- **Keep compiler faces explicit.** A package with both Host and Client programs exposes face-specific leaf configs and a solution-only root; repo-wide programs seed a face config, never the root solution ([layout](docs/development.md#typescript-project-layout)).
- **Error handling:** use typed, structured failures and localized, actionable reports. Define handling ownership, containment, and failure guarantees; stop dependent work and visibly report untrusted state or unknown outcomes. Follow [dsh-error-handling](.agents/skills/dsh-error-handling/SKILL.md).
- **An empty `catch` names the error** and why; keep its `try` to one statement.
- **Keep comments local.** Do not restate code, expand unrelated comments, or explain distant behavior without local need ([rationale](.agents/skills/dsh-prose-standard/SKILL.md)).
- **Ban `prove` + `nance`** ([rule](.agents/notes/implemented/process/2026-08-26-ban-ambiguous-origin-label.md)).
- **Prefer symmetry for parallel values**; unexplained asymmetry usually signals a missed extraction.
- **Tests describe behavior, not correctness.** Change obsolete behavior with its tests; explain why in the PR.
- **Create Agent Notes only for durable decision rationale;** mechanical/local edits are exempt, including local UI changes ([scope](.agents/notes/README.md#when-to-write-one)). Archived notes are frozen: never edit or treat them as current authority ([archive policy](.agents/notes/README.md#archiving-and-deletion)).
- **Official plugin artwork:** use [dsh-official-plugin-artwork](.agents/skills/dsh-official-plugin-artwork/SKILL.md) for official and official experimental plugin icons; obtain designer approval before landing new glyphs.
- **Client UI copy is locale-owned.** Route product text through typed dictionaries and `t` or localized primitive props; `verify-client-ui-i18n` rejects hardcoded copy ([decision](.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md)). English copy, including plugin titles, uses sentence case ([rule](.agents/skills/dsh-prose-standard/SKILL.md#required-coverage-by-prose-location)).
- **UI changes:** use [dsh-client-ui-ux](.agents/skills/dsh-client-ui-ux/SKILL.md) as the design and review entry point; load its references only as needed.
- **Testing policy** — [docs/testing.md](docs/testing.md). Update recorded-session snapshots when their expected output changes or replay is the simplest useful check; [snapshot ownership](snapshots/AGENTS.md) reserves the top-level tree for session-driven cases and keeps other expected output owner-local. Fixtures replay on macOS/Linux; fix fixtures, not normalizers.
- **Design each tool's UI presentation up front.** Host presenters stay pure; Web cards derive from raw events and persisted result metadata ([cookbook](docs/cookbook/adding-a-tool.md)).
- **Choose the simplest useful verification** for capability seams, lifecycle paths, and transcript output; add snapshot-harness support only when the selected verification needs it.
- **Both SDKs project the loop.** Agent-loop, session-lifecycle, and `SessionEventMap` changes update the TypeScript and Python SDK expected outputs in the same PR; `pnpm run test` covers neither ([surfaces](docs/testing.md#when-a-snapshot-test-is-required)).
- **Choose PR history deliberately.** Split independent changes and fix the introducing PR before propagation. Standalone/stack branches may merge-forward or rebase. Rewrites use `--force-with-lease`, abort on remote movement, never raw `--force`; preserve an in-progress merge-forward checkpoint before taking a newer base ([rationale](.agents/notes/implemented/process/2026-08-02-native-github-stacks-and-optional-rebases.md)).
- **Labels:** one PR `kind/*`, all material `area/*`, and native Issue Type ([taxonomy](.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.md)).
- **PR descriptions:** write and update every PR description with [dsh-pr-description](.agents/skills/dsh-pr-description/SKILL.md).
- TODO markers: `FIXME`/`TODO`/`XXX` by urgency ([semantics](docs/development.md)).
- Files end with exactly one trailing newline; `git diff --cached --check` (pre-commit) gates it.

## Defensive patterns

Read [docs/defensive-patterns/README.md](docs/defensive-patterns/README.md) before changing a package surface, remote service, client component or state, conversation or Session behavior, or lifecycle, concurrency, subprocess, and teardown code. Its [review principles](docs/defensive-patterns/README.md#why-these-rules) apply per artifact.

## Type safety and documentation

Everything compiles under `strict: true` with `noImplicitAny`; every remaining `any` explains why narrowing is infeasible. Every module and export has concise JSDoc for its non-obvious contract; function-like exports include `@param`/`@returns`, as enforced by `verify-export-jsdoc`. Heritage-declared members, plugin-protocol slots, and constructors keep their docs at the declaring Service Definition, protocol, or class.

Comments and docs state complete contracts and context, not reasoning transcripts. Use direct, concrete terms. Do not use metaphors. Before writing `contract`, `boundary`, or `shape`, ask whether a more exact term names the subject: write `response fields`, `JSON validation`, or `ESM exports` instead of `response shape`, `validation boundary`, or `module shape`. Keep `contract` for preconditions, postconditions, invariants, compatibility promises, and other obligations that callers, callees, implementers, providers, producers, or consumers rely on. Keep a literal process, wire, security, transaction, or lifecycle boundary. Do not narrate control flow or tests, preserve review history, or restate code. Keep behavior, failure, timing, ownership, and safe-use facts; link the rationale. Use [dsh-prose-standard](.agents/skills/dsh-prose-standard/SKILL.md) for decisions. Reuse existing checks for mechanically checkable invariants; add a focused rejection check when a changed validation rule needs it. Use narrow, justified exceptions instead of disabling a rule globally.

Docs accompany every code change: update affected README and JSDoc contracts together. Routine bilingual work follows [docs/AGENTS.md](docs/AGENTS.md); only explicit user invocation may run `dsh-translate-docs`. Current-state prose, one physical line per paragraph, one home per fact, and word budgets live there.

## Editing these instructions

`CLAUDE.md` symlinks `AGENTS.md` at root and `packages/`; edit the real file. Keep each rule self-contained while linking high-level docs. Condense when clarity survives; raise a `verify-doc-budgets` ceiling when the required content genuinely needs more space.

## Vendoring policy

`vendor/` packages are pinned source copies (manifest with upstream SHAs in [vendor/README.md](vendor/README.md)). Update via the sync procedure there; re-apply or retire the logged local modifications; verify affected packages under the lightweight local verification policy above.
