/** Atomic life state, sourced memory retrieval and observed system growth. @module */
import { searchText, memoryDocument } from './search.ts'
import { applyDeliberation, type DeliberationCommit } from './agency.ts'
import { applyPlanChange, type PlanChange } from './planning.ts'
import type { DecisionId, LifeDecision, LifeGoalId } from './agency-state.ts'
import { resolveInitiative, type InitiativeSettings, type InteractionRecord, type InteractionId } from './social-state.ts'
import { randomUUID, createHash } from 'node:crypto'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolSchema, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { MemoryDraft, ReviewFailure } from './status-types.ts'
import type { Config } from './config.ts'
import { operatorIdentitySchema, type OperatorIdentity } from './model.ts'
import type { MemoryRelabel } from './participants.ts'
import { GenesisError } from './error.ts'
import { splitState, joinState } from './storage-state.ts'
import type { LifeRecordReference } from './storage-layout.ts'
import type { InterestDialogue } from './interest-projection.ts'
import type { InterestProposal } from './interest.ts'
import { emotionAt, initialEmotion, resolveEmotion, type EmotionUpdate, type EmotionSettings, type EmotionAdjustment, type StoredEmotionState } from './emotion-state.ts'
import { type RelationshipAdjustment, type RelationshipId } from './relationship-state.ts'
import type { EmotionDialogue } from './emotion-projection.ts'
import { applyAppraisal } from './emotion-appraisal.ts'
import { backupPath, hasBackup, writeBackup } from './backup.ts'
import { applyConsolidation, queueConsolidation, type ConsolidationCommit, type ReviewEvidence } from './consolidation-state.ts'
import { retainMemoryHistory } from './memory-history.ts'
import { organizationSources, organizationReplay, appendOrganizedMemory, type OrganizedMemory } from './organization.ts'
import type { MemoryOrganizationRequest } from './status-types.ts'
import { memoryTimeText, readMemory } from './memory-time.ts'
import { isImplicit } from './personality.ts'
import { lifeDomain, memoryInputSchema, experienceSchema, habitSchema, stateSchema, lifeRecordsDomain } from './model.ts'
import { memorySummarySchema } from './memory-summary.ts'
import { applyPeople } from './people.ts'
import { memoryVisible } from './memory-access.ts'
import { conversationSchema, peopleStateSchema, personSourceSchema, type LifeConversation, type PersonId, type PersonSource } from './people-model.ts'
import { conversationMemories, type ConversationMemoryScope } from './conversation-memory.ts'
import type { CapabilityId, GrowthId, LifeEvent, LifeEventId, LifeId, LifeMemory, LifeState, MemoryId, MemoryInput, MemoryEmbedding, MemoryExperience, InterestId, LifeInterest } from './model.ts'

/** One independently generated, validated change committed with its review marker. */
export type MemoryChange = { action: 'delete'; id: MemoryId }
  | { action: 'upsert'; id?: MemoryId; input: MemoryInput; embedding: MemoryEmbedding }

/** Writer-selected summary with Host-derived conversation, time and source references. */
export interface ExperienceChange {
  id?: MemoryId
  input: MemoryInput
  details: MemoryExperience
  embedding: MemoryEmbedding
}

/** Bounded event query, ordered by recorded time. */
export interface EventQuery {
  type?: string
  after?: string
  before?: string
  limit: number
}
/** Replaceable lexical retrieval request with explicit output bounds. */
export interface MemoryQuery {
  /** Actual model-facing caller; omission is reserved for authenticated host management. */
  sessionId?: SessionId
  text: string
  category?: LifeMemory['category']
  after?: string
  before?: string
  limit: number
  chars: number
  /** Budget only rendered current content for model recall; returned records retain internal source references. */
  contentOnly?: boolean
}
/** Real Session evidence; no message bodies or tool results are copied automatically. */
export interface ObservedInteraction {
  /** Authenticated transport author; omitted for the existing operator-only channel. */
  participant?: PersonSource | undefined
  sessionId: SessionId
  eventId: string
  timestamp: string
  kind: 'user-message' | 'assistant-message' | 'tool-result'
  tool?: string
  success?: boolean
}


function fact(state: LifeState, type: string, dedupKey: string, payload: LifeEvent['payload'],
  source: LifeEvent['source'] = 'system', sessionId?: string, relatedEventId?: string, at = new Date().toISOString()): LifeEvent {
  const previous = state.events.find(event => event.dedupKey === dedupKey)
  if (previous !== undefined) return previous
  const event: LifeEvent = {
    id: brandString<LifeEventId>(randomUUID()), lifeId: state.identity.id, type, timestamp: at,
    source, payload, dedupKey,
    ...(sessionId === undefined ? {} : { relatedSessionId: sessionId }),
    ...(relatedEventId === undefined ? {} : { relatedEventId }),
  }
  state.events.push(event)
  return event
}
function emotionRecord(state: StoredEmotionState) {
  const { controls, offlineChanges, moodEmotionScale, emotionMoodInfluence, ...anchor } = state
  const record = { ...anchor, ...(controls === undefined ? {} : { controls }),
    ...(offlineChanges === undefined ? {} : { offlineChanges }),
    ...(moodEmotionScale === undefined ? {} : { moodEmotionScale }),
    ...(emotionMoodInfluence === undefined ? {} : { emotionMoodInfluence }) }
  return record
}
function grow(state: LifeState, event: LifeEvent, title: string, description: string): void {
  fact(state, 'growth.recorded', `growth:${event.id}`, { relatedEventId: event.id, title })
  state.growth.push({ id: brandString<GrowthId>(randomUUID()), lifeId: state.identity.id,
    timestamp: event.timestamp, category: 'system', title, description, relatedEventIds: [event.id] })
}

/**
 * One life owner. Writes serialize components and replace one manifest, so facts
 * and state commit together. Storage failures poison this instance until reload;
 * validation and capacity refusals leave it usable. Returned data is detached.
 */
export class LifeCore {
  /**
   * Bind an authenticated platform route to one durable Session before accepting messages.
   * @param conversation - Exact route and reserved Session; reuse may not silently replace it.
   * @param operatorPersonId - Explicit deployment binding, never inferred from a name or relationship.
   * @returns After the route is durable; conflicting routes or operator identities are refused.
   */
  bindConversation(conversation: LifeConversation, operatorPersonId?: PersonId): Promise<void> {
    const parsed = conversationSchema.parse(conversation)
    return this.change((state) => {
      const people = state.people ??= peopleStateSchema.parse({ version: 1, people: [], conversations: [] })
      const old = people.conversations.find(item => item.id === parsed.id || item.sessionId === parsed.sessionId)
      if (old !== undefined && JSON.stringify(old) !== JSON.stringify(parsed)) {
        throw new GenesisError('configuration-conflict', 'The QQ conversation already belongs to another Session. Restore its recorded Session before accepting messages.')
      }
      if (operatorPersonId !== undefined && people.operatorPersonId !== undefined && people.operatorPersonId !== operatorPersonId) {
        throw new GenesisError('configuration-conflict', 'The QQ operator binding differs from saved life data. Verify the existing operator before changing it.')
      }
      if (operatorPersonId !== undefined) people.operatorPersonId = operatorPersonId
      if (old === undefined) {
        people.conversations.push(parsed)
        fact(state, 'conversation.bound', `conversation:${parsed.id}`, { id: parsed.id, sessionId: parsed.sessionId, kind: parsed.kind, ...(parsed.personId === undefined ? {} : { personId: parsed.personId }) }, 'system', parsed.sessionId)
      }
    })
  }

  /**
   * Confirm successful Session publication before any external input can be reserved.
   * @param sessionId - Successfully created or resumed bound Session.
   * @returns After the publication marker is durable; repeats are idempotent.
   */
  confirmConversationSession(sessionId: SessionId): Promise<void> {
    return this.change((state) => {
      if (!state.people?.conversations.some(item => item.sessionId === sessionId)) throw new GenesisError('invalid-source', 'The external Session has no conversation binding.')
      fact(state, 'conversation.opened', `conversation-opened:${sessionId}`, {}, 'system', sessionId)
    })
  }

  /**
   * Delete a retained profile, earlier account recognition and memories citing that person's messages, preserving audited Session evidence.
   * @param personId - Explicit operator-selected identity; names cannot select a person.
   * @param updatedAt - Optional displayed profile version; changed or missing profiles refuse deletion.
   * @returns Whether a retained profile existed; raw Session logs require separate lifecycle deletion.
   */
  forgetPerson(personId: PersonId, updatedAt?: string): Promise<boolean> {
    return this.change((state) => {
      const people = state.people
      if (people === undefined) {
        if (updatedAt !== undefined) throw new GenesisError('configuration-conflict', 'This relationship is no longer retained. Refresh the people list.')
        return false
      }
      const old = people.people.find(item => item.id === personId)
      if (updatedAt !== undefined && old?.updatedAt !== updatedAt) throw new GenesisError('configuration-conflict', 'This relationship changed. Refresh before forgetting it.')
      const sources = new Set(state.events.filter((event) => {
        const parsed = personSourceSchema.safeParse(event.payload['participant'])
        return parsed.success && parsed.data.personId === personId
      }).map(event => event.id))
      const removed = new Set(state.memories.filter(memory => memory.sourceEventIds.some(id => sources.has(id))
        || memory.history?.some(version => version.sourceEventIds.some(id => sources.has(id)))).map(memory => memory.id))
      let expanded = true
      while (expanded) {
        expanded = false
        for (const memory of state.memories) {
          if (!removed.has(memory.id) && memory.experienceIds?.some(id => removed.has(id))) {
            removed.add(memory.id)
            expanded = true
          }
        }
      }
      for (const id of removed) unlinkExperience(state, id)
      state.memories = state.memories.filter(memory => !removed.has(memory.id))
      people.people = people.people.filter(person => person.id !== personId)
      if (personId === people.operatorPersonId && state.emotion !== undefined) state.emotion.relationship = null
      if (old !== undefined || removed.size > 0 || sources.size > 0) fact(state, 'person.forgotten', `person-forgotten:${randomUUID()}`,
        { personId, memories: removed.size, sessionEvidenceRetained: true }, 'user')
      return old !== undefined
    })
  }

  /**
   * Reserve one authenticated platform delivery before queueing it; uncertain deliveries are never replayed automatically.
   * @param sessionId - Previously bound route's Session.
   * @param source - Validated transport author and external message identifier.
   * @param digest - Hash of the complete admitted content, preventing conflicting retries.
   * @returns Whether this caller reserved the delivery; an identical replay returns false.
   */
  reservePersonMessage(sessionId: SessionId, source: PersonSource, digest: string): Promise<boolean> {
    const parsed = personSourceSchema.parse(source)
    return this.change((state) => {
      if (!state.people?.conversations.some(item => item.id === parsed.conversationId && item.sessionId === sessionId)) {
        throw new GenesisError('invalid-source', 'QQ input has no verified conversation binding.')
      }
      const key = `person-message:${parsed.conversationId}:${parsed.messageId}`
      const old = state.events.find(event => event.dedupKey === key)
      if (old !== undefined) {
        if (old.payload['digest'] !== digest || old.payload['personId'] !== parsed.personId) {
          throw new GenesisError('invalid-source', 'A repeated QQ message has conflicting author or content. Inspect the transport before retrying.')
        }
        return false
      }
      fact(state, 'message.reserved', key, { participant: parsed, digest, personId: parsed.personId,
        delivery: 'reserved-not-confirmed' }, 'system', sessionId)
      return true
    })
  }

  /**
   * Reserve one external assistant delivery before calling the platform; a crash leaves an explicit unknown result.
   * @param sessionId - Bound channel Session containing the committed assistant message.
   * @param seq - Committed assistant event sequence, unique within that Session.
   * @param parts - Complete number of planned outbound chunks.
   * @returns Whether this caller owns the send; replay never sends twice.
   */
  reserveQqReply(sessionId: SessionId, seq: number, parts: number): Promise<boolean> {
    return this.change((state) => {
      if (!state.people?.conversations.some(item => item.sessionId === sessionId)) throw new GenesisError('invalid-source', 'QQ reply has no bound conversation.')
      const key = `qq-send:${sessionId}:${seq}`
      if (state.events.some(event => event.dedupKey === key)) return false
      fact(state, 'qq.reserved', key, { parts, status: 'uncertain' }, 'system', sessionId, String(seq))
      return true
    })
  }

