/** Validated Genesis durable records; independent of any model provider. @module */
import { z } from 'zod'
import { required } from './required.ts'
import { memoryOrganizationSchema } from './memory-organization.ts'
import { agencySchema } from './agency-state.ts'
import { initiativeSchema } from './social-state.ts'
import { appraisalSchema, appraisalEffectsSchema } from './relationship-state.ts'
import { emotionStateSchema } from './emotion-state.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { manifestSchema, recordTableSchema, recordValueSchema, type LifeRecordKey } from './storage-layout.ts'
import { memorySummarySchema } from './memory-summary.ts'
import { contactsStateSchema } from './contacts-model.ts'
import { peopleStateSchema, personSourceSchema, qqPersonId } from './people-model.ts'

/** Stable identity of one life, unrelated to Session and user identifiers. */
export type LifeId = Branded<'GenesisLifeId'>
/** Identifier of one durable life fact. */
export type LifeEventId = Branded<'GenesisLifeEventId'>
/** Identifier of one retained memory. */
export type MemoryId = Branded<'GenesisMemoryId'>
/** Stable identifier of an evolving interest. */
export type InterestId = Branded<'GenesisInterestId'>
/** Identifier of a runtime tool capability. */
export type CapabilityId = Branded<'GenesisCapabilityId'>
/** Identifier of a growth record. */
export type GrowthId = Branded<'GenesisGrowthId'>

const lifeId = z.uuid().transform(brandString<LifeId>)
const eventId = z.uuid().transform(brandString<LifeEventId>)
const memoryId = z.uuid().transform(brandString<MemoryId>)
const interestId = z.uuid().transform(brandString<InterestId>)
const growthId = z.uuid().transform(brandString<GrowthId>)
const capabilityId = z
  .string()
  .min(1)
  .max(512)
  .transform(brandString<CapabilityId>)
const timestamp = z.iso.datetime()
const identitySchema = z.strictObject({
  id: lifeId,
  name: z.string().min(1).max(200).nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  lifeCoreVersion: z.string().min(1),
  origin: z.strictObject({ framework: z.literal('DeepSeek Harness'), initialVersion: z.literal('0.1.0-alpha.1') }),
})
/** Explicit operator identity, shared across all conversations of this life. */
export const operatorIdentitySchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  identity: z.string().trim().max(800),
})
/** Human-authored identity description; never inferred from dialogue or memories. */
export type OperatorIdentity = z.infer<typeof operatorIdentitySchema>
const eventSchema = z.strictObject({
  id: eventId,
  lifeId,
  type: z.string().regex(/^[a-z]+\.[a-z]+$/),
  timestamp,
  source: z.enum(['system', 'user', 'agent', 'tool']),
  payload: z.record(z.string(), z.json()),
  dedupKey: z.string().min(1).max(1000),
  relatedSessionId: z.string().optional(),
  relatedEventId: z.string().optional(),
})
/** Validation at model/tool input and durable memory reads. */
export const memoryInputSchema = z.strictObject({
  category: z.enum(['episodic', 'semantic', 'self', 'procedural']),
  content: z.string().trim().min(1).max(8000),
  importance: z.number().min(0).max(1),
  summary: memorySummarySchema.optional(),
  organization: memoryOrganizationSchema.optional(),
  // Complete source references share the whole-life storage budget, including historical revisions.
  sourceEventIds: z.array(eventId).min(1),
  confidence: z.number().min(0).max(1),
  kind: z.enum(['declarative', 'non-declarative']).optional(),
  attribution: z.enum(['user-stated', 'model-inference']).optional(),
})
/** Cached semantic vector with an exact embedding-space identifier. */
export const embeddingSchema = z
  .strictObject({
    space: z.string().min(1),
    vector: z.array(z.number()).min(1).max(65536),
  })
  .refine(value => value.vector.some(component => component !== 0), 'Embedding must be nonzero')
