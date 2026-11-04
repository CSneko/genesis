/** Read-only Genesis status projection for authenticated Web settings. @module */
import type { LifeMotivation, LifeGoal, LifeDecision } from './agency-state.ts'
export type { LifeGoalId, MotivationId, DecisionId, LifeMotivation, LifeGoal, LifeDecision } from './agency-state.ts'
import type { LifeIdentity, LifeMemory, GrowthRecord, CapabilityState, MemoryConsolidation, LifeEventId, MemoryId, InterestId, LifeInterest } from './model.ts'
export type { EmotionState, Mood, Needs, EmotionCurrent, EmotionSettings, EmotionAdjustment } from './emotion-state.ts'
export type { RelationshipState, RelationshipVector, RelationshipAdjustment, EmotionAppraisal } from './relationship-state.ts'
export type { MemoryId, LifeMemory } from './model.ts'
export type { InterestId, LifeInterest } from './model.ts'
export type { OperatorIdentity } from './model.ts'
import type { EmotionState, EmotionSettings, Mood, Needs, EmotionCurrent } from './emotion-state.ts'
import type { RelationshipState, EmotionAppraisal } from './relationship-state.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** Bounded operator-only task monitoring; prompts and caller credentials are excluded. */
export interface ManagedTaskCatalog {
  sampledAt: string
  items: Array<{
    id: SessionId
    workspaceId: WorkspaceId
    workspaceTitle: string
    mode: string
    delivery: 'pending' | 'delivered' | 'withdrawn'
    state: string
    executionState: string
    turn: number
    attempts: number
    activeWork: number
    readable: boolean
    confirmed: boolean
  }>
  nextOffset: number | null
}
import type { Branded } from '@deepseek-ai/dsh-brand'
export type { WritingId, WritingTypeId, WritingEntry, WritingType, WritingDraft, WritingQuery, WritingMatch, WritingSearch, WritingRead, WritingCatalog } from './records-model.ts'
import type { InitiativeSettings, InteractionRecord } from './social-state.ts'
export type { InitiativeSettings, InteractionRecord } from './social-state.ts'

/** Bounded operator view of real proactive delivery state and its active policy. */
export interface InitiativeStatus {
  available: boolean
  revision: number
  sampledAt: string
  settings: InitiativeSettings | null
  mode: 'unavailable' | 'paused' | 'checking' | 'waiting-channel' | 'ready' | 'failed'
  nextCheckAt: string | null
  lastCheckAt: string | null
  failure: { code: string; message: string } | null
  lastMessage: InteractionRecord | null
  lastMessageTruncated: boolean
  channels: Array<{ id: SessionId; idle: boolean }>
  counts: Record<InteractionRecord['status'], number>
  records: Array<{ record: InteractionRecord; triggerType: string; choice: LifeDecision['candidates'][number]['disposition'] | null; messageTruncated: boolean }>
  omitted: number
  channelsOmitted: number
}

/** Stable operator request identity retained across organization retries. */
export type MemoryOrganizationId = Branded<'GenesisMemoryOrganizationId'>
/** Exact source versions and an optional result count for manual synthesis. */
export interface MemoryOrganizationRequest {
  id: MemoryOrganizationId
  sources: Array<{ id: MemoryId; updatedAt: string }>
  targetCount: number | null
}

/** Public embedding configuration; credential values never enter this projection. */
export interface EmbeddingSettings {
  url: string
  model: string
  dimensions: number
  /** Absent for a keyless service. */
  keyRef?: string | undefined
}

/** A model already configured through Harness Models or account sign-in. */
export interface ProviderRoute { kind: 'provider'; provider: string; model: string }
/** A dedicated endpoint; credentials remain in the credential store. */
export interface EndpointRoute { kind: 'jev' | 'openai'; url: string; model: string; keyRef?: string | undefined }
/** Independent memory routes shared by all conversation modes. */
export interface MemoryModelsSettings {
  /** Additional auxiliary inference attempts; omission inherits the deployment setting. */
  maxRetries?: number | undefined
  decision: ProviderRoute | (EndpointRoute & { kind: 'jev'; threshold: number })
  writer: ProviderRoute | (EndpointRoute & { kind: 'openai' })
}
/** Storage layer chosen explicitly by the operator. */
export type MemoryKind = 'declarative' | 'non-declarative'

/** Editable operator-authored candidate fields; sources and attribution are assigned by the life core. */
export type MemoryDraft = Pick<LifeMemory, 'content' | 'category' | 'importance' | 'confidence'> & { kind: MemoryKind }

/** Memory operation whose failure left a review unconfirmed. */
export type ReviewStage = 'evidence' | 'configuration' | 'decision' | 'retrieval' | 'writer' | 'embedding' | 'storage'
/** Safe diagnostic retained for the latest failed review; conversation and credentials are excluded. */
export interface ReviewFailure { stage: ReviewStage; code: string; message: string }
/** Latest live review; failed outcomes carry the actual failing operation and safe cause. */
export type ReviewOutcome = {
  sessionId: SessionId
  turn: number
  /** Completion time; absent on older Host responses. */
  completedAt?: string
  /** System One update probability and the threshold actually used; absent for generative decisions. */
  decision?: { probability: number; threshold: number }
} & (
  { state: 'saved' | 'skipped' } | { state: 'failed'; failure: ReviewFailure }
)

