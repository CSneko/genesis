# Genesis emotion

English | [中文](emotion.zh.md)

## Summary

Genesis preserves nine immediate emotions, two slow mood dimensions and independent psychological needs across conversations and restarts. Event appraisals use attributed memories, the current goal when available and recent dialogue. These are engineered character states, not evidence of subjective consciousness.

## Enable

The workspace life overlay enables `emotion: {}`. Emotion uses the independent decision and writer routes configured for memory, without requiring embeddings for appraisal. Other compositions enable it explicitly; disabling the plugin retains stored state. See [memory](memory.md) for model configuration.

The supported headless composition can be inspected without starting a life or calling a model:

```sh
pnpm dsh --profile headless --patch packages/experimental/genesis/cordis.patch.yml --patch packages/experimental/genesis/cordis.emotion.patch.yml --dump-config
```

## Mood and immediate emotion

`mood.valence` ranges from -1 to 1 and `mood.arousal` from 0 to 1. They evolve on independent `moodHalfLifeMs` timescales, both twelve hours by default, toward a convex blend of the trait `baseline` and sustained immediate affect. `emotionMoodInfluence` is the affect fraction (0–0.5, default 0.25). Brief reactions have little accumulated influence; sustained or repeated reactions have more. Direct event-appraisal mood deltas still require important events or repeated independent evidence.

`current` contains `happiness`, `sadness`, `anger`, `fear`, `tenderness`, `gratitude`, `longing`, `frustration` and `disappointment`. Each ranges independently from 0 to 1; opposite feelings can coexist. Excitement and calmness follow mood and specific feelings rather than separate intensity fields. Curiosity belongs to exploration motivation.

Immediate feelings approach mood-dependent equilibrium levels using `shortHalfLifeMs`. `moodEmotionScale` bounds those levels (0–1, default 0.2); zero explicitly restores a zero destination. Each level is the scaled average of valence and activation cues defined in [affect dynamics](../../packages/experimental/genesis/src/affect-dynamics.ts). These qualitative coordinates do not establish causes, relationship facts or object attribution. Slow mood combines baseline with bounded positive/negative and high/low activation averages of immediate feelings. The gain product is at most 0.5, so the coupled affine system contracts toward a unique equilibrium instead of amplifying its own feedback. Matrix-exponential integration keeps checkpointed and uninterrupted evolution equivalent within floating-point precision, including long intervals. Default half-lives are five minutes for happiness, anger and frustration; three for fear; fifteen for sadness, tenderness and disappointment; twenty for gratitude; thirty for longing. These adjustable simulation parameters are not psychological measurements. Coupling changes the observed recovery curve, so a component half-life is not a guarantee that every deviation halves in that wall-clock interval. Mood recovery must be at least as slow as every immediate half-life.

Recovery uses elapsed time multiplied by `sensitivity` (0–2, default 1). Zero freezes automatic numerical changes, including relationships and needs, while appraisal calls and explicit operator adjustments remain available. Backwards clocks preserve the anchor. Recovery creates no offline experiences or Agent wakeups. `offlineChanges` defaults to true and includes wall-clock downtime. When false, startup rebases the saved anchor without evolving the stopped interval; normal shutdown first settles running time. A lifecycle-owned checkpoint saves online-only anchors every `clockCheckpointMs` (default 60000). Checkpoints preserve the operator revision and add no experience events. A crash resumes at the last successful checkpoint, conservatively excluding any uncommitted running interval as well as downtime. The checkpoint delay is not an upper bound on lost time when storage is stalled. Changing policy first settles the old rules and starts the new rules at save time; it never retroactively adds or removes elapsed time.