/** A conditional learned tendency supported by independent completed user exchanges. */
export const habitSchema = z.strictObject({
  cue: z.string().trim().min(1).max(1000),
  response: z.string().trim().min(1).max(2000),
  supportEventIds: z.array(eventId).min(1).max(100),
  active: z.boolean(),
})
/** Durable maintenance cursor; pending work survives a restart and does not schedule itself recursively. */
export const consolidationSchema = z
  .strictObject({
    revision: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    sessionId: z
      .string()
      .transform(brandString<SessionId>)
      .optional(),
    enabled: z.boolean().optional(),
    requestedAt: timestamp,
    failures: z.number().int().nonnegative(),
    lastAttemptAt: timestamp.optional(),
    lastRunAt: timestamp.optional(),
    changes: z.number().int().nonnegative().optional(),
    failure: z
      .strictObject({
        stage: z.enum(['evidence', 'configuration', 'decision', 'retrieval', 'writer', 'embedding', 'storage']),
        code: z.string(),
        message: z.string(),
      })
      .optional(),
  })
  .refine(value => value.completed <= value.revision, 'Invalid consolidation cursor')
/** One interpreted version; its timestamps describe recorded understanding, not the truth of a claim. */
export const memoryRevisionSchema = memoryInputSchema.extend({
  habit: habitSchema.optional(),
  recordedAt: timestamp,
  supersededAt: timestamp,
})
/** Source-grounded time span and associative topics of a remembered interaction. */
export const experienceSchema = z
  .strictObject({
    sessionId: z.string().transform(brandString<SessionId>),
    startedAt: timestamp,
    endedAt: timestamp,
    topics: z.array(z.string().trim().min(1).max(80)).max(16),
  })
  .refine(value => value.startedAt <= value.endedAt, 'Experience starts after it ends')
const memorySchema = memoryInputSchema.extend({
  id: memoryId,
  lifeId,
  createdAt: timestamp,
  updatedAt: timestamp,
  habit: habitSchema.optional(),
  history: z.array(memoryRevisionSchema).optional(),
  experience: experienceSchema.optional(),
  experienceIds: z.array(memoryId).max(100).optional(),
  embedding: embeddingSchema.optional(),
})
const capabilitySchema = z.strictObject({
  id: capabilityId,
  declarationHash: z.string(),
  firstSeenAt: timestamp,
  changedAt: timestamp,
  available: z.boolean(),
  permission: z.literal('checked-at-execution'),
  verification: z.enum(['unverified', 'succeeded', 'failed']),
})
const growthSchema = z.strictObject({
  id: growthId,
  lifeId,
  timestamp,
  category: z.literal('system'),
  title: z.string(),
  description: z.string(),
  relatedEventIds: z.array(eventId).min(1),
})
/** Current interpretation backed by distinct completed exchanges, not an established fact. */
export const interestSchema = z.strictObject({
  id: interestId,
  lifeId,
  topic: z.string().trim().min(1).max(80),
  stage: z.enum(['contact', 'curious', 'exploring', 'enduring', 'dormant']),
  createdAt: timestamp,
  updatedAt: timestamp,
  reason: z.string().trim().min(1).max(400),
  evidence: z
    .array(
      z.strictObject({
        sessionId: z.string().transform(brandString<SessionId>),
        startSeq: z.number().int().nonnegative(),
        signal: z.enum(['contact', 'curiosity', 'exploration', 'return', 'disinterest']),
        selfInitiated: z.boolean(),
        sourceEventIds: z.array(eventId).min(1).max(20),
      }),
    )
    .min(1)
    .max(100),
})
/** Complete atomic life snapshot. Unknown schema versions are refused, never reset. */
const stateFieldsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  identity: identitySchema,
  contacts: contactsStateSchema.optional(),
  people: peopleStateSchema.optional(),
  emotion: emotionStateSchema.optional(),
  interests: z.array(interestSchema).optional(),
  agency: agencySchema.optional(),
  initiative: initiativeSchema.optional(),
  operator: operatorIdentitySchema.extend({ revision: z.number().int().positive() }).optional(),
  suppressedHabitEvidence: z.array(eventId).optional(),
  events: z.array(eventSchema),
  memories: z.array(memorySchema),
  growth: z.array(growthSchema),
  sessions: z.record(z.string(), z.array(capabilitySchema)),
  consolidation: consolidationSchema.optional(),
})

type ParsedLifeState = z.infer<typeof stateFieldsSchema>
const projectionSchema = stateFieldsSchema.omit({ events: true, growth: true })

/** Indexed append-only evidence; rollback removes only additions owned by the current commit. */
class LifeHistoryIndex {
  private readonly events: LifeEvent[] = []
  private readonly growth: GrowthRecord[] = []
  private readonly byId = new Map<string, { event: LifeEvent; ordinal: number }>()
  private readonly keys = new Set<string>()
  private readonly types = new Map<string, LifeEvent[]>()
  private readonly growthIds = new Set<string>()
  readonly interestIds = new Map<LifeEvent['payload'][string] | undefined, number>()