/** One bounded, attributed emotion transition for the settings history. */
export interface EmotionHistoryEntry {
  id: LifeEventId
  timestamp: string
  source: 'system' | 'user' | 'agent'
  kind: 'initialized' | 'configured' | 'reviewed' | 'adjusted' | 'upgraded' | 'relationship-adjusted'
  reason: string
  current: EmotionCurrent
  relationship?: RelationshipState | null
  targets?: Partial<Record<keyof EmotionCurrent, string>> | undefined
  appraisal?: EmotionAppraisal
  effects?: {
    needs?: Record<string, number> | undefined
    current: Record<string, number>
    mood: Record<string, number>
    relationship: Record<string, number>
    repetitionFactor: number
    moodEligible: boolean
    repeated: boolean
  }
  mood: Mood
  needs: Needs
  sourceEventIds: LifeEventId[]
}

/** Bounded interest state with the latest cited exchange. */
export type InterestSummary = Pick<LifeInterest, 'id' | 'topic' | 'stage' | 'reason' | 'createdAt' | 'updatedAt'>
  & { evidenceCount: number; sourceEventIds: LifeEventId[] }
/** One append-only transition visible to the operator. */
export interface InterestHistoryEntry {
  id: LifeEventId
  interestId: InterestId
  timestamp: string
  topic: string
  before: LifeInterest['stage'] | null
  after: LifeInterest['stage']
  signal: LifeInterest['evidence'][number]['signal']
  reason: string
  sourceEventIds: LifeEventId[]
}

/** Bounded personality and expression records, selected before unrelated memory previews. */
export interface PersonalityStatus {
  /** Current self and procedural non-declarative records, including clearly marked retired habits. */
  entries: LifeMemory[]
  /** Matching records omitted by the item or complete-response budget. */
  omitted: number
}
/** A sampled view; historical Session observations never become current availability. */
export interface LifeStatus {
  /** Exclusive Life preset; absence retains the foundation all-Session policy. */
  lifePreset?: string
  /** Explicit human-authored participant identity; zero revision denotes unset identity. */
  operator?: { name: string; identity: string; revision: number }
  /** Manual synthesis bounds; absent when auxiliary memory is disabled. */
  organization?: { selectionLimit: number; maxResults: number }
  /** Recovered simulated emotion and latest live appraisal diagnostic; absent when disabled. */
  emotion?: EmotionState & { settings: EmotionSettings; history: EmotionHistoryEntry[]; omitted: number; review?: ReviewOutcome }
  /** Sourced interest interpretations and bounded append-only transitions. */
  interest?: {
    entries: InterestSummary[]
    omitted: number
    history: InterestHistoryEntry[]
    historyOmitted: number
    review?: ReviewOutcome
  }
  /** Independent routes, revision and credential availability; never credential values. */
  models?: MemoryModelsSettings & { revision: number; keys: Record<'decision' | 'writer', { configured: boolean; writable: boolean }> }
  /** Persistent maintenance cursor, effective preference and bounded automatic retry state. */
  consolidation?: MemoryConsolidation & { enabled: boolean; maxFailures: number; minHabitSupport: number }
  /** Last review outcome; failures do not stop the conversation. */
  review?: ReviewOutcome
  /** Effective configuration and credential presence, without the secret. */
  embedding?: EmbeddingSettings & { revision: number; keyConfigured: boolean; keyWritable: boolean }
  /** Absent in foundation-only mode; credentials must be configured before the naming step. */
  setup?: { phase: 'credentials' | 'naming' | 'conversation' | 'ready'; firstSessionId?: SessionId }
  identity: LifeIdentity
  sampledAt: string
  runtime: { platform: string; node: string; liveSessions: number }
  counts: { events: number; memories: number; growth: number }
  capabilities: Array<{ sessionId: SessionId; capability: CapabilityState }>
  memories: LifeMemory[]
  growth: GrowthRecord[]
  omitted: { capabilities: number; memories: number; growth: number }
}

/** Bounded, newest-first memory page; null nextOffset means the filtered selection is exhausted. */
export interface MemoryCatalog {
  items: LifeStatus['memories']
  total: number
  nextOffset: number | null
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'genesis/operation': { reason: string }
    'genesis/review': { stage: ReviewStage; reason: string }
  }
}

/** Bounded operator agency view; omitted records are counted rather than silently discarded. */
export interface AgencyStatus {
  enabled: boolean
  revision: number
  sampledAt: string
  motivations: Array<LifeMotivation & { currentStrength: number | null }>
  goals: Array<LifeGoal & { historyOmitted: number }>
  decisions: LifeDecision[]
  sessions: Array<{ id: SessionId; idle: boolean }>
  omitted: { motivations: number; goals: number; decisions: number; sessions: number }
}

export type { ToolkitId, ToolkitDefinition, ToolkitStatus } from './toolkit-types.ts'

export type { PersonSummary, PeopleCatalog, PersonDetail, PersonEvidence, PersonId } from './people-status.ts'

export type { TemporaryMemoryId, TemporaryMemory, TemporarySettings, TemporaryStatus } from './temporary-model.ts'