  /**
   * Record actual platform acknowledgements, retaining partial sends and unknown outcomes without retrying them.
   * @param sessionId - Reserved reply's Session.
   * @param seq - Assistant event sequence.
   * @param status - Confirmed only when every planned chunk was acknowledged.
   * @param messageIds - Actual OneBot message identifiers received before settlement.
   * @returns After the append-only receipt is durable; repeated identical receipts are idempotent.
   */
  settleQqReply(sessionId: SessionId, seq: number, status: 'confirmed' | 'uncertain', messageIds: string[]): Promise<void> {
    return this.change((state) => {
      const reservation = state.events.find(event => event.dedupKey === `qq-send:${sessionId}:${seq}`)
      if (reservation === undefined || (status === 'confirmed' && reservation.payload['parts'] !== messageIds.length)) {
        throw new GenesisError('invalid-source', 'QQ confirmation requires actual acknowledgements for every reserved part.')
      }
      const key = `qq-receipt:${sessionId}:${seq}`
      const previous = state.events.find(event => event.dedupKey === key)
      if (previous !== undefined && (previous.payload['status'] !== status || JSON.stringify(previous.payload['messageIds']) !== JSON.stringify(messageIds))) {
        throw new GenesisError('configuration-conflict', 'QQ delivery already has a different outcome. Inspect the platform instead of sending again.')
      }
      fact(state, 'qq.receipt', key, { status, messageIds }, 'system', sessionId, String(seq))
    })
  }
  /**
   * Check whether a model conversation may use operator-owned tools and legacy private memories.
   * @param sessionId - Actual invoking Session.
   * @returns False for groups and unbound external people; familiarity never grants authority.
   */
  isOperatorSession(sessionId: SessionId): boolean {
    this.assertUsable()
    const people = this.state().people
    const conversation = people?.conversations.find(item => item.sessionId === sessionId)
    return conversation === undefined || (conversation.kind === 'private' && conversation.personId === people?.operatorPersonId)
  }

  /**
   * Identify a bound QQ Session for channel-specific data and tool restrictions.
   * @param sessionId - Actual calling Session.
   * @returns Whether the Session belongs to the authenticated QQ adapter.
   */
  isQqSession(sessionId: SessionId): boolean {
    this.assertUsable()
    return this.state().people?.conversations.some(item => item.sessionId === sessionId) === true
  }

  /**
   * Match an authenticated account to the configured operator; names and relationships never qualify.
   * @param personId - Transport-verified person identity.
   * @returns Whether this exact account has the durable operator binding.
   */
  isOperatorPerson(personId: PersonId): boolean {
    this.assertUsable()
    return this.state().people?.operatorPersonId === personId
  }

  private readonly eventListeners = new Set<(events: readonly LifeEvent[]) => void>()

  /**
   * Subscribe to newly committed life events; listeners must contain their own asynchronous failures.
   * @param listener - Nonthrowing observer; callbacks must not mutate event values.
   * @returns Disposer for the subscription.
   */
  onCommitted(listener: (events: readonly LifeEvent[]) => void): () => void {
    this.eventListeners.add(listener)
    return () => { this.eventListeners.delete(listener) }
  }

  /** Initialize the optional outbox without replacing prior history.
   * @returns After the state is durably initialized.
   */
  initializeInitiative(): Promise<void> {
    return this.change((state) => {
      if (state.initiative !== undefined) return
      state.initiative = { version: 1, revision: 0, records: [] }
      state.initiative.eventCursor = fact(state, 'initiative.initialized', 'initiative:initialized', {}).id
    })
  }

  /**
   * Save complete proactive policy atomically; enabling starts with current events, preserving existing pending records.
   * @param settings - Validated operator policy.
   * @param revision - Last displayed settings revision; receipt changes do not invalidate a draft.
   * @returns New revision, only after durable commit.
   */
  configureInitiative(settings: InitiativeSettings, revision: number): Promise<number> {
    return this.change((state) => {
      if (this.config.socialInitiative === undefined || state.initiative === undefined) throw new GenesisError('invalid-state', 'Social initiative is unavailable in this profile.')
      const initiative = state.initiative
      if ((initiative.revision ?? 0) !== revision) throw new GenesisError('configuration-conflict', 'Proactive settings changed. Reload before saving your draft.')
      const wasEnabled = resolveInitiative(this.config.socialInitiative, initiative).enabled
      const { sessionId, ...policy } = settings
      initiative.settings = { ...policy, ...(sessionId === undefined ? {} : { sessionId }) }
      initiative.revision = revision + 1
      const event = fact(state, 'initiative.configured', `initiative:settings:${initiative.revision}`, {
        revision: initiative.revision, settings: { ...policy, ...(sessionId === undefined ? {} : { sessionId }) },
      }, 'user')
      if (!wasEnabled || !settings.enabled) initiative.eventCursor = event.id
      return initiative.revision
    })
  }

  /**
   * Advance the event catch-up cursor monotonically without manufacturing an experience.
   * @param eventId - Last examined committed event.
   * @returns After the cursor is durable; old cursors cannot move it backwards.
   */
  advanceInitiativeCursor(eventId: LifeEventId): Promise<void> {
    return this.change((state) => {
      if (state.initiative === undefined) return
      this.checkSources(state, [eventId])
      const old = state.events.findIndex(event => event.id === state.initiative?.eventCursor)
      if (state.events.findIndex(event => event.id === eventId) > old) state.initiative.eventCursor = eventId
    })
  }

  /**
   * Record one replay-safe opportunity even when no conversation channel is available.
   * @param key - Stable timer bucket or event identity.
   * @param sourceEventId - Actual trigger or most recent recorded life event.
   * @returns Existing or newly pending opportunity; capacity exhaustion remains visible.
   */
  requestInteraction(key: string, sourceEventId: LifeEventId): Promise<InteractionRecord> {
    return this.change((state) => {
      const initiative = state.initiative
      if (initiative === undefined || this.config.socialInitiative === undefined) throw new GenesisError('invalid-state', 'Social initiative is disabled.')
      const previous = initiative.records.find(item => item.key === key)
      if (previous !== undefined) return previous
      const policy = resolveInitiative(this.config.socialInitiative, initiative)
      if (!policy.enabled) throw new GenesisError('configuration-conflict', 'Proactive conversation is paused.')
      this.checkSources(state, [sourceEventId])
      if (initiative.records.filter(item => item.status === 'pending' || item.status === 'dispatching').length >= policy.maxPending) {
        throw new GenesisError('capacity', 'Genesis pending interaction queue is full. Inspect pending deliveries before retrying.')
      }
      const item: InteractionRecord = { id: brandString<InteractionId>(randomUUID()), key, sourceEventId,
        status: 'pending', createdAt: new Date().toISOString() }
      initiative.records.push(item)
      initiative.lastCheckAt = item.createdAt
      fact(state, 'initiative.requested', `initiative:${key}`, { interactionId: item.id, sourceEventId })
      return item
    })
  }

  /**
   * Commit a delivery transition and its reason, content or receipt with the existing atomic life write.
   * @param record - Engine-owned record derived from the latest life snapshot.
   * @returns After the transition is durable; terminal receipts cannot be overwritten.
   */
  saveInteraction(record: InteractionRecord): Promise<void> {
    return this.change((state) => {
      const current = state.initiative?.records.find(item => item.id === record.id)
      if (current === undefined || current.key !== record.key || current.sourceEventId !== record.sourceEventId) throw new GenesisError('invalid-source', 'Interaction opportunity is absent or changed.')
      if (['sent', 'skipped'].includes(current.status) || current.status === 'uncertain' && record.status !== 'sent') return
      if (record.status === 'dispatching' && current.status === 'pending'
        && (this.config.socialInitiative === undefined || !resolveInitiative(this.config.socialInitiative, state.initiative).enabled)) {
        throw new GenesisError('configuration-conflict', 'Proactive conversation was paused before dispatch.')
      }
      if (JSON.stringify(current) === JSON.stringify(record)) return
      Object.assign(current, record)
      fact(state, 'initiative.changed', `initiative-transition:${randomUUID()}`, { interactionId: record.id, status: record.status })
    })
  }
  private committed: LifeState | undefined
  private backedUp: LifeRecordReference[] | undefined
  private chain: Promise<void> = Promise.resolve()
  private stopping = false
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined
  private initialized: Promise<void> | undefined
  private learningState: { ready: boolean; tools: string[]; firstSessionId?: SessionId; firstConversationComplete: boolean } | undefined

  /**
   * @param domain - Exclusively leased validated domain; ownership transfers to this core.
   * @param config - Resolved storage and response limits.
   * @param records - Immutable component domain; ownership transfers to this core.
   */
  constructor(private readonly domain: Domain<typeof lifeDomain>, private readonly config: Config,
    private readonly records: Domain<typeof lifeRecordsDomain>) {}

  /**
   * Initialize once or restore the same life; birth and initial memory commit atomically.
   * @returns Resolution only after durable startup.
   */
  start(): Promise<void> {
    this.initialized ??= this.initialize()
    return this.initialized
  }

  private async initialize(): Promise<void> {
    try { new Intl.DateTimeFormat('en', { timeZone: this.config.timeZone }) } catch (error) {
      throw new GenesisError('invalid-state', 'Genesis timeZone must be a supported IANA calendar zone.', { cause: error })
    }
    if (this.domain.table('states').size > 1
      || [...this.domain.table('states').keys()].some((key: string) => key !== 'life')) {
      throw new GenesisError('invalid-state', 'Genesis has unexpected state keys. Restore a verified backup before restarting.')
    }
    const stored = this.domain.table('states').get('life')
    const existing = stored === undefined ? undefined : 'format' in stored
      ? await joinState(stored, (table, key) => this.records.table(table).get(key)) : stored
    this.committed = existing
    if (stored === undefined && Object.keys(lifeRecordsDomain.tables).some(table => this.records.table(table).size > 0)) {
      throw new GenesisError('invalid-state', 'Genesis commit descriptor is absent but life records exist. Restore verified storage; a new life was not created.')
    }
    if (existing !== undefined) this.publishLearning(existing)
    if (existing === undefined) {
      if (await hasBackup(backupPath(this.config.leasePath, this.config.backupPath))) {
        throw new GenesisError('invalid-state', 'Genesis primary state is absent but a local backup exists. Restore the verified backup into storage; a new life was not created.')
      }
      const now = new Date().toISOString()
      const state: LifeState = {
        schemaVersion: 1,
        identity: { id: brandString<LifeId>(randomUUID()), name: null, createdAt: now, updatedAt: now,
          lifeCoreVersion: '0.1.0-alpha.1', origin: { framework: 'DeepSeek Harness', initialVersion: '0.1.0-alpha.1' } },
        events: [], memories: [], growth: [], sessions: {},
      }
      const born = fact(state, 'life.created', 'birth', {}, 'system', undefined, undefined, now)
      const initialMemoryId = brandString<MemoryId>(randomUUID())
      if (this.config.awakening === undefined) {
        state.memories.push({ id: initialMemoryId, lifeId: state.identity.id, category: 'self',
          content: this.config.emotion === undefined
            ? 'Persistent identity and sourced long-term memory are enabled. Emotion, motivation and autonomous awakening are not implemented.'
            : 'Persistent identity and sourced long-term memory are enabled. Emotion is simulated; motivation and autonomous awakening are not implemented.',
          importance: 1, confidence: 1, sourceEventIds: [born.id], createdAt: now, updatedAt: now })
        fact(state, 'memory.created', `initial-memory:${born.id}`, { memoryId: initialMemoryId })
      }
      await this.persist(state)
    }
    await this.change((state) => {
      fact(state, 'life.started', `start:${randomUUID()}`, {})
      const personality = this.config.personality
      if (personality !== undefined && !state.events.some(event => event.dedupKey === 'personality:initialized')) {
        const source = fact(state, 'personality.initialized', 'personality:initialized', { kind: 'configured-initial-tendencies' })
        const seeds = [{ category: 'self', content: personality.tendencies },
          { category: 'procedural', content: personality.speakingStyle }] as const
        for (const seed of seeds) {
          if (state.memories.some(memory => memory.category === seed.category && isImplicit(memory))) continue
          const now = new Date().toISOString()
          const id = brandString<MemoryId>(randomUUID())
          state.memories.push({ ...seed, content: memoryTimeText(seed.content.trim()), id, lifeId: state.identity.id,
            kind: 'non-declarative', importance: personality.importance, confidence: 1,
            sourceEventIds: [source.id], createdAt: now, updatedAt: now })
          fact(state, 'memory.created', `personality-memory:${seed.category}`, { memoryId: id })
        }
        this.checkImplicit(state, this.config.memory?.maxImplicitMemories ?? this.config.queryLimit)
      }
      const config = this.config.emotion
      if (config !== undefined) {
        const now = new Date().toISOString()
        if (state.emotion === undefined) {
          state.emotion = initialEmotion(config, now)
          fact(state, 'emotion.initialized', 'emotion:initialized', { state: emotionRecord(state.emotion) })
          const legacy = state.memories.find(memory => memory.content === 'Persistent identity and sourced long-term memory are enabled. Emotion, motivation and autonomous awakening are not implemented.'
            && memory.sourceEventIds.some(id => state.events.some(event => event.id === id && event.type === 'life.created')))
          if (legacy !== undefined) {
            const updatedAt = memoryTime(legacy)
            state.memories[state.memories.indexOf(legacy)] = retainMemoryHistory(legacy, { ...legacy, updatedAt,
              content: 'Persistent identity and sourced long-term memory are enabled. Emotion is simulated; motivation and autonomous awakening are not implemented.' })
            fact(state, 'memory.updated', `emotion:self-description:${legacy.id}`, { memoryId: legacy.id })
          }
        } else {
          const previous = state.emotion
          const resumed = (previous.offlineChanges ?? true) ? emotionAt(previous, now)
            : { ...previous, updatedAt: Date.parse(now) > Date.parse(previous.updatedAt) ? now : previous.updatedAt }
          const desired = previous.controls === undefined
            ? resolveEmotion(config, initialEmotion(config, now)) : resolveEmotion(config, previous)
          const changed = JSON.stringify([previous.sensitivity, previous.baseline, previous.shortHalfLifeMs, previous.moodHalfLifeMs,
            previous.needsHalfLifeMs, previous.interactionHalfLifeMs,
            previous.offlineChanges, previous.moodEmotionScale, previous.emotionMoodInfluence])
            !== JSON.stringify([desired.sensitivity, desired.baseline, desired.shortHalfLifeMs, desired.moodHalfLifeMs,
              desired.needsHalfLifeMs, desired.interactionHalfLifeMs,
              desired.offlineChanges, desired.moodEmotionScale, desired.emotionMoodInfluence])
          const { enabled: _enabled, windowTurns: _window, maxDelta: _delta, maxMoodDelta: _mood, maxNeedsDelta: _needs,
            contextStep: _step, relationshipEnabled: _relationship, maxRelationshipDelta: _relationshipDelta,
            moodSupportTurns: _support, importantEventThreshold: _important, repetitionDiscount: _discount, ...recovery } = desired
          state.emotion = { ...resumed, ...recovery, revision: previous.revision + (changed ? 1 : 0) }
          if (changed) fact(state, 'emotion.configured', `emotion:configuration:${state.emotion.revision}`, {
            before: emotionRecord(previous), after: emotionRecord(state.emotion), reason: 'startup-recovery-settings' })
        }
      }
      if (this.config.deliberation !== undefined && state.agency === undefined) {
        state.agency = { version: 1, revision: 0, motivations: [], goals: [], decisions: [] }
        fact(state, 'agency.initialized', 'agency:initialized', { version: 1 })
        for (const memory of state.memories.filter(item => item.category === 'self' && item.sourceEventIds.some(id =>
          state.events.some(event => event.id === id && event.type === 'life.created'))
          && item.content.includes('motivation and autonomous awakening are not implemented'))) {
          const replacement = retainMemoryHistory(memory, { ...memory, updatedAt: memoryTime(memory),
            content: 'Persistent identity, sourced memory and optional deliberation are enabled. Autonomous wake scheduling is unavailable; emotion and motivation are engineered state, not evidence of consciousness.' })
          state.memories[state.memories.indexOf(memory)] = replacement
          fact(state, 'memory.updated', `agency:self-description:${memory.id}`, { memoryId: memory.id })
        }
      }
      if (this.config.interest !== undefined && state.interests === undefined) {
        state.interests = []
        fact(state, 'interest.initialized', 'interest:initialized', { interests: [] })
      }
    })
  }