  get eventCount(): number {
    return this.events.length
  }
  get growthCount(): number {
    return this.growth.length
  }
  get(id: string): LifeEvent | undefined {
    return this.byId.get(id)?.event
  }
  has(id: string): boolean {
    return this.byId.has(id)
  }
  hasKey(key: string): boolean {
    return this.keys.has(key)
  }
  ofType(type: string): readonly LifeEvent[] {
    return this.types.get(type) ?? []
  }
  last(types: readonly string[]): LifeEvent | undefined {
    let latest: { event: LifeEvent; ordinal: number } | undefined
    for (const type of types) {
      const event = this.ofType(type).at(-1)
      const candidate = event === undefined ? undefined : this.byId.get(event.id)
      if (candidate !== undefined && (latest === undefined || candidate.ordinal > latest.ordinal)) latest = candidate
    }
    return latest?.event
  }
  append(events: readonly LifeEvent[], growth: readonly GrowthRecord[], lifeId: LifeId): void {
    for (const event of events) {
      if (event.lifeId !== lifeId || this.byId.has(event.id) || this.keys.has(event.dedupKey)) {
        throw validationError('Invalid life event ownership or duplicate')
      }
      this.byId.set(event.id, { event, ordinal: this.events.length })
      this.keys.add(event.dedupKey)
      this.events.push(event)
      const group = this.types.get(event.type) ?? []
      group.push(event)
      this.types.set(event.type, group)
      if (event.type === 'interest.changed') {
        const id = event.payload['interestId']
        this.interestIds.set(id, (this.interestIds.get(id) ?? 0) + 1)
      }
    }
    for (const record of growth) {
      if (record.lifeId !== lifeId || this.growthIds.has(record.id)) throw validationError('Invalid record ownership or duplicate')
      this.growth.push(record)
      this.growthIds.add(record.id)
    }
  }
  truncate(eventCount: number, growthCount: number): void {
    while (this.events.length > eventCount) {
      const event = required(this.events.pop(), validationError('Genesis rollback event is missing.'))
      this.byId.delete(event.id)
      this.keys.delete(event.dedupKey)
      const group = required(this.types.get(event.type), validationError('Genesis rollback event type index is missing.'))
      group.pop()
      if (!group.length) this.types.delete(event.type)
      if (event.type === 'interest.changed') {
        const id = event.payload['interestId']
        const remaining = required(this.interestIds.get(id), validationError('Genesis rollback interest index is missing.')) - 1
        if (remaining) this.interestIds.set(id, remaining)
        else this.interestIds.delete(id)
      }
    }
    while (this.growth.length > growthCount) {
      const record = required(this.growth.pop(), validationError('Genesis rollback growth record is missing.'))
      this.growthIds.delete(record.id)
    }
  }
}

function validationError(message: string): z.ZodError {
  return new z.ZodError([{ code: 'custom', path: [], message }])
}