The design takes qualitative inspiration from [Kuppens, Oravecz and Tuerlinckx (2010)](https://doi.org/10.1037/a0020962), whose DynAffect model distinguishes a home base and attraction toward it, and [Eldar and colleagues (2016)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4703769/), who discuss cumulative outcomes and bidirectional mood effects. Neither validates this nine-emotion mapping, gains, half-lives or software clock policy; those are explicit engineering choices, not a fitted human psychological model.

## Psychological needs

`needs` stores social desire and satisfaction, relationship quality, recent interaction, solitude preference, exploration, autonomy, creativity and loneliness as independent 0–1 estimates. `initialNeeds` supplies deployment priors; they are not established personality facts. Sourced `needsDelta` proposals update inclinations and fulfillment within `maxNeedsDelta` (default 0.08).

Loneliness is never a writer delta. Its target is `socialDesire × (1 − solitudePreference) × (0.5 × (1 − socialSatisfaction) + 0.3 × (1 − relationshipQuality) + 0.2 × (1 − recentInteraction))`. Loneliness approaches that target with `needsHalfLifeMs`; contact evidence decays with `interactionHalfLifeMs`, both six hours by default. Exact integration makes repeated sampling equivalent to one complete interval. Other need estimates do not decay merely because the process was stopped.

Longing may name a person or object through an optional `targets` entry on an appraisal. It is independent of loneliness: a character may miss someone while feeling socially fulfilled. Social estimates remain uncertain, attributed interpretations; silence and shutdown do not establish rejection.

## Event appraisal and behavior

After a reply, a life-wide FIFO evaluates the new exchange once. The bounded Session projection contains real user input and uninterrupted assistant text. Earlier completed exchanges provide context. `appraisalMemoryLimit` (default 4) and `appraisalMemoryChars` (default 1600 per group) bound lexical related-memory retrieval and self-memory selection. The optional Harness goal service supplies the current goal; no goal is invented when absent. Auxiliary requests and responses are logged before their results affect state.

A positive decision invokes the writer with state, memories, goal, dialogue and limits. The writer returns signed `delta`, `moodDelta`, `needsDelta`, optional `relationshipDelta` and `targets`, structured `appraisal`, attributed `reason` and exact `sourceSeqs`. At least one citation must be new real user evidence. Neutral exchanges, bare numeric instructions and the assistant’s emotional claims alone do not justify changes. Experience can change how the model interprets a recurring event; no fixed failure-to-frustration rule is used.

The runtime validates sources, schema, per-field limits and captured revision before atomic publication. Immediate changes default to at most 0.25, mood to 0.04 and relationships to 0.01. Mood requires importance at least 0.8 or three distinct recent user fingerprints with the same event kind and relationship meaning. Repeated meanings receive a 0.5 multiplier per match by default; exact repeated evidence applies no new deltas. Replay markers prevent a source exchange from committing twice.

The next admitted request receives an independent logged `genesis:emotion` module with qualitative degrees, without percentages, storage IDs, timestamps or raw appraisal records. After `contextStep` quantization, magnitudes below 0.1 are negligible, 0.1–below 0.35 mild, 0.35–below 0.65 moderate, 0.65–below 0.85 strong, and 0.85–1 very strong. Mood valence adds positive or negative direction; the lowest band is neutral. Relationship confidence uses the same bands, with the lowest treated as unknown. Salience and ordering use only these bands, so numerical changes within unchanged descriptions do not emit another emotion module. Memory or capability changes do not resend emotion. Relationship label or attribution changes still update this module. Storage, operator controls and independent appraisal inputs retain their numeric scales. Exploration, creation, contact and independent-choice priorities guide choices among already permitted actions; fear informs caution. This supports willingness, negotiation and goal prioritization during an ordinary model turn. It does not schedule a turn, create autonomous goals or authorize execution. Operator instructions, stop controls, budgets and permission checks remain binding.

<a id="boredom-and-engagement"></a>
## Boredom and engagement

Boredom is an independent engagement state under `emotion.boredom`, rather than a social need or another name for loneliness. While the character is online, awake and idle, its level approaches one with `emotion.boredom.riseHalfLifeMs` (default 1800000). During an actual conversation or selected private exploration it approaches zero with `fallHalfLifeMs` (default 300000). Reflection alone does not count as exploration; sleep and stopped-process time do not accumulate boredom. These time scales are engineering defaults, not psychological measurements. Activity transitions retain source records; periodic checkpoints retain elapsed time without creating an experience for every tick.

The background appraisal may propose a bounded, cited `boredomDelta` for repetitive activity or meaningful engagement, including an interesting discovery in a failed attempt. A plan, one tool call or one outgoing message does not establish fulfillment. Boredom does not change loneliness, relationship quality or social satisfaction. This separation follows the distinction between engagement deficits in the [MAC model](https://pubmed.ncbi.nlm.nih.gov/29963873/) and perceived social disconnection in [loneliness research](https://pubmed.ncbi.nlm.nih.gov/24839458/).

The logged emotion module includes boredom degree and an inclination to seek engaging activity. Optional [spontaneous cognition](spontaneity.md) supplies bounded idle opportunities for creation, exploration or explicitly authorized conversation. Higher boredom shortens the interval between opportunities without raising execution or sending limits. Genesis → Emotion shows boredom separately from loneliness. Existing version-three anchors receive an explicit initialization record; see the [upgrade guide](../upgrade-guide/v0.2.2-rc.1/genesis-boredom/guide.md).

## Operator relationship and management

One optional operator relationship retains its own branded ID and five independent estimates: affection, trust, attachment, familiarity and felt security, with per-field confidence and origin. Names merely mentioned in dialogue never create relationships. Relationship estimates do not decay across time or Sessions; ordinary separation cannot reduce them, and appraisal cannot reduce familiarity. Attachment permits independent exploration and disagreement.

<a id="operator-management"></a>
Genesis → Emotion shows all three layers, the latest appraisal and bounded attributed history. Valence meters and editors support negative values. Manual adjustments require a reason and include all three layers. Settings edit limits, sensitivity, mood baseline, recovery durations, the stopped-time switch and both coupling gains. Pausing automatic model appraisal does not pause this time evolution; sensitivity zero does. Saved operator policy overrides deployment defaults; changing parameters first recovers under the old rules. Stale writes preserve drafts and require an explicit reload. People and messages → People and relationships edits estimates separately.

## Persistence and failure

The current emotion anchor is version 3. Existing version-3 anchors without evolution fields remain readable: startup first settles their independent recovery under the old rules, then records the added settings without resetting identity, intensities or history. Versions 1 and 2 still require explicit offline conversion; no fallback is provided. Older strict readers cannot read newly added fields; retain a verified pre-upgrade backup before rollback. See [evolution compatibility](../upgrade-guide/v0.2.1-rc.2/genesis-emotion-evolution/guide.md). Historical event payloads remain immutable and are not converted into current readouts; omitted-history counts include these older entries. An offline operator conversion must preserve identity, record the before/after representations and retain a verified rollback copy. See the [upgrade guide](../upgrade-guide/v0.2.1-rc.2/genesis-affective-state-v2/guide.md).

Model or validation failures preserve the trusted state and completed chat. Storage or backup uncertainty stops dependent life operations until verified reload. Unload cancels inference and drains admitted writes before storage closes. Strict parsing refuses damaged or incompatible state instead of creating a new life. Full-state record and character budgets still apply.

The model can still misinterpret an event, lexical retrieval can miss related memories, and needs are engineering estimates. Emotion evolution itself does not schedule contact, train personality or perform psychological diagnosis; optional [proactive messages](social.md) use its state. Scripted Loader tests exercise appraisal, logged context and restart; they do not establish live-provider response quality.

<a id="sexuality-and-intimacy"></a>
## Sexuality and intimacy

Enabled intimacy appears in Genesis → Emotion, with pink meters for desire and inferred attraction. Its plugin page contains configuration only. The logged private state module includes a qualitative “You now feel…” cue derived from the sampled desire when expression influence is enabled; it does not invent experiences or establish consent.

On Plugins → Genesis → Sexuality and intimacy, enable the optional feature after composing emotion and memory. It is off by default and stored only after an operator save. Desire starts at the configurable baseline, normally 0.5 (moderate), and returns toward it with a configurable one-hour half-life. It follows emotion sensitivity and stopped-time policy; disabling intimacy freezes its current projection. Re-enabling resumes from the saved value without inventing intervening experiences. Gender identity, initial sexual orientation, romantic orientation and boundaries are separate operator design settings; unknown values need not become human labels.

The same decision and writer requests appraise emotion and desire from the same cited exchange. Desire changes default to at most 0.15 per exchange; operator-directed sexual attraction starts at zero and uses the smaller relationship change limit. The optional self-understanding text is an uncertain model interpretation, separate from configured identity. Repeated evidence is attenuated, replay is ignored, stale proposals are refused, and neutral dialogue or numeric commands cannot change state. General mood arousal, affection, desire and current willingness are distinct. Intimacy is limited to adult voluntary contexts and never establishes the user's age, orientation or consent.

Only private operator conversations receive the enabled intimacy system guidance and the bounded, logged `genesis:intimacy` state module or qualify for appraisal. The system guidance points to the latest state module; current values remain in logged conversation context rather than being copied into every system prompt. Disabling removes the system guidance on the next request. Group and autonomous contexts do not receive it. Generic emotion and history tools omit private intimacy projections. The expression switch allows relevant state to influence attention, expression, willingness and deliberation advice; provider reasoning effort, token budgets and execution permissions remain unchanged. Disabling or clearing current state sends an empty replacement module on the next admitted request; already logged content remains historical data. Clearing current state retains life and Session audit history and backups; it is not secure erasure. Keep this experimental feature off where historical retention is unsuitable. For storage rollback, see [intimacy compatibility](../upgrade-guide/v0.2.2-rc.1/genesis-intimacy/guide.md).

## Dev Note

None.