  /**
   * Record an actual application deliberation trigger without copying user text.
   * @param sessionId - Audit Session receiving the trigger.
   * @param key - Caller-owned stable replay key, scoped to this Session.
   * @param kind - Request admission or externally delivered event.
   * @param source - Required existing life event for an external trigger; absent for requests.
   * @returns Original or newly committed trigger fact.
   */
  prepareDeliberation(sessionId: SessionId, key: string, kind: 'request' | 'event', source?: LifeEventId): Promise<LifeEvent> {
    return this.change((state) => {
      if (key.length === 0 || key.length > 200) throw new GenesisError('invalid-source', 'Deliberation key must contain 1–200 characters.')
      if (kind === 'event' && (source === undefined || !state.events.some(event => event.id === source))) {
        throw new GenesisError('invalid-source', 'External deliberation requires an existing life event.')
      }
      const previous = state.events.find(event => event.dedupKey === `deliberation-trigger:${sessionId}:${key}`)
      if (previous !== undefined && (previous.payload['kind'] !== kind || previous.payload['sourceEventId'] !== (source ?? null))) {
        throw new GenesisError('invalid-source', 'A deliberation replay key cannot refer to a different trigger.')
      }
      return fact(state, 'decision.triggered', `deliberation-trigger:${sessionId}:${key}`, { kind,
        sourceEventId: source ?? null }, kind === 'request' ? 'user' : 'system', sessionId)
    })
  }

  /** Record a trusted sleep transition or initialization without admitting a chat message.
   * @param key - Stable operation receipt key.
   * @param kind - Sleep event suffix.
   * @param payload - Nonsecret state and source references.
   * @returns Committed life event, including on replay.
   */
  recordSleep(key: string, kind: string, payload: LifeEvent['payload']): Promise<LifeEvent> {
    return this.change((state) => fact(state, `sleep.${kind.replace(/[^a-z]/gu, '')}`, `sleep:${key}`, { ...payload, kind }, 'system'))
  }

  /** Initialize the independent thought store ownership marker without creating another life.
   *
   * @returns After the marker commits; a missing marked store must be restored by its owner.
   */
  initializeSpontaneity(): Promise<void> {
    return this.change((state) => { fact(state, 'spontaneity.initialized', 'spontaneity:initialized', {}) })
  }

  /** Record an internal Session before it can receive input; the marker also fences cold resumes.
   *
   * @param sessionId - Reserved internal identity.
   * @param sourceEventId - Actual triggering life event.
   *
   * @returns After source attribution commits; no Agent is created by this method.
   */
  beginSpontaneitySession(sessionId: SessionId, sourceEventId: LifeEventId): Promise<void> {
    return this.change((state) => {
      this.checkSources(state, [sourceEventId])
      fact(state, 'spontaneity.started', `spontaneity:session:${sessionId}`, { sourceEventId }, 'system', sessionId)
    })
  }

  /** Identify internal Sessions without opening their logs.
   *
   * @param sessionId - Candidate identity.
   * @returns Whether life history records an internal interval.
   */
  isSpontaneitySession(sessionId: SessionId): boolean {
    this.assertUsable()
    return this.state().events.some(event => event.dedupKey === `spontaneity:session:${sessionId}`)
  }

  /**
   * Publish a validated deliberation and all its state transitions atomically.
   * @param commit - Captured evidence, revision and proposal from the owning integration.
   * @returns Committed choice; replay returns the original choice without further changes.
   */
  commitDeliberation(commit: DeliberationCommit): Promise<LifeDecision> {
    return this.change((state) => {
      const config = this.config.deliberation
      if (config === undefined) throw new GenesisError('invalid-state', 'Enable deliberation before making life decisions.')
      if (commit.purpose === 'exploration' && (this.config.spontaneity?.enabled !== true
        || !state.events.some(event => event.dedupKey === `spontaneity:session:${commit.sessionId}`))) {
        throw new GenesisError('invalid-source', 'Exploration needs an enabled, recorded internal opportunity.')
      }
      const trigger = state.events.find(event => event.id === commit.sourceEventIds[0])
      if (trigger?.type !== 'decision.triggered' || trigger.relatedSessionId !== commit.sessionId
        || trigger.payload['kind'] !== commit.trigger || trigger.dedupKey !== `deliberation-trigger:${commit.key}`) throw new GenesisError('invalid-source', 'Decision trigger does not match its Session.')
      return applyDeliberation(state, commit, config, (type, key, payload) => fact(state, type, key, payload, 'agent', commit.sessionId))
    })
  }

  /**
   * Commit a main-model plan edit and its tool-call evidence atomically; failures preserve previous state.
   * @param change - Validated explicit create/update with the observed agency revision.
   * @param source - Actual calling Session and logged tool call, supplied by the integration.
   * @returns Stable plan id and committed revision; an identical replay returns its original receipt.
   */
  editPlan(change: PlanChange, source: { sessionId: SessionId; callId: ToolCallId }): Promise<{ id: PlanChange['id']; revision: number }> {
    return this.change((state) => {
      const config = this.config.deliberation
      if (config === undefined) throw new GenesisError('invalid-state', 'Enable deliberation before managing life plans.')
      return applyPlanChange(state, change, source, config,
        (type, key, payload) => fact(state, type, key, payload, 'agent', source.sessionId))
    })
  }

  /**
   * Reserve one main-model planning opportunity; replay never queues the same opportunity again.
   * @param sessionId - Actual receiving conversation.
   * @param key - Trusted adapter's stable replay key.
   * @param sourceEventId - Existing life evidence that prompted consideration.
   * @returns A new reservation, or undefined for a replay; reservation alone does not confirm dispatch.
   */
  reservePlanning(sessionId: SessionId, key: string, sourceEventId: LifeEventId): Promise<LifeEvent | undefined> {
    return this.change((state) => {
      if (this.config.deliberation === undefined) throw new GenesisError('invalid-state', 'Enable deliberation before requesting planning.')
      if (!key || key.length > 200 || !state.events.some(event => event.id === sourceEventId)) {
        throw new GenesisError('invalid-source', 'Planning needs a stable key of 1–200 characters and existing life evidence.')
      }
      const dedupKey = `planning:${sessionId}:${key}`
      const previous = state.events.find(event => event.dedupKey === dedupKey)
      if (previous !== undefined) {
        if (previous.payload['sourceEventId'] !== sourceEventId) throw new GenesisError('invalid-source', 'This planning key already refers to different evidence.')
        return undefined
      }
      return fact(state, 'planning.requested', dedupKey, { sourceEventId, dispatch: 'reserved' }, 'system', sessionId)
    })
  }

  /**
   * Reserve an autonomous follow-up once before enqueueing; a crash leaves an explicit uncertain admission.
   * @param id - Pending externally triggered choice.
   * @returns Whether this caller acquired dispatch; replay and settled choices return false.
   */
  reserveDecisionDispatch(id: DecisionId): Promise<boolean> {
    return this.change((state) => {
      const decision = state.agency?.decisions.find(item => item.id === id)
      if (decision === undefined || decision.trigger !== 'event') throw new GenesisError('invalid-source', 'Autonomous decision is absent.')
      const key = `decision-dispatch:${id}`
      if (decision.outcome.status !== 'pending' || state.events.some(event => event.dedupKey === key)) return false
      fact(state, 'decision.dispatched', key, { decisionId: id }, 'system', decision.sessionId)
      return true
    })
  }

  /**
   * Check the committed decision synchronously at tool execution; poisoned storage refuses access.
   * @param id - Choice admitted by this live Agent's integration.
   * @returns Whether willingness permits task tools; execution authorization remains independent.
   */
  permitsDecision(id: DecisionId): boolean {
    this.assertUsable()
    const agency = this.state().agency
    const decision = agency?.decisions.find(item => item.id === id)
    return (decision?.purpose !== 'exploration' || this.config.spontaneity?.enabled === true)
      && decision?.purpose !== 'interaction' && decision?.outcome.status === 'pending' && decision.candidates[decision.selected]?.disposition === 'accept'
      && decision.goalIds.every(goalId => agency?.goals.some(goal => goal.id === goalId && goal.status === 'active'))
  }

  /**
   * Attach observed Session result references and update failure history, without claiming goal completion.
   * @param id - Committed decision whose execution has settled.
   * @param outcome - Host-derived result, never model-authored text.
   * @param sources - Actual observed life event IDs from this decision's Session.
   * @returns After result publication; repeat settlements are no-ops.
   */
  settleDecision(id: DecisionId, outcome: LifeDecision['outcome']['status'], sources: LifeEventId[]): Promise<void> {
    return this.change((state) => {
      const agency = state.agency
      const decision = agency?.decisions.find(item => item.id === id)
      if (agency === undefined || decision === undefined) throw new GenesisError('invalid-source', 'Decision is absent. Refresh life state.')
      if (decision.outcome.status !== 'pending') return
      if (outcome === 'pending' || (outcome !== 'interrupted' && !sources.length)
        || sources.some(id => !state.events.some(event => event.id === id && event.type === 'interaction.observed'
          && event.relatedSessionId === decision.sessionId))) throw new GenesisError('invalid-source', 'Decision results require actual Session observations.')
      if (outcome === 'succeeded' && !sources.some(id => state.events.some(event => event.id === id
        && event.payload['kind'] === 'tool-result' && event.payload['success'] === true))) {
        throw new GenesisError('invalid-source', 'Execution success requires a successful tool result.')
      }
      decision.outcome = { status: outcome, sourceEventIds: sources, recordedAt: new Date().toISOString() }
      if (outcome === 'failed') for (const goal of agency.goals.filter(item => decision.goalIds.includes(item.id))) goal.failures++
      agency.revision++
      fact(state, 'decision.settled', `decision-result:${id}`, { decisionId: id, outcome: decision.outcome }, 'system', decision.sessionId)
    })
  }