function checkStateRelations(
  state: ParsedLifeState,
  context: z.RefinementCtx,
  history: LifeHistoryIndex,
  events: readonly LifeEvent[],
  growth: readonly GrowthRecord[],
): void {
  if (state.contacts !== undefined) {
    const operators = state.contacts.items.filter(contact => contact.operator)
    if (operators.length > 1 || (state.contacts.operatorConfigured && operators[0]?.personId !== state.people?.operatorPersonId)) {
      context.addIssue({ code: 'custom', message: 'Contact operator and people projection disagree' })
    }
    if (new Set(state.contacts.items.map(item => item.personId)).size !== state.contacts.items.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate contact person ID' })
    }
    for (const contact of state.contacts.items) {
      if (
        !(
          history.get(contact.sourceEventId)?.type === 'contact.saved' &&
          history.get(contact.sourceEventId)?.payload['personId'] === contact.personId
        )
      ) {
        context.addIssue({ code: 'custom', message: 'Contact update evidence is missing' })
      }
    }
  }
  if (state.people !== undefined) {
    const people = state.people
    if (
      new Set(people.people.map(person => person.id)).size !== people.people.length ||
      new Set(people.conversations.map(item => item.sessionId)).size !== people.conversations.length
    ) {
      context.addIssue({ code: 'custom', message: 'Duplicate person or conversation identity' })
    }
    for (const person of people.people) {
      if (
        person.id !== qqPersonId(person.accountId) ||
        person.relationship.personId !== person.id ||
        person.relationship.scope !== 'person' ||
        person.sourceEventIds.some(id => !history.has(id))
      ) {
        context.addIssue({ code: 'custom', message: 'Person relationship has invalid ownership or source evidence' })
      }
    }
  }
  for (const event of events) {
    if (event.payload['participant'] !== undefined && !personSourceSchema.safeParse(event.payload['participant']).success) {
      context.addIssue({ code: 'custom', message: 'Invalid authenticated participant metadata' })
    }
  }
  const ids = history
  const reject = (message: string) => {
    context.addIssue({ code: 'custom', message })
  }
  if (history.ofType('life.created').length !== 1) reject('Exactly one birth event is required')
  const interestBirths = history.ofType('interest.initialized')
  if (state.interests === undefined ? interestBirths.length > 0 : interestBirths.length !== 1)
    reject('Interest state and initialization evidence must be present together')
  if (new Set(state.interests?.map(item => item.id)).size !== (state.interests?.length ?? 0)) reject('Duplicate interest')
  for (const interest of state.interests ?? []) {
    if (interest.lifeId !== state.identity.id || interest.evidence.some(item => item.sourceEventIds.some(id => !ids.has(id))))
      reject('Invalid interest ownership or evidence')
    if (new Set(interest.evidence.map(item => `${item.sessionId}:${item.startSeq}`)).size !== interest.evidence.length)
      reject('Duplicate interest exchange')
  }
  for (const interestId of history.interestIds.keys()) {
    if (!state.interests?.some(item => item.id === interestId)) reject('Interest change refers to an absent interest')
  }
  for (const event of events.filter(item => item.type === 'interest.changed')) {
    const sources = event.payload['sourceEventIds']
    if (!Array.isArray(sources) || sources.length === 0 || sources.some(id => typeof id !== 'string' || !ids.has(id)))
      reject('Missing interest change evidence')
  }
  if (state.suppressedHabitEvidence?.some(id => !ids.has(id))) reject('Missing suppressed habit evidence')
  const emotionBirths = history.ofType('emotion.initialized')
  if ((state.emotion === undefined && emotionBirths.length > 0) || (state.emotion !== undefined && emotionBirths.length !== 1)) {
    reject('Emotion state and its initialization evidence must be present together')
  }
  if (state.emotion !== undefined) {
    const intimacyChange = history.last(['intimacy.configured', 'intimacy.cleared'])
    if ((intimacyChange?.type === 'intimacy.configured') !== (state.emotion.intimacy !== undefined)) {
      reject('Intimacy state does not match its initialization or explicit clearing record')
    }
    const initializedBoredom = history.hasKey('emotion:boredom:initialized')
    const birthState = emotionBirths[0]?.payload['state']
    const bornWithBoredom =
      birthState !== null && typeof birthState === 'object' && !Array.isArray(birthState) && birthState['boredom'] !== undefined
    if ((initializedBoredom || bornWithBoredom) && state.emotion.boredom === undefined) reject('Initialized boredom state is missing')
    const initial = emotionBirths[0]?.payload['state']
    const currentBirth = initial !== null && typeof initial === 'object' && !Array.isArray(initial) && initial['version'] === 3
    const conversions = history.ofType('emotion.upgraded').filter((event) => {
      const after = event.payload['after']
      return (
        event.type === 'emotion.upgraded' && after !== null && typeof after === 'object' && !Array.isArray(after) && after['version'] === 3
      )
    })
    if (!currentBirth && conversions.length !== 1) reject('Emotion version 3 requires explicit conversion evidence')
  }
  for (const event of events.filter(event => event.type === 'emotion.reviewed')) {
    if (event.payload['appraisal'] !== undefined && !appraisalSchema.safeParse(event.payload['appraisal']).success)
      reject('Invalid emotion appraisal')
    if (event.payload['effects'] !== undefined && !appraisalEffectsSchema.safeParse(event.payload['effects']).success)
      reject('Invalid emotion effects')
    const sources = event.payload['sourceEventIds']
    if (!Array.isArray(sources) || sources.some(id => typeof id !== 'string' || !ids.has(id))) reject('Missing emotion source evidence')
  }
  const agency = state.agency
  const interactions = state.initiative?.records ?? []
  if (state.initiative?.eventCursor !== undefined && !ids.has(state.initiative.eventCursor)) reject('Invalid initiative cursor')
  if (
    new Set(interactions.map(item => item.key)).size !== interactions.length ||
    new Set(interactions.map(item => item.id)).size !== interactions.length
  )
    reject('Duplicate initiative opportunity')
  for (const item of interactions) {
    if (
      !ids.has(item.sourceEventId) ||
      (item.decisionId !== undefined &&
        !agency?.decisions.some(
          decision => decision.id === item.decisionId && decision.purpose === 'interaction' && decision.sessionId === item.sessionId,
        ))
    )
      reject('Invalid initiative evidence or decision')
  }
  const agencyBirths = history.ofType('agency.initialized')
  if (agency === undefined ? agencyBirths.length > 0 : agencyBirths.length !== 1) reject('Agency state requires initialization evidence')
  if (agency !== undefined) {
    for (const collection of [agency.motivations, agency.goals, agency.decisions]) {
      if (new Set(collection.map(item => item.id)).size !== collection.length) reject('Duplicate agency record')
      for (const item of collection) if (item.sourceEventIds.some(id => !ids.has(id))) reject('Missing agency source event')
    }
    if (new Set(agency.decisions.map(item => item.key)).size !== agency.decisions.length) reject('Duplicate deliberation key')
    const motivationIds = new Set(agency.motivations.map(item => item.id))
    const goalIds = new Set(agency.goals.map(item => item.id))
    const decisionIds = new Set(agency.decisions.map(item => item.id))
    for (const goal of agency.goals) {
      if (
        goal.motivationIds.some(id => !motivationIds.has(id)) ||
        goal.history.some(item => !decisionIds.has(item.decisionId)) ||
        goal.history.at(-1)?.status !== goal.status ||
        goal.history.at(-1)?.nextAction !== goal.nextAction
      )
        reject('Invalid life goal history')
    }
    for (const decision of agency.decisions) {
      if (
        decision.goalIds.some(id => !goalIds.has(id)) ||
        decision.motivationIds.some(id => !motivationIds.has(id)) ||
        decision.outcome.sourceEventIds.some(id => !ids.has(id))
      )
        reject('Invalid decision references')
    }
  }
  const born = history.ofType('life.created')[0]
  if (born?.timestamp !== state.identity.createdAt) reject('Birth timestamp differs from identity')
  const operatorEvents = history.ofType('life.operator')
  const operatorEvent = operatorEvents.at(-1)
  if (
    state.operator === undefined
      ? operatorEvents.length > 0
      : operatorEvents.length !== state.operator.revision ||
        operatorEvent?.source !== 'user' ||
        operatorEvent.payload['revision'] !== state.operator.revision ||
        operatorEvent.payload['name'] !== state.operator.name ||
        operatorEvent.payload['identity'] !== state.operator.identity
  ) {
    reject('Operator identity differs from its explicit source history')
  }
  for (const records of [state.memories, growth]) {
    const recordIds = new Set<string>()
    for (const record of records) {
      if (record.lifeId !== state.identity.id || recordIds.has(record.id)) reject('Invalid record ownership or duplicate')
      recordIds.add(record.id)
      const refs = 'sourceEventIds' in record ? record.sourceEventIds : record.relatedEventIds
      if (refs.some(id => !ids.has(id))) reject('Missing source event')
    }
  }
  for (const memory of state.memories) {
    if (
      memory.habit !== undefined &&
      (memory.category !== 'procedural' ||
        memory.attribution !== 'model-inference' ||
        memory.habit.supportEventIds.some(
          id =>
            !memory.sourceEventIds.includes(id) ||
            !(history.get(id)?.source === 'user' && history.get(id)?.payload['kind'] === 'user-message'),
        ))
    ) {
      reject('Invalid learned habit evidence or category')
    }
    if (memory.experience !== undefined && memory.category !== 'episodic') reject('Experience must be episodic')
    if (memory.history?.some(version => version.sourceEventIds.some(id => !ids.has(id)) || version.recordedAt >= version.supersededAt))
      reject('Invalid memory version evidence or interval')
    if (memory.experienceIds?.some(id => !state.memories.some(item => item.id === id && item.experience !== undefined))) {
      reject('Missing associated experience')
    }
  }
  for (const capabilities of Object.values(state.sessions)) {
    if (new Set(capabilities.map(capability => capability.id)).size !== capabilities.length) reject('Duplicate capability')
  }
}