  /**
   * Record an explicit operator pause, resume or abandonment without changing goal origin or completion.
   * @param id - Stable goal identifier.
   * @param status - Active, paused or abandoned; completion requires verified execution.
   * @param revision - Displayed agency revision for optimistic concurrency.
   * @param reason - Human explanation, validated at this application input.
   * @returns After the history and current state commit; stale edits leave both unchanged.
   */
  setLifeGoalStatus(id: LifeGoalId, status: 'active' | 'paused' | 'abandoned', revision: number, reason: string): Promise<void> {
    const input = z.strictObject({ id: z.string().min(1).max(80), status: z.enum(['active', 'paused', 'abandoned']),
      revision: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(800) }).parse({ id, status, revision, reason })
    return this.change((state) => {
      const agency = state.agency
      if (agency === undefined || agency.revision !== input.revision) {
        throw new GenesisError('configuration-conflict', 'Life goals changed. Refresh and review the latest goal before saving.')
      }
      const goal = agency.goals.find(item => item.id === input.id)
      if (goal === undefined || goal.status === 'completed' || goal.status === 'abandoned') {
        throw new GenesisError('invalid-source', 'Only an unfinished life goal can be edited.')
      }
      if (goal.status === input.status) return
      const previous = goal.history.at(-1)
      if (previous === undefined) throw new GenesisError('invalid-state', 'Life goal history is unavailable.')
      goal.status = input.status; goal.updatedAt = new Date().toISOString()
      goal.history.push({ timestamp: goal.updatedAt, status: input.status, reason: input.reason,
        nextAction: goal.nextAction, decisionId: previous.decisionId, actor: 'operator' })
      agency.revision++
      fact(state, 'goal.adjusted', `life-goal-operator:${randomUUID()}`, { goalId: goal.id, status: input.status,
        reason: input.reason, revision: agency.revision }, 'user')
    })
  }

  /**
   * Confirm goal completion after independent application verification of a successful linked execution.
   * @param id - Active life goal; ordinary chat and deliberation proposals cannot complete it.
   * @param decisionId - Settled successful execution linked to this goal.
   * @param evidence - Successful tool-result fact from that decision's observed outcome.
   * @returns After completion and its immutable history commit; replay is idempotent.
   */
  completeLifeGoal(id: LifeGoalId, decisionId: DecisionId, evidence: LifeEventId): Promise<void> {
    return this.change((state) => {
      const agency = state.agency
      const goal = agency?.goals.find(item => item.id === id)
      const decision = agency?.decisions.find(item => item.id === decisionId)
      if (agency === undefined || goal === undefined || decision === undefined || !decision.goalIds.includes(id)
        || decision.outcome.status !== 'succeeded' || !decision.outcome.sourceEventIds.includes(evidence)
        || !state.events.some(event => event.id === evidence && event.payload['kind'] === 'tool-result' && event.payload['success'] === true)) {
        throw new GenesisError('invalid-source', 'Goal completion requires independently verified linked execution evidence.')
      }
      if (goal.status === 'completed') return
      if (goal.status !== 'active') throw new GenesisError('invalid-source', 'Only an active life goal can complete.')
      goal.status = 'completed'; goal.updatedAt = new Date().toISOString()
      goal.history.push({ timestamp: goal.updatedAt, status: 'completed', nextAction: goal.nextAction,
        reason: 'Application verified the linked execution result.', decisionId, actor: 'application' })
      agency.revision++
      const event = fact(state, 'goal.completed', `life-goal-complete:${id}`, { goalId: id, decisionId, sourceEventIds: [evidence] }, 'system', decision.sessionId)
      grow(state, event, 'Life goal completed', 'An application verified a successful execution linked to a persistent life goal.')
    })
  }

  /**
   * Commit one sourced interest interpretation and a replay marker together.
   * @param sessionId - Conversation whose committed exchange supplied the evidence.
   * @param current - Current completed exchange; older turns are context only.
   * @param proposals - Validated writer proposals, or an empty list for no change.
   * @returns After durable publication; replay of this exchange has no effect.
   */
  reviewInterest(sessionId: SessionId, current: InterestDialogue['turns'][number], proposals: InterestProposal[]): Promise<void> {
    return this.change((state) => {
      if (this.config.interest === undefined || state.interests === undefined) throw new GenesisError('invalid-state', 'Enable interest before reviewing an exchange.')
      const key = `interest-review:${sessionId}:${current.startSeq}`
      if (state.events.some(event => event.dedupKey === key)) return
      const autonomous = state.agency?.decisions.find(item => item.id === current.decisionId && item.trigger === 'event'
        && item.sessionId === sessionId && ['responded', 'succeeded', 'failed'].includes(item.outcome.status))
      const changed = new Set<string>()
      for (const proposal of proposals) {
        const interest = proposal.id === undefined ? undefined : state.interests.find(item => item.id === proposal.id)
        if (proposal.id !== undefined && interest === undefined) throw new GenesisError('invalid-source', 'Interest writer referenced an absent interest. Retry from fresh state.')
        if (interest !== undefined && interest.topic !== proposal.topic) throw new GenesisError('invalid-source', 'Interest topic cannot be silently renamed.')
        const topicKey = proposal.topic.toLocaleLowerCase()
        const topicExists = state.interests.some(item => item.topic.toLocaleLowerCase() === topicKey)
        if (changed.has(topicKey) || (interest === undefined && topicExists)) {
          throw new GenesisError('invalid-source', 'Interest writer repeated an existing topic.')
        }
        changed.add(topicKey)
        if (interest === undefined && (proposal.signal === 'return' || proposal.signal === 'disinterest')) throw new GenesisError('invalid-source', 'A new topic needs an actual contact or exploration first.')
        const messages = current.messages.filter(item => proposal.sourceSeqs.includes(item.seq))
        const tools = current.tools.filter(item => item.resultSeq !== undefined && proposal.sourceSeqs.includes(item.resultSeq))
        const invalidAutonomousEvidence = autonomous === undefined
          || [...messages.map(item => item.seq), ...tools.map(item => item.resultSeq)].some(seq =>
            !state.events.some(event => event.relatedSessionId === sessionId
              && event.relatedEventId === String(seq) && autonomous.outcome.sourceEventIds.includes(event.id)))
        if (new Set(proposal.sourceSeqs).size !== proposal.sourceSeqs.length
          || messages.length + tools.length !== proposal.sourceSeqs.length
          || (!messages.some(item => item.role === 'user') && invalidAutonomousEvidence)) {
          throw new GenesisError('invalid-source', 'Interest changes must cite the current real user exchange or observed autonomous execution.')
        }
        if (proposal.signal !== 'contact' && !messages.some(item => item.role === 'assistant')) {
          throw new GenesisError('invalid-source', 'Interest development requires an actual assistant response.')
        }
        if (proposal.selfInitiated && (proposal.signal !== 'return' || current.messages.some(item => item.role === 'user'
          && item.text.toLocaleLowerCase().includes(proposal.topic.toLocaleLowerCase())))) {
          throw new GenesisError('invalid-source', 'A prompted topic cannot count as a self-initiated return.')
        }
        if (proposal.signal === 'exploration' && !tools.some(item => item.success)
          && !messages.some(item => item.role === 'assistant' && item.text.trim().length >= 80)) {
          throw new GenesisError('invalid-source', 'Exploration requires a successful tool result or substantive visible creation.')
        }
        const sourceEventIds = [...(autonomous === undefined ? [] : autonomous.sourceEventIds.slice(0, 1)),
          ...messages.map(message => fact(state, 'interaction.observed', `session:${sessionId}:${message.seq}`,
            { kind: `${message.role}-message` }, message.role === 'user' ? 'user' : 'agent', sessionId, String(message.seq), message.timestamp).id),
          ...tools.map(tool => fact(state, 'interaction.observed', `session:${sessionId}:${tool.resultSeq}`,
            { kind: 'tool-result', tool: tool.name, success: tool.success === true }, 'tool', sessionId, String(tool.resultSeq), tool.timestamp).id)]
        const now = new Date().toISOString()
        const evidence: LifeInterest['evidence'][number] = { sessionId, startSeq: current.startSeq, signal: proposal.signal,
          selfInitiated: proposal.selfInitiated, sourceEventIds }
        const history = [...(interest?.evidence ?? []), evidence]
        if (history.length > 100) throw new GenesisError('capacity', 'Interest evidence reached its configured record limit; export or correct it before continuing.')
        const recent = history.slice(history.findLastIndex(item => item.signal === 'disinterest') + 1)
        const exploration = recent.findIndex(item => item.signal === 'exploration')
        const enduring = recent.length >= this.config.interest.minEnduringTurns && exploration >= 0
          && recent.slice(exploration + 1).some(item => item.signal === 'return' && item.selfInitiated)
        const stage: LifeInterest['stage'] = proposal.signal === 'disinterest' ? 'dormant'
          : enduring ? 'enduring' : interest?.stage === 'enduring' ? 'enduring'
            : proposal.signal === 'exploration' || proposal.signal === 'return' ? 'exploring'
              : proposal.signal === 'curiosity' ? 'curious' : interest?.stage === 'dormant' ? 'contact'
                : interest?.stage ?? 'contact'
        const updated: LifeInterest = { id: interest?.id ?? brandString<InterestId>(randomUUID()), lifeId: state.identity.id,
          topic: proposal.topic, stage, createdAt: interest?.createdAt ?? now, updatedAt: now,
          reason: proposal.reason, evidence: history }
        if (interest === undefined) {
          if (state.interests.length >= this.config.interest.maxInterests) throw new GenesisError('capacity', 'Interest inventory is full. Increase interest.maxInterests before recording more topics.')
          state.interests.push(updated)
        } else state.interests[state.interests.indexOf(interest)] = updated
        fact(state, 'interest.changed', `interest-change:${sessionId}:${current.startSeq}:${updated.id}`,
          { interestId: updated.id, topic: updated.topic, before: interest?.stage ?? null, after: stage,
            signal: proposal.signal, reason: proposal.reason, selfInitiated: proposal.selfInitiated, sourceEventIds },
          'agent', sessionId, String(current.startSeq))
      }
      fact(state, 'interest.reviewed', key, { startSeq: current.startSeq, turn: current.turn, changes: proposals.length },
        'agent', sessionId, String(current.startSeq))
    })
  }

  /**
   * Read committed state after all previously accepted observations settle.
   * @returns Detached life snapshot; rejects when closed or storage is untrusted.
   */
  async snapshot(): Promise<LifeState> {
    await this.chain
    this.assertUsable()
    return structuredClone(this.state())
  }

  /**
   * Commit an emotion appraisal and its deduplication marker atomically with cited life evidence.
   * @param sessionId - Source conversation, never another Session's text.
   * @param evidence - Current exchange and optional earlier complete exchanges.
   * @param revision - Emotion revision captured before inference; stale proposals are refused.
   * @param update - Validated signed changes; omitted records a no-change decision.
   * @returns After durable commit; replay is a no-op and storage uncertainty stops dependent operations.
   */
  reviewEmotion(sessionId: SessionId, evidence: EmotionDialogue['turns'], revision: number, update?: EmotionUpdate): Promise<void> {
    return this.change((state) => {
      const config = this.config.emotion
      const current = evidence.at(-1)
      if (config === undefined || state.emotion === undefined || current === undefined) {
        throw new GenesisError('invalid-state', 'Enable emotion and provide the source exchange before emotion review.')
      }
      const settings = resolveEmotion(config, state.emotion)
      if (!settings.enabled) throw new GenesisError('invalid-state', 'Automatic emotion appraisal is paused. No update was applied.')
      const key = `emotion-review:${sessionId}:${current.startSeq}`
      if (state.events.some(event => event.dedupKey === key)) return
      if (state.events.some(event => event.type === 'emotion.reviewed' && event.relatedSessionId === sessionId
        && typeof event.payload['startSeq'] === 'number' && event.payload['startSeq'] >= current.startSeq)) {
        throw new GenesisError('invalid-source', 'Emotion evidence has been superseded by a newer exchange. Continue with fresh dialogue.')
      }
      if (state.emotion.revision !== revision) throw new GenesisError('configuration-conflict', 'Emotion changed during appraisal. Continue with fresh dialogue before applying another update.')
      const before = emotionAt(state.emotion, new Date().toISOString())
      const after = structuredClone(before)
      const sourceEventIds: LifeEventId[] = []
      let appraisal: ReturnType<typeof applyAppraisal> | undefined
      let peopleChanges: object[] = []
      if (update !== undefined) {
        const autonomous = state.agency?.decisions.find(item => item.id === current.decisionId && item.purpose === 'exploration'
          && item.sessionId === sessionId && ['responded', 'succeeded', 'failed'].includes(item.outcome.status))
        const messages = evidence.flatMap(turn => turn.messages)
        const sourceSeqs = [...new Set([...update.sourceSeqs, ...(update.relationships ?? []).flatMap(item => item.sourceSeqs)])]
        const cited = messages.filter(message => sourceSeqs.includes(message.seq))
        if (new Set(update.sourceSeqs).size !== update.sourceSeqs.length || cited.length !== sourceSeqs.length
          || (!current.messages.some(message => message.role === 'user' && update.sourceSeqs.includes(message.seq))
            && (autonomous === undefined || !current.messages.some(message => message.role === 'assistant' && update.sourceSeqs.includes(message.seq))
              || cited.some(message => !autonomous.outcome.sourceEventIds.some(id => state.events.some(event => event.id === id
                && event.relatedSessionId === sessionId && event.relatedEventId === String(message.seq))))))) {
          throw new GenesisError('invalid-source', 'Emotion updates must cite supplied dialogue and new real user evidence. No changes were applied.')
        }
        if (autonomous !== undefined && (Object.keys(update.relationshipDelta ?? {}).length || (update.relationships?.length ?? 0)
          || ['recentInteraction', 'socialSatisfaction', 'relationshipQuality'].some(field => field in update.needsDelta))) {
          throw new GenesisError('invalid-source', 'Private exploration cannot update social relationships or count as user contact.')
        }
        const social = state.people?.conversations.some(item => item.sessionId === sessionId) === true
        if (social && Object.keys(update.relationshipDelta ?? {}).length > 0) {
          throw new GenesisError('invalid-source', 'Social dialogue must name actual speakers in per-person relationship proposals; the operator relationship was not changed.')
        }
        appraisal = applyAppraisal(after, update, settings, state.events,
          current.messages.filter(message => (autonomous === undefined ? message.role === 'user' : message.role === 'assistant')
            && update.sourceSeqs.includes(message.seq)).map(message => message.text))
        for (const message of cited) {
          const event = fact(state, 'interaction.observed', `session:${sessionId}:${message.seq}`, { kind: `${message.role}-message`, ...(message.participant === undefined ? {} : { participant: message.participant }) },
            message.role === 'user' ? 'user' : 'agent', sessionId, String(message.seq), message.timestamp)
          sourceEventIds.push(event.id)
        }
        const references = new Map(cited.map((message, index) => [message.seq, sourceEventIds[index]!]))
        peopleChanges = applyPeople(state, sessionId, current, update, after, settings, this.config.people, references)
      }
      after.revision += 1
      state.emotion = after
      fact(state, 'emotion.reviewed', key, { startSeq: current.startSeq, turn: current.turn, changed: update !== undefined,
        before: emotionRecord(before), after: emotionRecord(after), sourceEventIds, ...(peopleChanges.length === 0 ? {} : { people: z.json().parse(peopleChanges) }),
        ...(update === undefined ? {} : { reason: update.reason, attribution: 'model-inference', appraisal: update.appraisal, ...(update.targets === undefined ? {} : { targets: update.targets }), ...appraisal }) }, 'agent', sessionId, String(current.startSeq))
    })
  }

  /**
   * Save elapsed online affect time without changing operator revisions or creating an experience.
   * @returns After the online-only anchor is durable; storage uncertainty stops dependent operations.
   */
  checkpointEmotion(): Promise<void> {
    if (this.config.emotion === undefined || this.state().emotion?.offlineChanges !== false) return Promise.resolve()
    return this.change((state) => {
      if (state.emotion?.offlineChanges === false) state.emotion = emotionAt(state.emotion, new Date().toISOString())
    })
  }

  /**
   * Save operator emotion rules with revision fencing; recovery under the old rules precedes the change.
   * @param settings - Validated complete operator choices; they take precedence over deployment defaults.
   * @param revision - Last displayed emotion revision; concurrent appraisals or edits reject this write.
   * @returns Committed revision; backup uncertainty stops dependent operations until verified reload.
   */
  configureEmotion(settings: EmotionSettings, revision: number): Promise<number> {
    return this.change((state) => {
      if (this.config.emotion === undefined || state.emotion === undefined) throw new GenesisError('invalid-state', 'Enable emotion in the active profile before changing its settings.')
      if (state.emotion.revision !== revision) throw new GenesisError('configuration-conflict', 'Emotion changed. Reload the current values before saving your draft again.')
      const before = emotionAt(state.emotion, new Date().toISOString())
      const { sensitivity, baseline, shortHalfLifeMs, moodHalfLifeMs, needsHalfLifeMs, interactionHalfLifeMs,
        offlineChanges, moodEmotionScale, emotionMoodInfluence, ...controls } = settings
      const after = { ...before, sensitivity, baseline: { ...baseline }, shortHalfLifeMs: { ...shortHalfLifeMs },
        moodHalfLifeMs: { ...moodHalfLifeMs }, needsHalfLifeMs, interactionHalfLifeMs,
        offlineChanges, moodEmotionScale, emotionMoodInfluence, controls: { ...controls }, revision: revision + 1 }
      state.emotion = after
      fact(state, 'emotion.configured', `emotion:settings:${after.revision}`, { before: emotionRecord(before), after: emotionRecord(after),
        reason: 'operator-settings', attribution: 'user-stated' }, 'user')
      return after.revision
    })
  }

  /**
   * Set operator-selected absolute intensities without manufacturing dialogue evidence.
   * @param adjustment - Validated immediate/mood/need values and nonempty operator reason.
   * @param revision - Last displayed emotion revision; stale edits leave state unchanged.
   * @returns Committed revision; the next request receives the adjusted state through logged context.
   */
  adjustEmotion(adjustment: EmotionAdjustment, revision: number): Promise<number> {
    return this.change((state) => {
      if (this.config.emotion === undefined || state.emotion === undefined) throw new GenesisError('invalid-state', 'Enable emotion in the active profile before adjusting it.')
      if (state.emotion.revision !== revision) throw new GenesisError('configuration-conflict', 'Emotion changed. Reload the current values before saving your draft again.')
      const before = emotionAt(state.emotion, new Date().toISOString())
      const after = { ...before, current: { ...adjustment.current }, mood: { ...adjustment.mood },
        needs: { ...adjustment.needs }, revision: revision + 1 }
      state.emotion = after
      fact(state, 'emotion.adjusted', `emotion:adjustment:${after.revision}`, { before: emotionRecord(before), after: emotionRecord(after),
        reason: adjustment.reason, attribution: 'user-stated' }, 'user')
      return after.revision
    })
  }

  /**
   * Replace the deployment operator's relationship estimates with an explicit attributed adjustment.
   * @param adjustment - Validated display label, five values and audit reason.
   * @param revision - Last observed emotion revision; conflicting changes reject atomically.
   * @returns Committed emotion revision; manual estimates do not become dialogue evidence.
   */
  adjustRelationship(adjustment: RelationshipAdjustment, revision: number): Promise<number> {
    return this.change((state) => {
      if (this.config.emotion === undefined || state.emotion === undefined) throw new GenesisError('invalid-state', 'Enable emotion before adjusting the relationship.')
      if (state.emotion.revision !== revision) throw new GenesisError('configuration-conflict', 'Emotion changed. Reload before saving the relationship.')
      const before = emotionAt(state.emotion, new Date().toISOString())
      const after = structuredClone(before)
      after.relationship = { id: before.relationship?.id ?? brandString<RelationshipId>(randomUUID()),
        scope: 'operator', label: adjustment.label, values: adjustment.values,
        confidence: { affection: 1, trust: 1, attachment: 1, familiarity: 1, feltSecurity: 1 },
        origins: { affection: 'user-stated', trust: 'user-stated', attachment: 'user-stated',
          familiarity: 'user-stated', feltSecurity: 'user-stated' }, updatedAt: after.updatedAt }
      after.revision++
      state.emotion = after
      fact(state, 'relationship.adjusted', `relationship:adjustment:${after.revision}`, { before: emotionRecord(before), after: emotionRecord(after),
        reason: adjustment.reason, attribution: 'user-stated' }, 'user')
      return after.revision
    })
  }

  /**
   * Read committed naming, learned tools and the first conversation, without copying another Session's context.
   * @returns Detached global life progress; an untrusted or closed core rejects.
   */
  learningStatus(): { ready: boolean; tools: string[]; firstSessionId?: SessionId; firstConversationComplete: boolean } {
    this.assertUsable()
    if (this.learningState === undefined) throw new GenesisError('invalid-state', 'Genesis startup has not completed.')
    return structuredClone(this.learningState)
  }

  private publishLearning(state: LifeState): void {
    const first = state.events.find(event => event.type === 'life.conversation')?.relatedSessionId
    this.learningState = { firstConversationComplete: state.events.some(event => event.dedupKey === 'first-conversation-completed'), ready: state.identity.name !== null,
      tools: state.events.filter(event => event.type === 'capability.learned')
        .flatMap(event => typeof event.payload['tool'] === 'string' ? [event.payload['tool']] : []),
      ...(first === undefined ? {} : { firstSessionId: SessionId(first) }) }
  }

  /**
   * Name the existing life once after the application has checked model configuration; never create a second identity.
   * @param name - User-selected name, validated before storage admission.
   * @returns After naming commits; repeating the same name is idempotent and a conflicting name is refused.
   */
  awaken(name: string): Promise<void> {
    const normalized = name.trim()
    if (!normalized || normalized.length > 200) throw new GenesisError('invalid-source', 'Choose a name of 1 to 200 characters.')
    return this.change((state) => {
      if (state.identity.name !== null && state.identity.name !== normalized) {
        throw new GenesisError('invalid-state', 'This life is already named. Initialization cannot replace it.')
      }
      state.identity.name = normalized
      const event = fact(state, 'life.awakened', 'awakening', { name: normalized }, 'user')
      state.identity.updatedAt = event.timestamp
    })
  }

  /**
   * Bind the first accepted conversation once; subsequent Sessions retain their own context.
   * @param sessionId - Session receiving the first accepted user or built-in awakening input.
   * @returns After the first-conversation fact commits, or after an idempotent repeat.
   */
  beginConversation(sessionId: SessionId): Promise<void> {
    return this.change((state) => {
      if (state.identity.name === null) throw new GenesisError('invalid-state', 'Complete API configuration or sign-in, then name this life before chatting.')
      fact(state, 'life.conversation', 'first-conversation', {}, 'system', sessionId)
    })
  }

  /**
   * Record completion only after the canonical first Session commits a successful turn with a text reply.
   * @param sessionId - Actual completed conversation.
   * @param eventId - Durable turn-end sequence, retained as source evidence.
   * @param timestamp - Source event time.
   * @returns After the idempotent completion fact is durable; unrelated Sessions do not complete initialization.
   */
  completeFirstConversation(sessionId: SessionId, eventId: string, timestamp: string): Promise<void> {
    return this.change((state) => {
      const first = state.events.find(event => event.type === 'life.conversation')
      if (first?.relatedSessionId !== sessionId) return
      fact(state, 'interaction.observed', 'first-conversation-completed', { kind: 'first-conversation-completed' },
        'system', sessionId, eventId, timestamp)
    })
  }

  /**
   * Persist one tool-learning event, independently of availability and execution permissions.
   * @param tool - Exact current tool name checked by the learning tool against the caller's registry.
   * @param sessionId - Actual learning Session.
   * @returns After learning and its growth record commit together; repeats do not duplicate them.
   */
  learn(tool: string, sessionId: SessionId): Promise<void> {
    if (!tool.trim() || tool.length > 512) throw new GenesisError('invalid-source', 'Supply one exact tool name.')
    return this.change((state) => {
      if (state.identity.name === null) throw new GenesisError('invalid-state', 'Name this life before learning.')
      if (state.events.some(event => event.dedupKey === `learn:${tool}`)) return
      const event = fact(state, 'capability.learned', `learn:${tool}`, { tool }, 'agent', sessionId)
      grow(state, event, `${tool}: learned`, 'Learned the named tool. Availability and authorization are checked independently at execution.')
    })
  }