/** Complete structural and relational validation for durable reads, imports and initial state. */
export const stateSchema = stateFieldsSchema.superRefine((state, context) => {
  const history = new LifeHistoryIndex()
  try {
    history.append(state.events, state.growth, state.identity.id)
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error
    for (const issue of error.issues) context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    return
  }
  checkStateRelations(state, context, history, state.events, state.growth)
})

/** Incremental validation owned by one serialized writer, initialized from fully validated state. */
export class LifeStateValidator {
  private readonly history = new LifeHistoryIndex()
  private readonly lifeId: LifeId

  /** @param state - Fully validated committed state whose historical objects remain immutable. */
  constructor(state: LifeState) {
    this.lifeId = state.identity.id
    this.history.append(state.events, state.growth, this.lifeId)
  }

  /**
   * Validate current projections and appended history, then retain indexes only after publication succeeds.
   * @param state - Candidate with an unchanged historical prefix and stable life identity; calls must be serialized.
   * @param publish - Durable publication; rejection rolls back index additions and remains owned by the caller.
   * @returns After successful publication, or rejects without retaining candidate indexes.
   */
  async commit(state: LifeState, publish: () => Promise<void>): Promise<void> {
    const eventCount = this.history.eventCount
    const growthCount = this.history.growthCount
    if (state.identity.id !== this.lifeId || state.events.length < eventCount || state.growth.length < growthCount) {
      throw validationError('Life identity and append-only history must be preserved')
    }
    const events = state.events.slice(eventCount)
    const growth = state.growth.slice(growthCount)
    const { events: _events, growth: _growth, ...projection } = state
    projectionSchema.parse(projection)
    z.array(eventSchema).parse(events)
    z.array(growthSchema).parse(growth)
    try {
      this.history.append(events, growth, this.lifeId)
      z.custom<LifeState>()
        .superRefine((candidate, context) => {
          checkStateRelations(candidate, context, this.history, events, growth)
        })
        .parse(state)
      await publish()
    } catch (error) {
      this.history.truncate(eventCount, growthCount)
      throw error
    }
  }
}