  /**
   * Record the stable private host directory without replacing an existing location silently.
   * @param path - Prepared canonical directory authorized by deployment configuration.
   * @returns After the location is durable; a conflicting configured location is refused.
   */
  setPersonalDirectory(path: string): Promise<void> {
    return this.change((state) => {
      const previous = state.events.find(event => event.dedupKey === 'personal-directory')
      if (previous !== undefined && previous.payload['path'] !== path) throw new GenesisError('configuration-conflict', 'The personal directory differs from life history. Restore its configured location before restarting.')
      fact(state, 'life.directory', 'personal-directory', { path }, 'system')
    })
  }

  /**
   * Save explicit operator identity with version-fenced current-memory relabeling.
   * @param profile - Authenticated human-authored name and identity.
   * @param revision - Displayed operator revision, zero before first configuration.
   * @param versions - Complete memory set captured before inference; concurrent edits refuse publication.
   * @param changes - Validated wording-only replacements and refreshed embeddings.
   * @returns New identity revision; original interpretations remain in version history.
   */
  saveOperator(profile: OperatorIdentity, revision: number, versions: Array<{ id: MemoryId; updatedAt: string }>,
    changes: MemoryRelabel[]): Promise<number> {
    const parsed = operatorIdentitySchema.parse(profile)
    return this.change((state) => {
      if ((state.operator?.revision ?? 0) !== revision || versions.length !== state.memories.length
        || versions.some(version => !state.memories.some(memory => memory.id === version.id && memory.updatedAt === version.updatedAt))) {
        throw new GenesisError('configuration-conflict', 'Identity or memory changed during relabeling. Refresh before saving again.')
      }
      const next = revision + 1
      const event = fact(state, 'life.operator', `operator:${next}`, { ...parsed, revision: next, rewritten: changes.map(change => change.id) }, 'user')
      for (const change of changes) {
        const index = state.memories.findIndex(memory => memory.id === change.id)
        const old = state.memories[index]
        if (old === undefined) throw new GenesisError('configuration-conflict', 'Memory changed during relabeling. Refresh before saving again.')
        if ((change.habit !== undefined && old.habit === undefined)
          || (change.topics !== undefined && old.experience === undefined)) {
          throw new GenesisError('configuration-conflict', 'Memory fields changed during relabeling. Refresh before saving again.')
        }
        const habit = change.habit === undefined ? undefined : habitSchema.parse({ ...old.habit, ...change.habit })
        const experience = change.topics === undefined ? undefined
          : experienceSchema.parse({ ...old.experience, topics: change.topics })
        const { summary: _summary, ...retained } = old
        state.memories[index] = retainMemoryHistory(old, { ...retained, content: change.content, embedding: change.embedding,
          ...(change.content === old.content && old.summary !== undefined ? { summary: old.summary } : {}),
          ...(habit === undefined ? {} : { habit }), ...(experience === undefined ? {} : { experience }),
          sourceEventIds: memoryInputSchema.shape.sourceEventIds.parse([...new Set([...old.sourceEventIds, event.id])]),
          updatedAt: memoryTime(old) })
      }
      state.operator = { ...parsed, revision: next }
      return next
    })
  }

  /**
   * Append an attributed fact once, identified by Session plus durable sequence.
   * @param observation - Actual Session event metadata, never a model assertion.
   * @returns Committed fact, including the original fact for duplicate delivery.
   */
  observe(observation: ObservedInteraction): Promise<LifeEvent> {
    return this.change((state) => {
      const key = `session:${observation.sessionId}:${observation.eventId}`
      const previous = state.events.find(event => event.dedupKey === key)
      if (previous !== undefined) return previous
      const event = fact(state, 'interaction.observed', key, {
        kind: observation.kind, ...(observation.participant === undefined ? {} : { participant: observation.participant }), ...(observation.tool === undefined ? {} : { tool: observation.tool }),
        ...(observation.success === undefined ? {} : { success: observation.success }),
      }, observation.kind === 'user-message' ? 'user' : observation.kind === 'assistant-message' ? 'agent' : 'tool', observation.sessionId,
      observation.eventId, observation.timestamp)
      const participant = observation.participant
      if (participant !== undefined && state.people !== undefined) {
        const person = state.people.people.find(item => item.id === participant.personId)
        if (person !== undefined) { person.name = participant.name; person.relationship.label = participant.name }
        else if (participant.personId === state.people.operatorPersonId && state.emotion?.relationship !== null && state.emotion?.relationship !== undefined) {
          if (state.people.people.length >= this.config.people.maxPeople) throw new GenesisError('capacity', 'Person inventory is full; operator relationship migration was not committed.')
          state.people.people.push({ id: participant.personId, platform: participant.platform, accountId: participant.accountId,
            name: participant.name, updatedAt: observation.timestamp, sourceEventIds: [event.id],
            relationship: { ...state.emotion.relationship, scope: 'person', personId: participant.personId, label: participant.name } })
          fact(state, 'person.migrated', `operator-person:${participant.personId}`, { personId: participant.personId,
            relationshipId: state.emotion.relationship.id, sourceEventIds: [event.id] }, 'system', observation.sessionId)
        }
      }
      if (observation.tool !== undefined) {
        const capability = state.sessions[observation.sessionId]?.find(item => item.id === observation.tool)
        if (capability !== undefined) {
          capability.verification = observation.success ? 'succeeded' : 'failed'
          capability.changedAt = event.timestamp
        }
      }
      return event
    })
  }

  /**
   * Bind an actual created or resumed Session to this life without changing identity.
   * @param sessionId - Harness Session identifier.
   * @param source - Actual Harness creation/resume source.
   * @param tools - Optional initial inventory committed atomically with the binding.
   * @returns After the binding and supplied inventory commit; repeat observations are idempotent.
   */
  bind(sessionId: SessionId, source: string, tools?: readonly ToolSchema[]): Promise<void> {
    const visible = tools === undefined ? undefined : new Map(tools.map(tool => [brandString<CapabilityId>(tool.name),
      createHash('sha256').update(JSON.stringify(tool)).digest('hex')]))
    return this.change((state) => {
      fact(state, 'interaction.observed', `binding:${sessionId}:${source}`, { kind: 'session-bound', source }, 'system', sessionId)
      if (visible !== undefined) this.scanState(state, sessionId, visible)
    }, state => state.events.some(event => event.dedupKey === `binding:${sessionId}:${source}`)
      && (visible === undefined || this.sameInventory(state, sessionId, visible)) ? { result: undefined } : undefined)
  }

  /**
   * Record the first tool inventory as a baseline, then compare declarations in the same Session.
   * Baselines are observations, not growth; permissions and learned skills remain independent.
   * @param sessionId - Scope whose previous observation is compared.
   * @param tools - Current registry projection before the character's learned-tool restriction.
   * @returns After the baseline or subsequent capability changes commit with their source events.
   */
  scan(sessionId: SessionId, tools: readonly ToolSchema[]): Promise<void> {
    const visible = new Map(tools.map(tool => [brandString<CapabilityId>(tool.name),
      createHash('sha256').update(JSON.stringify(tool)).digest('hex')]))
    return this.change(state => { this.scanState(state, sessionId, visible) }, state =>
      this.sameInventory(state, sessionId, visible) ? { result: undefined } : undefined)
  }

  private sameInventory(state: Readonly<LifeState>, sessionId: SessionId, visible: ReadonlyMap<CapabilityId, string>): boolean {
    const previous = Object.hasOwn(state.sessions, sessionId) ? state.sessions[sessionId] : undefined
    return previous !== undefined && previous.filter(item => item.available).length === visible.size
      && previous.every(item => item.available ? visible.get(item.id) === item.declarationHash : !visible.has(item.id))
  }

  private scanState(state: LifeState, sessionId: SessionId, visible: ReadonlyMap<CapabilityId, string>): void {
    const previous = Object.hasOwn(state.sessions, sessionId) ? state.sessions[sessionId] ?? [] : []
    const now = new Date().toISOString()
    if (!Object.hasOwn(state.sessions, sessionId)) {
      const baseline = [...visible].map(([id, declarationHash]) => ({ id, declarationHash, firstSeenAt: now, changedAt: now,
        available: true, verification: 'unverified' as const, permission: 'checked-at-execution' as const }))
      Object.defineProperty(state.sessions, sessionId, { value: baseline, enumerable: true, writable: true, configurable: true })
      fact(state, 'capability.discovered', `inventory:${sessionId}`, { baseline: true,
        capabilities: baseline.map(item => ({ capabilityId: item.id, declarationHash: item.declarationHash })),
        verification: 'unverified', permission: 'checked-at-execution',
      }, 'system', sessionId, undefined, now)
      return
    }
    for (const [id, hash] of visible) {
      const old = previous.find(capability => capability.id === id)
      if (old !== undefined && old.available && old.declarationHash === hash) continue
      const known = Object.values(state.sessions).flat().find(capability => capability.id === id && capability.declarationHash === hash)
      if (old === undefined && known !== undefined) {
        previous.push({ ...known, available: true, changedAt: now, verification: 'unverified' })
        continue
      }
      const type = old === undefined ? 'capability.discovered' : !old.available ? 'capability.acquired' : 'capability.updated'
      const event = fact(state, type, `capability:${randomUUID()}`, {
        capabilityId: id, declarationHash: hash, available: true, verification: 'unverified',
        permission: 'checked-at-execution',
      }, 'system', sessionId)
      grow(state, event, `${id}: ${type}`, 'Observed callable declaration in this Session. Authorization is checked per call; successful use is recorded separately.')
      if (old === undefined) previous.push({ id, declarationHash: hash, firstSeenAt: now, changedAt: now,
        available: true, verification: 'unverified', permission: 'checked-at-execution' })
      else Object.assign(old, { declarationHash: hash, changedAt: now, available: true, verification: 'unverified' })
    }
    for (const old of previous) {
      if (!old.available || visible.has(old.id)) continue
      old.available = false
      old.changedAt = now
      const event = fact(state, 'capability.lost', `capability:${randomUUID()}`, { capabilityId: old.id, available: false }, 'system', sessionId)
      grow(state, event, `${old.id}: unavailable`, 'The tool is absent from this Session registry view; its historical use remains recorded.')
    }
    Object.defineProperty(state.sessions, sessionId, { value: previous, enumerable: true, writable: true, configurable: true })
  }

  /**
   * Create a sourced memory. Caller interpretation remains a candidate, never an automatic fact.
   * @param input - Validated memory fields with existing life-event references.
   * @returns Newly committed memory.
   */
  remember(input: MemoryInput): Promise<LifeMemory> {
    return this.rememberBatch([input]).then(memories => memories[0]!)
  }

  /**
   * Create a complete batch of sourced candidates atomically, retaining existing identical memories.
   * @param inputs - Memory fields with existing life-event references; all are validated before commit.
   * @returns Committed memories in input order; validation failures create no memories.
   */
  rememberBatch(inputs: MemoryInput[]): Promise<LifeMemory[]> {
    const parsed = inputs.map(input => {
      const memory = memoryInputSchema.parse(input)
      memory.content = memoryTimeText(memory.content)
      return memory
    })
    return this.change((state) => parsed.map(input => {
      this.checkSources(state, input.sourceEventIds)
      const previous = state.memories.find(memory => memory.content === input.content && memory.category === input.category
        && JSON.stringify(memory.sourceEventIds) === JSON.stringify(input.sourceEventIds))
      if (previous !== undefined) return previous
      const now = new Date().toISOString()
      const memory: LifeMemory = { ...input, id: brandString<MemoryId>(randomUUID()), lifeId: state.identity.id,
        createdAt: now, updatedAt: now }
      state.memories.push(memory)
      fact(state, 'memory.created', `memory:${memory.id}`, { memoryId: memory.id }, 'agent')
      return memory
    }))
  }

  /**
   * Replace mutable memory fields, retaining identity and creation time.
   * @param id - Memory identifier.
   * @param input - Complete replacement and evidence.
   * @returns Committed replacement, or undefined if absent.
   */
  updateMemory(id: MemoryId, input: MemoryInput): Promise<LifeMemory | undefined> {
    const parsed = memoryInputSchema.parse(input)
    parsed.content = memoryTimeText(parsed.content)
    return this.change((state) => {
      this.checkSources(state, parsed.sourceEventIds)
      const index = state.memories.findIndex(memory => memory.id === id)
      const old = state.memories[index]
      if (old === undefined) return undefined
      if (old.experience !== undefined && parsed.category !== 'episodic') {
        throw new GenesisError('invalid-source', 'An experience must retain its episodic category.')
      }
      const { embedding: _oldEmbedding, summary: _oldSummary, ...retained } = old
      const memory = retainMemoryHistory(old, { ...retained, ...parsed,
        ...(parsed.summary === undefined && parsed.content === old.content && old.summary !== undefined ? { summary: old.summary } : {}),
        updatedAt: memoryTime(old) })
      state.memories[index] = memory
      fact(state, 'memory.updated', `memory-update:${randomUUID()}`, { memoryId: id }, 'agent')
      return memory
    })
  }

  /**
   * Create a sourced operator candidate or directly edit its current projection without an edit event or revision history.
   * @param id - Client-allocated UUID; retaining it makes retries of a new entry idempotent.
   * @param draft - Editable candidate fields, never caller-supplied source references.
   * @param updatedAt - Observed version, or null for a new entry.
   * @param maxImplicit - Non-declarative count budget.
   * @returns Committed candidate retaining its identity and earlier sources when edited.
   */
  editMemory(id: MemoryId, draft: MemoryDraft, updatedAt: string | null, maxImplicit: number): Promise<LifeMemory> {
    z.uuid().parse(id)
    const parsed = memoryInputSchema.omit({ sourceEventIds: true, attribution: true, summary: true }).required({ kind: true }).parse(draft)
    parsed.content = memoryTimeText(parsed.content)
    return this.change((state) => {
      const old = state.memories.find(item => item.id === id)
      if (old?.experience !== undefined && parsed.category !== 'episodic') {
        throw new GenesisError('invalid-source', 'An experience must retain its episodic category.')
      }
      const same = old !== undefined && old.content === parsed.content && old.category === parsed.category
        && old.kind === parsed.kind && old.importance === parsed.importance && old.confidence === parsed.confidence
      if (updatedAt === null && old !== undefined) {
        if (same) return old
        throw new GenesisError('configuration-conflict', 'This new-memory request already exists with different content. Refresh before editing.')
      }
      if (updatedAt !== null && (old === undefined || old.updatedAt !== updatedAt)) {
        throw new GenesisError('configuration-conflict', 'This memory changed or was removed. Refresh before saving.')
      }
      if (same) return old
      const now = memoryTime(old)
      const source = old === undefined ? fact(state, 'interaction.observed', `manual-source:${randomUUID()}`, {
        kind: 'manual-memory-entry', memoryId: id, contentHash: createHash('sha256').update(JSON.stringify(parsed)).digest('hex'),
      }, 'user') : undefined
      const sourceEventIds = old?.sourceEventIds ?? (source === undefined
        ? (() => { throw new GenesisError('invalid-state', 'New memory provenance was not recorded.') })()
        : [source.id])
      const memory: LifeMemory = { ...parsed, id, lifeId: state.identity.id, attribution: 'user-stated',
        ...(old?.content === parsed.content && old.summary !== undefined ? { summary: old.summary } : {}),
        sourceEventIds,
        createdAt: old?.createdAt ?? now, updatedAt: now,
        ...(old?.history === undefined ? {} : { history: old.history }),
        ...(old?.experience === undefined || parsed.category !== 'episodic' ? {} : { experience: old.experience }),
        ...(old?.experienceIds === undefined ? {} : { experienceIds: old.experienceIds }),
        ...(old?.content === parsed.content && old.embedding !== undefined ? { embedding: old.embedding } : {}) }
      if (old?.habit !== undefined) state.suppressedHabitEvidence = [...new Set([
        ...(state.suppressedHabitEvidence ?? []), ...old.habit.supportEventIds,
      ])]
      if (old === undefined) state.memories.push(memory)
      else state.memories[state.memories.indexOf(old)] = memory
      this.checkImplicit(state, maxImplicit)
      queueConsolidation(state)
      if (old === undefined) fact(state, 'memory.created', `manual-write:${randomUUID()}`, { memoryId: id }, 'user')
      return memory
    })
  }

  /**
   * Replace or remove only a memory's short description, preserving its evidence and behavioral metadata.
   * @param id - Existing memory identifier.
   * @param summary - At most forty characters, or null to remove the description.
   * @param updatedAt - Displayed version; concurrent content or summary edits are refused.
   * @returns Committed memory; an unchanged description adds no revision or event.
   */
  setMemorySummary(id: MemoryId, summary: string | null, updatedAt: string): Promise<LifeMemory> {
    const parsed = memorySummarySchema.nullable().parse(summary)
    return this.change((state) => {
      const index = state.memories.findIndex(memory => memory.id === id)
      const old = state.memories[index]
      if (old === undefined || old.updatedAt !== updatedAt) {
        throw new GenesisError('configuration-conflict', 'This memory changed or was removed. Refresh before saving its summary.')
      }
      if ((old.summary ?? null) === parsed) return old
      const { summary: _summary, ...retained } = old
      const memory = { ...retained, ...(parsed === null ? {} : { summary: parsed }), updatedAt: memoryTime(old) }
      state.memories[index] = memory
      return memory
    })
  }

  /**
   * Change only the memory layer, retaining content, sources, identity and its embedding.
   * @param id - Existing memory.
   * @param kind - Explicit operator choice.
   * @param updatedAt - Version observed by the editor; stale conversions are refused.
   * @param maxImplicit - Whole-life non-declarative count budget.
   * @returns Converted memory; an idempotent same-layer request leaves history unchanged.
   */
  convertMemory(id: MemoryId, kind: 'declarative' | 'non-declarative', updatedAt: string, maxImplicit: number): Promise<LifeMemory> {
    return this.change((state) => {
      const memory = state.memories.find(item => item.id === id)
      if (memory === undefined) throw new GenesisError('invalid-source', 'This memory was removed. Refresh the memory list.')
      if (memory.updatedAt !== updatedAt) throw new GenesisError('configuration-conflict', 'This memory changed. Refresh before converting it.')
      const previous = memory.kind ?? (memory.category === 'procedural' ? 'non-declarative' : 'declarative')
      if (previous === kind) return memory
      const converted = { ...memory, kind, updatedAt: memoryTime(memory) }
      if (kind === 'declarative' && memory.habit !== undefined) state.suppressedHabitEvidence = [...new Set([
        ...(state.suppressedHabitEvidence ?? []), ...memory.habit.supportEventIds,
      ])]
      state.memories[state.memories.indexOf(memory)] = converted
      this.checkImplicit(state, maxImplicit)
      queueConsolidation(state)
      return converted
    })
  }

  /**
   * Delete current memory content; automatic deletion records a fact, while operator deletion creates no edit history.
   * @param id - Memory identifier.
   * @param updatedAt - Optional displayed version; when supplied, concurrent edits are refused.
   * @returns Whether a memory was durably removed.
   */
  deleteMemory(id: MemoryId, updatedAt?: string): Promise<boolean> {
    return this.change((state) => {
      const index = state.memories.findIndex(memory => memory.id === id)
      if (index === -1) return false
      if (updatedAt !== undefined && state.memories[index]?.updatedAt !== updatedAt) {
        throw new GenesisError('configuration-conflict', 'This memory changed. Refresh before deleting it.')
      }
      const habit = state.memories[index]?.habit
      unlinkExperience(state, id)
      state.memories.splice(index, 1)
      queueConsolidation(state)
      if (updatedAt === undefined) fact(state, 'memory.deleted', `memory-delete:${randomUUID()}`, { memoryId: id }, 'agent')
      else if (habit !== undefined) state.suppressedHabitEvidence = [...new Set([
        ...(state.suppressedHabitEvidence ?? []), ...habit.supportEventIds,
      ])]
      return true
    })
  }

  /**
   * Rename the life through an explicit application operation; immutable birth fields stay fixed.
   * @param name - Display name or null for unnamed.
   * @returns After identity and its history commit.
   */
  rename(name: string | null): Promise<void> {
    const parsed = memoryInputSchema.shape.content.nullable().parse(name)
    if (parsed !== null && parsed.length > 200) throw new GenesisError('invalid-state', 'Genesis name exceeds 200 characters.')
    return this.change((state) => {
      if (state.identity.name === parsed) return
      state.identity.name = parsed
      state.identity.updatedAt = new Date().toISOString()
      fact(state, 'identity.updated', `identity:${randomUUID()}`, { name: parsed }, 'user')
    })
  }

  /**
   * Read one committed memory without activating a Session.
   * @param id - Stable memory identifier.
   * @returns A detached memory or undefined if absent or deleted.
   */
  async getMemory(id: MemoryId): Promise<LifeMemory | undefined> {
    return (await this.snapshot()).memories.find(memory => memory.id === id)
  }

  /**
   * Atomically apply an independent writer's changes and record a completed review once.
   * @param key - Stable source turn or explicit user-memory request key.
   * @param changes - Validated changes; all references must belong to this life.
   * @param maxImplicit - Whole-life non-declarative record limit.
   * @param experience - Optional remembered event; commits atomically with the derived entries.
   * @param evidence - Completed user exchange metadata for independent habit support and durable maintenance.
   * @param scope - Optional whole-conversation selection; every supplied version and mutation is checked atomically.
   * @returns After all changes and the replay marker commit, or no-op on replay.
   */
  reviewMemory(key: string, changes: MemoryChange[], maxImplicit: number,
    experience?: ExperienceChange, evidence?: ReviewEvidence, scope?: ConversationMemoryScope): Promise<void> {
    return this.change((state) => {
      if (state.events.some(event => event.dedupKey === `memory-review:${key}`)) return
      if (scope !== undefined) {
        const current = conversationMemories(state, scope.sessionId)
        if (current.length !== scope.versions.length || scope.versions.some(version =>
          !current.some(memory => memory.id === version.id && memory.updatedAt === version.updatedAt))) {
          throw new GenesisError('configuration-conflict', 'Conversation memories changed during overview. Retry with their current versions; no changes were applied.')
        }
        const selected = new Set(current.map(memory => memory.id))
        if (changes.some(change => change.id !== undefined && !selected.has(change.id))
          || (experience?.id !== undefined && !selected.has(experience.id))) {
          throw new GenesisError('invalid-source', 'Conversation overview cannot change memories outside its selected conversation.')
        }
      }
      let experienceId: MemoryId | undefined
      if (experience !== undefined) {
        const parsed = memoryInputSchema.parse(experience.input)
        const details = experienceSchema.parse(experience.details)
        parsed.content = memoryTimeText(parsed.content)
        details.topics = details.topics.map(memoryTimeText)
        this.checkSources(state, parsed.sourceEventIds)
        const old = experience.id === undefined ? undefined : state.memories.find(item => item.id === experience.id)
        if ((experience.id !== undefined && old?.experience === undefined) || parsed.category !== 'episodic'
          || (old?.experience !== undefined && old.experience.sessionId !== details.sessionId)) {
          throw new GenesisError('invalid-source', 'Experience update requires a supplied event from the same conversation.')
        }
        experienceId = old?.id ?? brandString<MemoryId>(randomUUID())
        const now = memoryTime(old)
        const memory = retainMemoryHistory(old, { ...parsed, id: experienceId, lifeId: state.identity.id,
          experience: details, embedding: experience.embedding, createdAt: old?.createdAt ?? now, updatedAt: now })
        if (old === undefined) state.memories.push(memory)
        else state.memories[state.memories.indexOf(old)] = memory
        fact(state, old === undefined ? 'memory.created' : 'memory.updated', `experience:${randomUUID()}`, { memoryId: memory.id }, 'agent')
      }
      for (const change of changes) {
        if (change.action === 'delete') {
          const index = state.memories.findIndex(memory => memory.id === change.id)
          if (index < 0) throw new GenesisError('invalid-source', 'Memory writer referenced an absent memory. Retry with a fresh search.')
          if (change.id === experienceId) throw new GenesisError('invalid-source', 'A remembered experience cannot be deleted in the same plan.')
          unlinkExperience(state, change.id)
          state.memories.splice(index, 1)
          fact(state, 'memory.deleted', `memory-delete:${randomUUID()}`, { memoryId: change.id }, 'agent')
          continue
        }
        const parsed = memoryInputSchema.parse(change.input)
        parsed.content = memoryTimeText(parsed.content)
        this.checkSources(state, parsed.sourceEventIds)
        const old = change.id === undefined ? undefined : state.memories.find(memory => memory.id === change.id)
        if (change.id !== undefined && old === undefined) {
          throw new GenesisError('invalid-source', 'Memory writer referenced an absent memory. Retry with a fresh search.')
        }
        if (old?.experience !== undefined && parsed.category !== 'episodic') {
          throw new GenesisError('invalid-source', 'An experience must retain its episodic category.')
        }
        const now = memoryTime(old)
        const memory: LifeMemory = retainMemoryHistory(old, { ...parsed, embedding: change.embedding,
          id: old?.id ?? brandString<MemoryId>(randomUUID()), lifeId: state.identity.id,
          createdAt: old?.createdAt ?? now, updatedAt: now,
          ...(old?.experience === undefined ? {} : { experience: old.experience }),
          experienceIds: [...new Set([...(old?.experienceIds ?? []), ...(experienceId === undefined ? [] : [experienceId])])] })
        if (old === undefined) state.memories.push(memory)
        else state.memories[state.memories.indexOf(old)] = memory
        fact(state, old === undefined ? 'memory.created' : 'memory.updated', `memory-write:${randomUUID()}`, { memoryId: memory.id }, 'agent')
      }
      this.checkImplicit(state, maxImplicit)
      fact(state, 'memory.reviewed', `memory-review:${key}`, { changes: changes.length + (experience === undefined ? 0 : 1),
        ...(evidence === undefined ? {} : { feedbackTurn: `${evidence.sessionId}:${evidence.turn}`, userEventIds: evidence.userEventIds }),
        ...(scope === undefined ? {} : { conversationOverview: scope.sessionId,
          memoryVersions: scope.versions.map(version => ({ ...version })) }) }, 'agent', scope?.sessionId)
      if (evidence !== undefined && (changes.length > 0 || experience !== undefined)) queueConsolidation(state, evidence.sessionId)
    })
  }