/** Atomic commit descriptor; legacy complete snapshots remain readable for conversion. */
export const lifeDomain = defineDomain({
  name: 'genesis',
  version: 1,
  tables: {
    states: domainTable<'life', z.infer<typeof stateSchema> | z.infer<typeof manifestSchema>>(z.union([stateSchema, manifestSchema])),
  },
})
/** Immutable components; the life manifest alone determines which records are committed. */
export const lifeRecordsDomain = defineDomain({
  name: 'genesis_records',
  version: 1,
  layout: 'per-record',
  tables: Object.fromEntries(
    recordTableSchema.options.map(table => [table, domainTable<LifeRecordKey, z.infer<typeof recordValueSchema>>(recordValueSchema)]),
  ),
})
/** Persisted identity restored before any Agent is bound. */
export type LifeIdentity = z.infer<typeof identitySchema>
/** Durable, deduplicated fact with explicit attribution. */
export type LifeEvent = z.infer<typeof eventSchema>
/** Sourced memory; confidence does not establish factual truth. */
export type LifeMemory = z.infer<typeof memorySchema>
/** Current sourced interest interpretation. */
export type LifeInterest = z.infer<typeof interestSchema>
/** Time, conversation and topics attached to one remembered experience. */
export type MemoryExperience = z.infer<typeof experienceSchema>
/** Superseded interpretation with its original evidence and recording interval. */
export type MemoryRevision = z.infer<typeof memoryRevisionSchema>
/** Memory creation fields supplied by a caller. */
export type MemoryInput = z.infer<typeof memoryInputSchema>
/** Persisted vector cache; it can be rebuilt from the local memory text. */
export type MemoryEmbedding = z.infer<typeof embeddingSchema>
/** Capability availability belongs to its Session scope; permission is evaluated on execution. */
export type CapabilityState = z.infer<typeof capabilitySchema>
/** Persistent system growth linked to life facts. */
export type GrowthRecord = z.infer<typeof growthSchema>
/** Atomic persistent state including the most recently observed Session tool views. */
export type LifeState = z.infer<typeof stateFieldsSchema>

/** Conditional response and its actual user evidence. */
export type MemoryHabit = z.infer<typeof habitSchema>
/** Persistent maintenance work and last safe outcome. */
export type MemoryConsolidation = z.infer<typeof consolidationSchema>