  /**
   * Persist the operator's maintenance preference independently of deployment defaults.
   * @param enabled - Whether idle maintenance may run.
   * @returns After the preference commits; pending work is retained when disabled.
   */
  setConsolidation(enabled: boolean): Promise<void> {
    return this.change((state) => { queueConsolidation(state, undefined, false)
      if (state.consolidation) state.consolidation.enabled = enabled
    })
  }

  /**
   * Request one maintenance pass over current memories, retaining its source Session for the inference audit.
   * @returns After pending work and a fresh retry budget commit; absent conversation evidence is refused.
   */
  requestConsolidation(): Promise<void> {
    return this.change((state) => {
      queueConsolidation(state)
      if (state.consolidation?.sessionId === undefined) throw new GenesisError('invalid-source', 'Complete a conversation before consolidating memories.')
      state.consolidation.failures = 0
      delete state.consolidation.failure
    })
  }

  /**
   * Commit one bounded consolidation with an optimistic revision check and replay marker.
   * @param plan - Validated changes and the exact selected memory versions.
   * @param maxImplicit - Whole-life prompt memory limit.
   * @returns Whether the pass committed; concurrent edits leave work pending.
   */
  consolidate(plan: ConsolidationCommit, maxImplicit: number): Promise<boolean> {
    return this.change((state) => {
      const changes = plan.changes.map(change => ({ ...change,
        input: { ...change.input, content: memoryTimeText(change.input.content) },
        ...(change.habit === undefined ? {} : { habit: { ...change.habit,
          cue: memoryTimeText(change.habit.cue), response: memoryTimeText(change.habit.response) } }),
      }))
      if (!applyConsolidation(state, { ...plan, changes })) return false
      this.checkImplicit(state, maxImplicit)
      fact(state, 'memory.consolidated', `consolidation:${plan.revision}`, { revision: plan.revision,
        memoryIds: plan.versions.map(item => item.id), changes: plan.changes.length }, 'agent', state.consolidation?.sessionId)
      return true
    })
  }

  /**
   * Atomically replace selected memories with their sourced synthesis.
   * @param request - Stable request and exact source versions.
   * @param changes - Validated, embedded interpretations citing selected memories.
   * @param sessionId - Durable auxiliary inference audit Session.
   * @returns Committed results; retries return the same identities.
   */
  organizeMemories(request: MemoryOrganizationRequest, changes: OrganizedMemory[], sessionId: SessionId): Promise<LifeMemory[]> {
    return this.change((state) => {
      const previous = organizationReplay(state, request)
      if (previous !== undefined) return previous
      const prepared = changes.map(change => ({ ...change, input: { ...change.input, content: memoryTimeText(change.input.content) } }))
      organizationSources(state, request)
      const selected = new Set(request.sources.map(source => source.id))
      for (const change of changes) {
        this.checkSources(state, change.input.sourceEventIds)
        if (change.evidenceIds.some(id => !selected.has(id))) throw new GenesisError('invalid-source', 'Organization referenced unselected evidence.')
      }
      const results = prepared.map(change => appendOrganizedMemory(state, change))
      const event = fact(state, 'memory.organized', `memory-organization:${request.id}`, {
        request: { id: request.id, sources: request.sources.map(source => ({ ...source })), targetCount: request.targetCount },
        memoryIds: results.map(memory => memory.id),
        evidence: results.map((memory, index) => ({ memoryId: memory.id,
          sourceMemoryIds: changes[index]?.evidenceIds ?? [] })),
      }, 'user', sessionId)
      for (const memory of results) memory.sourceEventIds = [...new Set([...memory.sourceEventIds, event.id])]
      for (const source of request.sources) {
        unlinkExperience(state, source.id)
        state.memories.splice(state.memories.findIndex(memory => memory.id === source.id), 1)
        fact(state, 'memory.deleted', `organization-delete:${request.id}:${source.id}`, {
          memoryId: source.id, organizationEventId: event.id,
        }, 'user', sessionId)
      }
      return results
    })
  }

  /**
   * Retain a safe failed maintenance outcome without discarding pending evidence.
   * @param revision - Work revision that failed; superseded work keeps its own retry budget.
   * @param failure - Classified, redacted diagnostic from the operation owner.
   * @returns After the diagnostic commits, or a no-op for superseded work.
   */
  failConsolidation(revision: number, failure: ReviewFailure): Promise<void> {
    return this.change((state) => {
      const work = state.consolidation
      if (work === undefined || work.revision !== revision) return
      work.failures++
      work.lastAttemptAt = new Date().toISOString()
      work.failure = failure
    })
  }

  /**
   * Retrieve lexical memories by category, time, importance and recency.
   * @param query - Explicit result and character bounds.
   * @returns Highest-ranked whole memories fitting both limits.
   */
  async retrieve(query: MemoryQuery): Promise<LifeMemory[]> {
    const state = await this.snapshot()
    const chars = Math.max(0, query.chars)
    const now = new Date()
    const result: LifeMemory[] = []
    const eligible = state.memories.filter(memory => memoryVisible(state, memory, this.config.memorySharing, query.sessionId)
      && (query.category === undefined || memory.category === query.category)
      && (query.after === undefined || memory.createdAt >= query.after)
      && (query.before === undefined || memory.createdAt <= query.before))
    const ranked = query.text.trim() ? searchText(query.text, eligible.map(memoryDocument)).map(match => match.value)
      : eligible.sort((a, b) => b.importance - a.importance || b.updatedAt.localeCompare(a.updatedAt))
    for (const memory of ranked) {
      if (result.length >= Math.max(0, Math.min(query.limit, this.config.queryLimit))) break
      const next = [...result, memory]
      if (JSON.stringify(query.contentOnly ? next.map(item => readMemory(item, now, this.config.timeZone).content) : next).length > chars) continue
      result.push(memory)
    }
    return result
  }

  /**
   * Query facts in chronological order, with optional type/time filters.
   * @param query - Bounded query.
   * @returns Detached facts, newest matching page retained in ascending order.
   */
  async events(query: EventQuery): Promise<LifeEvent[]> {
    const state = await this.snapshot()
    if (query.limit <= 0) return []
    return state.events.filter(event => (query.type === undefined || event.type === query.type)
      && (query.after === undefined || event.timestamp >= query.after)
      && (query.before === undefined || event.timestamp <= query.before))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .slice(-Math.max(1, Math.min(query.limit, this.config.queryLimit)))
  }

  /**
   * Stop admission, drain accepted observations, persist graceful stop and release the domain.
   * @returns Shared teardown promise. A stop-write failure rejects after releasing storage.
   */
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.stopping = true
    this.closing = this.chain.then(async () => {
      try {
        if (this.failure !== undefined) throw this.failure
        const state = structuredClone(this.state())
        if (this.config.emotion !== undefined && state.emotion !== undefined) {
          state.emotion = emotionAt(state.emotion, new Date().toISOString())
        }
        fact(state, 'life.stopped', `stop:${randomUUID()}`, {})
        await this.persist(state)
      } finally {
        try { await this.records.close() } finally { await this.domain.close() }
      }
    })
    return this.closing
  }

  private state(): LifeState {
    const state = this.committed
    if (state === undefined) throw new GenesisError('invalid-state', 'Genesis identity is absent. Stop dependent work and inspect storage.')
    return state
  }
  private assertUsable(): void {
    if (this.failure !== undefined) throw this.failure
    if (this.stopping) throw new GenesisError('closed', 'Genesis is stopping; no new operations are accepted.')
  }
  private checkImplicit(state: LifeState, maxImplicit: number): void {
    const implicit = state.memories.filter(memory => memory.kind === 'non-declarative'
      || (memory.kind === undefined && memory.category === 'procedural')).map(({ embedding: _embedding, ...memory }) => memory)
    if (implicit.length > maxImplicit) throw new GenesisError('capacity', 'Non-declarative memory exceeds maxImplicitMemories. Consolidate or remove entries before retrying.')
    if (JSON.stringify(implicit).length > this.config.memoryChars) throw new GenesisError('capacity', 'Non-declarative memory exceeds memoryChars. Consolidate entries before retrying.')
  }
  private checkSources(state: LifeState, sources: LifeEventId[]): void {
    if (sources.some(id => !state.events.some(event => event.id === id))) {
      throw new GenesisError('invalid-source', 'Memory source event is absent from this life.')
    }
  }
  private change<T>(operation: (state: LifeState) => T, unchanged?: (state: Readonly<LifeState>) => { result: T } | undefined): Promise<T> {
    try { this.assertUsable() } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('Genesis operation refused', { cause: error }))
    }
    const pending = this.chain.then(async () => {
      if (this.failure !== undefined) throw this.failure
      const retained = unchanged?.(this.state())
      if (retained !== undefined) return retained.result
      const state = structuredClone(this.state())
      const before = JSON.stringify(state)
      const result = operation(state)
      stateSchema.parse(state)
      if (JSON.stringify(state) !== before) {
        const newEvents = state.events.slice(this.state().events.length)
        await this.persist(state)
        for (const listener of this.eventListeners) listener(structuredClone(newEvents))
      }
      return structuredClone(result)
    })
    this.chain = pending.then(() => undefined, (_error: unknown) => {
      // The requesting caller owns the failure; the FIFO tail only tracks settlement.
    })
    return pending
  }
  private async persist(state: LifeState): Promise<void> {
    const { manifest, records } = splitState(state, this.config.storage.pageSize)
    for (const record of [...records, { table: 'root', value: manifest }]) {
      const chars = JSON.stringify(record.value).length
      if (chars > this.config.storage.maxRecordChars) throw new GenesisError('capacity',
        `Genesis ${record.table} record exceeds storage.maxRecordChars (${chars}/${this.config.storage.maxRecordChars} characters). Increase this per-record limit or reduce this individual record; existing history remains intact and this operation was not committed.`)
    }
    try {
      for (const { table, key, value } of records) {
        if (this.records.table(table).get(key) === undefined) await this.records.table(table).put(key, value)
      }
      await this.domain.table('states').put('life', manifest)
      await writeBackup(backupPath(this.config.leasePath, this.config.backupPath), { manifest, records }, this.backedUp)
      this.backedUp = records.map(({ table, key }) => ({ table, key }))
      const retained = new Set(records.map(ref => `${ref.table}:${ref.key}`))
      for (const table of Object.keys(lifeRecordsDomain.tables)) {
        for (const key of this.records.table(table).keys()) {
          if (!retained.has(`${table}:${key}`)) await this.records.table(table).delete(key)
        }
      }
      this.committed = state
      this.publishLearning(state)
    } catch (error) {
      this.failure = new GenesisError('storage', 'Genesis primary commit or local backup failed; the primary may already be committed. Stop dependent work, inspect both stores and reload from verified data.', { cause: error })
      throw this.failure
    }
  }
}

function memoryTime(previous?: LifeMemory): string {
  return new Date(Math.max(Date.now(), previous === undefined ? 0 : Date.parse(previous.updatedAt) + 1)).toISOString()
}
function unlinkExperience(state: LifeState, id: MemoryId): void {
  for (const memory of state.memories) {
    if (memory.experienceIds?.includes(id)) memory.experienceIds = memory.experienceIds.filter(value => value !== id)
  }
}
