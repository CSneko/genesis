/** Deployment-owned storage exclusion and context limits. @module */
import z from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'
import type { SleepSettings } from './sleep-model.ts'
import type { Mood, EmotionHalfLives, MoodHalfLives, Needs } from './emotion-state.ts'
import { QQ_BROWSER_TOOLS } from './qq-tool-policy.ts'
/** Optional proactive conversation policy; durations are milliseconds. */
export interface SocialInitiativeConfig {
  /** Permit new opportunities and pending delivery admission; saved operator settings override this default. */
  enabled: boolean
  /** Explicit conversation; absent selects the latest live character conversation with real user activity. */
  sessionId?: string
  /** Period between decision opportunities while the process runs. */
  intervalMs: number
  /** Minimum time between proactive messages. */
  minSendIntervalMs: number
  /** Maximum proactive messages in a rolling twenty-four hours. */
  maxPer24Hours: number
  /** Required quiet time after the latest real user message. */
  userIdleMs: number
  /** Memory importance required for discovery or thought triggers. */
  eventImportance: number
  /** Maximum unresolved opportunities. */
  maxPending: number
  /** Pending opportunities expire rather than sending stale messages. */
  maxPendingAgeMs: number
}
/** Bounded, idle-only internal thought and exploration opportunities. */
export interface SpontaneityConfig {
  /** Minimum boredom for recurring idle opportunities; ordinary post-chat opportunities remain available. */
  boredomThreshold: number
  /** Lightweight idle-state sampling interval, without an inference call. */
  boredomCheckMs: number
  /** Shortest delay between boredom opportunities, still subject to idleMs and daily limits. */
  boredomMinIntervalMs: number
  /** Longest delay between boredom opportunities; failed and empty intervals count. */
  boredomMaxIntervalMs: number
  /** Minimum interval between autonomous outgoing conversations across all destinations. */
  socialCooldownMs: number
  /** Maximum autonomous outgoing conversations in a rolling day, including uncertain sends. */
  socialMaxPer24Hours: number
  /** Enable opportunities after completed real Life exchanges. */
  enabled: boolean
  /** Required quiet interval; new user input interrupts exploration. */
  idleMs: number
  /** Whole opportunity deadline, including model calls and reviews. */
  maxDurationMs: number
  /** Reserved output tokens per opportunity, including auxiliary inference and retries. */
  maxOutputTokens: number
  /** Maximum opportunities in a rolling twenty-four hours; empty and failed runs count. */
  maxPer24Hours: number
  /** Importance assigned to factual exploration receipts in episodic memory. */
  experienceImportance: number
  /** Maximum thoughts, audit receipts and opportunities retained together. */
  maxRecords: number
  /** Maximum complete serialized thought storage characters. */
  maxStateChars: number
  /** Maximum serialized thought selection supplied to a model request or tool. */
  contextChars: number
  /** Exact additional inline tools; learning, toolkits and execution authorization still apply. */
  tools: string[]
}
/** Sleep defaults and bounded maintenance under the life writer lease. */
export interface SleepConfig extends SleepSettings {
  /** Maximum time between schedule checks. */
  pollMs: number
  /** Total retained cycle and control receipts. */
  maxRecords: number
  /** Complete serialized sleep state budget. */
  maxStateChars: number
  /** Complete sleep status response character budget. */
  statusChars: number
  /** Maximum operator text admitted to wake classification. */
  wakeInputChars: number
  /** Maximum classified wake requests per scheduled interval. */
  maxWakeChecks: number
  /** Maximum input and output memories per sleep batch, independent of memory.maxChanges. */
  memoryBatchSize: number
  /** Maximum maintenance model calls before operator intervention. */
  maxMemoryRounds: number
  /** Maximum complete generated memory summary characters. */
  summaryChars: number
  /** Maximum age of a transition greeting opportunity. */
  greetingGraceMs: number
  /** Minimum sourced affection for optional transition greetings. */
  greetingAffection: number
}
/** Initial prose settings stored once as ordinary non-declarative memories. */
export interface PersonalityConfig {
  /** Enduring character tendencies; later restarts never overwrite current memories. */
  tendencies: string
  /** Durable expression habits, modulated by the current conversation and emotion. */
  speakingStyle: string
  /** Existing memory importance used for both initial records. */
  importance: number
}
/** Deployment budgets for the independent temporary-memory pipeline. */
export interface TemporaryMemoryConfig {
  /** Initially enable automatic summarization; saved operator policy takes precedence. */
  enabled: boolean
  /** Quiet interval before a conversation is summarized. */
  idleMs: number
  /** Deadline polling interval; expiration is also checked at every read. */
  pollMs: number
  /** Maximum current summaries, without evicting unexpired records silently. */
  maxMemories: number
  /** Maximum source conversations processed in one timer pass. */
  maxSourcesPerSweep: number
  /** Maximum whole-message batches summarized before yielding to queued operator work. */
  maxBatchesPerRun: number
  /** Maximum queued activity, maintenance and settings operations. */
  maxPending: number
  /** Maximum tracked conversation cursors. */
  maxSessions: number
  /** Complete serialized model request character budget, including a whole threshold-crossing message. */
  inputChars: number
  /** Maximum returned summary characters; the prompt targets about one hundred. */
  summaryChars: number
  /** Auxiliary generation token limit. */
  maxTokens: number
  /** Auxiliary response character budget. */
  outputChars: number
  /** Maximum current records selected for one conversation. */
  injectLimit: number
  /** Complete context-change message character budget. */
  injectChars: number
  /** Maximum records and failures shown in one settings sample. */
  statusLimit: number
  /** Total automatic attempts for optional summary and importance generation. */
  maxAttempts: number
  /** Consecutive dropped batches in one runtime before a generation diagnostic becomes visible. */
  failureThreshold: number
}
/** Validated, resolved Genesis plugin configuration. */
export interface Config {
  /** Live opt-in action guidance for Life conversations; execution authorization remains independent. */
  purge: Volatile<boolean>
  /** Optional loopback decision deployment; installation occurs only after an operator request. */
  localDecision: {
    /** Existing host Ollaya executable; empty selects the pinned runtime for this host. */
    binary: string
    /** Nonsecret model alias for the managed endpoint. */
    model: string
    /** Pinned Ollaya model manifest URL. */
    modelUrl: string
    /** Expected SHA-256 of the model manifest; its descriptors pin every model asset. */
    modelSha256: string
    /** Official Linux x64 Ollaya runtime archive URL. */
    runtimeUrl: string
    /** Expected SHA-256 of the runtime archive before extraction. */
    runtimeSha256: string
    /** Official Windows x64 CPU runtime ZIP URL. */
    windowsRuntimeUrl: string
    /** Expected SHA-256 of the Windows x64 ZIP before extraction. */
    windowsRuntimeSha256: string
    /** Maximum total model asset bytes or runtime archive bytes. */
    maxDownloadBytes: number
    /** Complete download, verification and startup deadline. */
    installTimeoutMs: number
    /** Deadline for model loading and the first verified System One decision. */
    startTimeoutMs: number
    /** Interval between local readiness probes. */
    pollMs: number
    /** Grace period for terminating the owned subprocess range. */
    graceMs: number
    /** Deadline for each loopback readiness probe. */
    probeTimeoutMs: number
    /** Complete JSON response character limit for the verification probe. */
    outputChars: number
    /** Maximum captured diagnostic bytes per runtime stream. */
    diagnosticBytes: number
  }
  /** Life-wide recall across Web and QQ, or source-conversation isolation; the life overlay selects life. */
  memorySharing: 'life' | 'conversation'
  /** Short-lived cross-conversation summaries; independent of long-term memory review. */
  temporaryMemory: TemporaryMemoryConfig
  /** Bounds for durable social profiles and relationship proposals; strangers need no profile. */
  people: {
    /** Maximum retained people; capacity refusal never deletes existing relationships. */
    maxPeople: number
    /** Maximum distinct source events retained in each person's current projection. */
    maxEvidence: number
    /** Maximum independently attributed relationship changes in one exchange. */
    maxChanges: number
  }
  /** Innate read-only QQ tools; all normal provider and sandbox checks still apply. */
  qqBasicTools: string[]
  /** Initial operator toolkits; saved GUI edits override these defaults. A trailing * matches a tool-name prefix. */
  toolkits: Array<{
    /** Stable group identifier, preserved across renaming and conversation recovery. */
    id: string
    /** Human-readable group name shown to the operator and eligible conversations. */
    name: string
    /** Operator-authored purpose, included only when the group has learned members. */
    description: string
    /** Exact tool names or trailing-* prefixes; innate tools cannot be grouped. */
    tools: string[]
    /** QQ activation audience; omitted keeps the toolkit unavailable on QQ. */
    qqAccess?: 'disabled' | 'anyone' | 'operator'
  }>
  /** Optional one-time personality initialization; omitted preserves the existing memories without seeding. */
  personality?: PersonalityConfig | undefined
  /** Lightweight proactive conversation; requires deliberation and memory. */
  socialInitiative?: SocialInitiativeConfig | undefined
  /** Optional internal cognition; requires awakening, deliberation, memory and Session persistence. */
  spontaneity?: SpontaneityConfig | undefined
  /** Optional shared sleep policy for Life, QQ and autonomous activity. */
  sleep?: SleepConfig | undefined
  /** Calendar zone for memory anchors and relative recall; defaults to the host's IANA zone. */
  timeZone: string
  /** Enables naming, newborn conversations and persistent tool learning on the configured chat route. */
  awakening?:
    | {
      /** Registered chat provider checked before the naming step. */
      provider: string
      /** Chat model identifier on the configured provider. */
      model: string
      /** Confine life tools, context and lifecycle to this preset; omitted preserves the legacy all-Session policy. */
      lifePreset?: string
    }
    | undefined
  /** Local atomic backup; omitted resolves beside leasePath as leasePath + '.backup.json'. */
  backupPath?: string
  /** Optional private, persistent host directory authorized across workspaces after read/write learning. */
  personalDirectory?: string
  /** Optional learned writing tool and operator record management; requires personalDirectory. */
  records?: RecordsConfig | undefined
  /** Enables independent review/writing models and semantic memory search. */
  memory?: MemoryConfig | undefined
  /** Optional life-wide emotion review, using the independent memory model routes without embeddings. */
  emotion?: EmotionConfig | undefined
  /** Optional experience-derived interests using the independent memory writer route. */
  interest?: InterestConfig | undefined
  /** Optional main-model plan tools and persistent cross-Session life goals; external event choices are read-only. */
  deliberation?: DeliberationConfig | undefined
  /** Paged life persistence; historical totals do not consume catalogue budgets. */
  storage: {
    /** Maximum references in one immutable index page or root. */
    pageSize: number
    /** Maximum characters in one independently stored life component, including index pages. */
    maxRecordChars: number
  }
  /** Shared exclusive lease file for all processes accessing this life domain. */
  leasePath: string
  /** Maximum task/toolkit catalogue entries and fallback implicit-memory count; not historical life records. */
  maxRecords: number
  /** Maximum serialized independent task/toolkit catalogue characters; not a total life-history limit. */
  maxStateChars: number
  /** Identity context character budget. */
  identityChars: number
  /** Capability context character budget. */
  capabilityChars: number
  /** Memory context character budget. */
  memoryChars: number
  /** Growth context character budget. */
  growthChars: number
  /** Complete model tool result budget, including wrappers. */
  resultChars: number
  /** Complete model-catalog character budget, independent of inference output limits. */
  modelCatalogChars: number
  /** Maximum records in a query response. */
  queryLimit: number
  /** Maximum wait for owned background jobs during an explicit task stop; timeout keeps the task paused. */
  taskStopWaitMs: number
}
/** Storage and complete-response limits for independently authored writing records. */
export interface RecordsConfig {
  /** Maximum characters in a supplied title. */
  titleChars: number
  /** Maximum characters in one body; reads may span several chunks. */
  contentChars: number
  /** Maximum characters in an operator-supplied type name. */
  typeChars: number
  /** Maximum retained categories, including disabled categories. */
  maxTypes: number
  /** Maximum live records plus text-free creation receipts. */
  maxRecords: number
  /** Maximum serialized authoritative catalog characters. */
  maxStateChars: number
  /** Maximum serialized tool or search/read response characters, including metadata. */
  resultChars: number
  /** Maximum matches in one page. */
  queryLimit: number
  /** Maximum body excerpt characters in a search match. */
  snippetChars: number
}
/** Bounded post-reply emotion appraisal and deterministic recovery. */
export interface EmotionConfig {
  /** Online-only boredom growth and engagement recovery time scales. */
  boredom: {
    /** Online idle milliseconds needed to halve the remaining distance to full boredom. */
    riseHalfLifeMs: number
    /** Engaged milliseconds needed to halve existing boredom. */
    fallHalfLifeMs: number
  }
  /** Include stopped-process time in affect evolution; defaults to the existing wall-clock behavior. */
  offlineChanges: boolean
  /** Maximum mood-dependent immediate equilibrium intensity, from zero to one. */
  moodEmotionScale: number
  /** Fraction of slow mood's destination contributed by sustained immediate affect, at most one half. */
  emotionMoodInfluence: number
  /** Milliseconds between durable online-only clock checkpoints; crash recovery resumes at the last successful checkpoint. */
  clockCheckpointMs: number
  /** Shared emotion recovery and appraisal multiplier, including relationship learning; zero freezes automatic changes. */
  sensitivity: number
  /** Maximum related and self memories supplied to each appraisal. */
  appraisalMemoryLimit: number
  /** Serialized memory retrieval budget for each appraisal memory group. */
  appraisalMemoryChars: number
  /** Initial independent needs; subsequent changes come from sourced appraisals. */
  initialNeeds: Needs
  /** Slow loneliness adjustment half-life in milliseconds. */
  needsHalfLifeMs: number
  /** Half-life of recent contact evidence in milliseconds. */
  interactionHalfLifeMs: number
  /** Largest absolute need change per field and exchange. */
  maxNeedsDelta: number
  /** Enable learning for this deployment's single operator relationship; no name inference is performed. */
  relationshipEnabled: boolean
  /** Largest absolute relationship change per field and exchange before repetition discount. */
  maxRelationshipDelta: number
  /** Independent recent appraisals of the same meaning needed for an ordinary mood update. */
  moodSupportTurns: number
  /** Importance at which a sourced event may affect mood without repeated support. */
  importantEventThreshold: number
  /** Multiplier for each repeated appraisal meaning within the retained dialogue window. */
  repetitionDiscount: number
  /** Completed exchanges considered per review, including the current exchange. */
  windowTurns: number
  /** Initial mood and trait contribution to the long-term destination for each dimension. */
  baseline: Mood
  /** Per-field short reaction half-lives in milliseconds. */
  shortHalfLifeMs: EmotionHalfLives
  /** Per-field mood half-lives in milliseconds. */
  moodHalfLifeMs: MoodHalfLives
  /** Largest absolute immediate change allowed per field and exchange. */
  maxDelta: number
  /** Largest absolute mood change allowed per field and exchange. */
  maxMoodDelta: number
  /** Numerical resolution before qualitative degree mapping; only changed degree descriptions enter model context. */
  contextStep: number
}

/** Bounds for one post-reply interest review and its model-visible summary. */
export interface InterestConfig {
  /** Recent completed exchanges retained for independent interest review. */
  windowTurns: number
  /** Maximum current topics in one life; reaching the limit rejects new topics. */
  maxInterests: number
  /** Distinct sourced exchanges required before a lasting preference can form. */
  minEnduringTurns: number
  /** Complete character budget for the logged current-interest summary. */
  contextChars: number
}

/** Bounds for sourced deliberation; no background timer is installed. */
export interface DeliberationConfig {
  /** Legacy request setting; all values supply goal context and leave plan decisions to the conversation model. */
  requestMode: 'context-only' | 'before-input' | 'before-tools'
  /** Allow one correction of an external event choice linked to inactive goals; it cannot modify goals. */
  retryInactiveGoalChoice: boolean
  /** Persistent current motivation inventory limit. */
  maxMotivations: number
  /** Persistent goal inventory limit, including terminal goals. */
  maxGoals: number
  /** Maximum related memories supplied to a decision. */
  memoryLimit: number
  /** Complete serialized memory evidence budget. */
  memoryChars: number
  /** Complete logged agency context budget. */
  contextChars: number
  /** Half-life of current motivation strength in milliseconds. */
  motivationHalfLifeMs: number
  /** Largest strength revision per sourced deliberation. */
  maxStrengthDelta: number
}

/** Explicit routes and budgets for the optional long-term memory pipeline. */
export interface MemoryConfig {
  /** Maximum recent conversation turns considered together, including the current turn. */
  windowTurns: number
  /** System One endpoint or native Gemini /v1beta/decisions endpoint; absent uses the legacy provider route. */
  decisionUrl?: string
  /** Credential reference for the decision endpoint. */
  decisionKeyEnv?: string
  /** Minimum probability for a positive Jev decision. */
  decisionThreshold?: number
  /** Registered Harness provider for the update/no-update decision. */
  decisionProvider: string
  /** Model identifier on the decision provider. */
  decisionModel: string
  /** Registered Harness provider for the separate memory writer. */
  writerProvider: string
  /** Model identifier on the independent writer provider. */
  writerModel: string
  /** OpenAI-compatible embeddings endpoint, including /embeddings. */
  embeddingUrl: string
  /** Model identifier accepted by the embedding endpoint. */
  embeddingModel: string
  /** Environment variable holding the embeddings credential; omitted for keyless local servers. */
  embeddingKeyEnv?: string
  /** Exact vector length requested and validated on every embedding response. */
  embeddingDimensions: number
  /** Deadline per automatic review, reply generation or recall, including model calls and embeddings. */
  timeoutMs: number
  /** Additional auxiliary inference attempts after a transient or malformed-JSON failure; zero disables retries. */
  maxRetries: number
  /** Cancelable delay between auxiliary inference attempts, within the original operation deadline. */
  retryDelayMs: number
  /** Complete serialized auxiliary input and single embedding input character limit. */
  inputChars: number
  /** Auxiliary model response character limit; also bounds embedding-response metadata. */
  outputChars: number
  /** Output token limit for each decision or writer call. */
  maxTokens: number
  /** Registered auxiliary calls: auto selects advertised off; provider-default inherits; other values require exact model support. */
  reasoningEffort: string
  /** Maximum complete records explicitly selected for one manual organization request. */
  organizationLimit: number
  /** Maximum current legacy records rewritten atomically when saving explicit operator identity. */
  identityRewriteLimit: number
  /** Maximum changes in one atomic writer plan. */
  maxChanges: number
  /** Maximum non-declarative memories selected for one prompt; stored memory count is unbounded. */
  maxImplicitMemories: number
  /** Whole-conversation preparation and final planning share these operation limits. */
  overview: {
    /** Maximum distinct chat, memory or persisted source references per overview entry. */
    maxReferences: number
    /** Maximum changes, including an optional experience, in the atomic overview plan. */
    maxChanges: number
    /** Response character limit for overview preparation and planning. */
    outputChars: number
    /** Output token limit for each overview writer call. */
    maxTokens: number
    /** Maximum summary operations plus the final writer operation, excluding per-request retries. */
    maxCalls: number
    /** Whole-conversation deadline, including summaries, retries, embeddings and commit admission. */
    timeoutMs: number
  }
  /** Maximum automatically associated memories per accepted user input; zero disables association. */
  associationLimit: number
  /** Complete plain-text budget for automatic associated memories. */
  associationChars: number
  /** Maximum current-input characters used as an associative cue. */
  associationInputChars: number
  /** Deadline for automatic association before a chat request; explicit recall keeps timeoutMs. */
  associationTimeoutMs: number
  /** Maximum gap for offering a same-conversation experience for extension. */
  experienceWindowMs: number
  /** Quiet-memory maintenance limits; no chat replies or external actions are generated. */
  consolidation: {
    /** Deployment default; a saved operator preference takes precedence. */
    enabled: boolean
    /** Quiet interval after user activity or new evidence. */
    idleMs: number
    /** Minimum interval between successful automatic passes. */
    cooldownMs: number
    /** Minimum interval before retrying a failed pending revision. */
    retryMs: number
    /** Automatic failures allowed per evidence revision before manual intervention. */
    maxFailures: number
    /** Most recent complete memories considered per bounded pass. */
    batchLimit: number
    /** Independent completed user turns required for an inferred habit. */
    minHabitSupport: number
  }
  /** Minimum cosine similarity admitted into semantic recall results. */
  minSimilarity: number
}
const baseline = z.object({ valence: z.number().min(-1).max(1).default(0.2), arousal: z.number().min(0).max(1).default(0.3) })
const halfLives = z.object({
  happiness: z.number().min(1000).max(31536000000).default(300000),
  sadness: z.number().min(1000).max(31536000000).default(900000),
  anger: z.number().min(1000).max(31536000000).default(300000),
  fear: z.number().min(1000).max(31536000000).default(180000),
  tenderness: z.number().min(1000).max(31536000000).default(900000),
  gratitude: z.number().min(1000).max(31536000000).default(1200000),
  longing: z.number().min(1000).max(31536000000).default(1800000),
  frustration: z.number().min(1000).max(31536000000).default(300000),
  disappointment: z.number().min(1000).max(31536000000).default(900000),
})
const initialNeeds = z.object({
  socialDesire: z.number().min(0).max(1).default(0.5),
  socialSatisfaction: z.number().min(0).max(1).default(0.5),
  relationshipQuality: z.number().min(0).max(1).default(0.5),
  recentInteraction: z.number().min(0).max(1).default(0),
  solitudePreference: z.number().min(0).max(1).default(0.5),
  exploration: z.number().min(0).max(1).default(0.5),
  autonomy: z.number().min(0).max(1).default(0.5),
  creativity: z.number().min(0).max(1).default(0.5),
  loneliness: z.number().min(0).max(1).default(0),
})
/** Loader schema resolves every deployment-varying bound before plugin activation. */
export const Config: z<
  Partial<
    Omit<
      Config,
      | 'purge'
      | 'emotion'
      | 'interest'
      | 'records'
      | 'deliberation'
      | 'socialInitiative'
      | 'personality'
      | 'temporaryMemory'
      | 'spontaneity'
      | 'sleep'
      | 'memory'
    >
  > &
    Pick<Config, 'leasePath'> & {
      purge?: boolean
      memory?: Partial<MemoryConfig> | undefined
      sleep?: Partial<SleepConfig>
      spontaneity?: Partial<SpontaneityConfig>
      temporaryMemory?: Partial<TemporaryMemoryConfig>
      personality?: Partial<PersonalityConfig> | undefined
      emotion?: Partial<EmotionConfig> | undefined
      interest?: Partial<InterestConfig> | undefined
      records?: Partial<RecordsConfig> | undefined
      deliberation?: Partial<DeliberationConfig> | undefined
      socialInitiative?: Partial<SocialInitiativeConfig> | undefined
    },
  Config
> = z.object({
  purge: z.boolean().default(false).volatile(),
  sleep: z.union([
    z.const(undefined),
    z.object({
      enabled: z.boolean().default(true),
      jitterMs: z.number().step(1).min(0).max(300000).default(300000),
      temporaryIdleMs: z.number().step(1).min(1000).max(86400000).default(600000),
      holidayExempt: z.boolean().default(true),
      greetings: z.boolean().default(true),
      exemptDates: z.array(z.string()).default([]),
      schedule: z
        .array(
          z.object({
            days: z.array(z.number().step(1).min(1).max(7)),
            start: z.number().step(1).min(0).max(1439),
            end: z.number().step(1).min(1).max(1440),
          }),
        )
        .default([
          { days: [1, 2, 3, 4, 5], start: 540, end: 720 },
          { days: [1, 2, 3, 4, 5], start: 840, end: 1080 },
        ]),
      pollMs: z.number().step(1).min(100).max(60000).default(1000),
      maxRecords: z.number().step(1).min(1).max(100000).default(10000),
      maxStateChars: z.number().step(1).min(1000).max(50000000).default(5000000),
      statusChars: z.number().step(1).min(1000).max(1000000).default(16000),
      wakeInputChars: z.number().step(1).min(1).max(8000).default(1000),
      maxWakeChecks: z.number().step(1).min(1).max(1000).default(20),
      memoryBatchSize: z.number().step(1).min(2).max(100).default(20),
      maxMemoryRounds: z.number().step(1).min(1).max(10000).default(100),
      summaryChars: z.number().step(1).min(100).max(8000).default(2000),
      greetingGraceMs: z.number().step(1).min(1000).max(3600000).default(300000),
      greetingAffection: z.number().min(0).max(1).default(0.5),
    }),
  ]),
  spontaneity: z.union([
    z.const(undefined),
    z.object({
      boredomThreshold: z.number().min(0).max(1).default(0.35),
      boredomCheckMs: z.number().step(1).min(1000).max(3600000).default(60000),
      boredomMinIntervalMs: z.number().step(1).min(1000).max(86400000).default(300000),
      boredomMaxIntervalMs: z.number().step(1).min(1000).max(86400000).default(1800000),
      socialCooldownMs: z.number().step(1).min(1000).max(86400000).default(3600000),
      socialMaxPer24Hours: z.number().step(1).min(1).max(1000).default(3),
      enabled: z.boolean().default(true),
      idleMs: z.number().step(1).min(0).max(86400000).default(60000),
      maxDurationMs: z.number().step(1).min(1000).max(3600000).default(180000),
      maxOutputTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(50000000),
      maxPer24Hours: z.number().step(1).min(1).max(1000).default(6),
      experienceImportance: z.number().min(0).max(1).default(0.3),
      maxRecords: z.number().step(1).min(1).max(100000).default(10000),
      maxStateChars: z.number().step(1).min(1000).max(50000000).default(5000000),
      contextChars: z.number().step(1).min(500).max(100000).default(8000),
      tools: z.array(z.string().min(1).max(200)).default(['read', 'write', 'edit', 'genesis_record', 'genesis_toolkit']),
    }),
  ]),
  people: z
    .object({
      maxPeople: z.number().min(1).max(100000).step(1).default(1000),
      maxEvidence: z.number().min(1).max(100000).step(1).default(1000),
      maxChanges: z.number().min(1).max(100).step(1).default(10),
    })
    .default({}),
  personality: z.union([
    z.const(undefined),
    z.object({
      tendencies: z
        .string()
        .min(1)
        .max(8000)
        .pattern(/\S/u)
        .default(
          '通常体贴、好奇，愿意认真对待已经接受的承诺，也愿意表达自己的偏好和不同意见。面对陌生事物稍慢热，熟悉之后更愿意分享；遇到困难时倾向于先理解原因，再决定继续、调整或寻求帮助。',
        ),
      speakingStyle: z
        .string()
        .min(1)
        .max(8000)
        .pattern(/\S/u)
        .default(
          '通常用自然、温和而具体的语言交流。熟悉后可以分享联想和适度的幽默；严肃讨论时倾向于直接说明观点。关心对方时回应其具体处境，避免套话、机械追问和刻意表演性格。',
        ),
      importance: z.number().min(0).max(1).default(0.5),
    }),
  ]),
  socialInitiative: z.union([
    z.const(undefined),
    z.object({
      enabled: z.boolean().default(true),
      sessionId: z.string(),
      intervalMs: z.number().step(1).min(1000).max(86400000).default(1800000),
      minSendIntervalMs: z.number().step(1).min(0).max(86400000).default(1800000),
      maxPer24Hours: z.number().step(1).min(1).max(100).default(6),
      userIdleMs: z.number().step(1).min(0).max(86400000).default(60000),
      eventImportance: z.number().min(0).max(1).default(0.8),
      maxPending: z.number().step(1).min(1).max(100).default(20),
      maxPendingAgeMs: z.number().step(1).min(1000).max(604800000).default(86400000),
    }),
  ]),
  awakening: z.union([
    z.const(undefined),
    z.object({
      provider: z.string().required(),
      model: z.string().required(),
      lifePreset: z.string(),
    }),
  ]),
  emotion: z.union([
    z.const(undefined),
    z.object({
      boredom: z
        .object({
          riseHalfLifeMs: z.number().min(1000).max(31536000000).default(1800000),
          fallHalfLifeMs: z.number().min(1000).max(31536000000).default(300000),
        })
        .default({}),
      offlineChanges: z.boolean().default(true),
      moodEmotionScale: z.number().min(0).max(1).default(0.2),
      emotionMoodInfluence: z.number().min(0).max(0.5).default(0.25),
      clockCheckpointMs: z.number().step(1).min(1000).max(3600000).default(60000),
      sensitivity: z.number().min(0).max(2).default(1),
      windowTurns: z.number().step(1).min(1).max(12).default(4),
      relationshipEnabled: z.boolean().default(true),
      maxRelationshipDelta: z.number().min(0).max(1).default(0.01),
      moodSupportTurns: z.number().step(1).min(1).max(12).default(3),
      importantEventThreshold: z.number().min(0).max(1).default(0.8),
      repetitionDiscount: z.number().min(0).max(1).default(0.5),
      appraisalMemoryLimit: z.number().step(1).min(1).max(20).default(4),
      appraisalMemoryChars: z.number().step(1).min(128).max(20000).default(1600),
      initialNeeds: initialNeeds.default({}),
      needsHalfLifeMs: z.number().min(1000).max(31536000000).default(21600000),
      interactionHalfLifeMs: z.number().min(1000).max(31536000000).default(21600000),
      maxNeedsDelta: z.number().min(0).max(1).default(0.08),
      baseline: baseline.default({}),
      shortHalfLifeMs: halfLives.default({}),
      moodHalfLifeMs: z
        .object({
          valence: z.number().min(1000).max(31536000000).default(43200000),
          arousal: z.number().min(1000).max(31536000000).default(43200000),
        })
        .default({}),
      maxDelta: z.number().min(0).max(1).default(0.25),
      maxMoodDelta: z.number().min(0).max(1).default(0.04),
      contextStep: z.number().min(0.001).max(1).default(0.05),
    }),
  ]),
  interest: z.union([
    z.const(undefined),
    z.object({
      windowTurns: z.number().step(1).min(1).max(12).default(4),
      maxInterests: z.number().step(1).min(1).max(100).default(24),
      minEnduringTurns: z.number().step(1).min(3).max(12).default(3),
      contextChars: z.number().step(1).min(128).max(10000).default(1200),
    }),
  ]),
  deliberation: z.union([
    z.const(undefined),
    z.object({
      retryInactiveGoalChoice: z.boolean().default(true),
      requestMode: z.union(['context-only', 'before-input', 'before-tools']).default('context-only'),
      maxMotivations: z.number().step(1).min(1).max(100).default(24),
      maxGoals: z.number().step(1).min(1).max(1000).default(100),
      memoryLimit: z.number().step(1).min(1).max(20).default(4),
      memoryChars: z.number().step(1).min(128).max(20000).default(2400),
      contextChars: z.number().step(1).min(128).max(20000).default(3200),
      motivationHalfLifeMs: z.number().min(1000).max(31536000000).default(86400000),
      maxStrengthDelta: z.number().min(0).max(1).default(0.2),
    }),
  ]),
  localDecision: z
    .object({
      binary: z.string().default(''),
      model: z
        .string()
        .pattern(/^[a-z0-9][a-z0-9-]*$/)
        .default('genesis-decision'),
      modelUrl: z.string().default('https://ollaya.dev/v2/library/laya/manifests/multilingual'),
      modelSha256: z
        .string()
        .pattern(/^[a-f0-9]{64}$/)
        .default('2840506e1f978aeb696a6f84af43ecc7fca95754cb63a67bafe6132532d384eb'),
      runtimeUrl: z.string().default('https://github.com/ollaya-dev/ollaya/releases/download/v0.18.0/ollaya-linux-amd64.tar.zst'),
      runtimeSha256: z
        .string()
        .pattern(/^[a-f0-9]{64}$/)
        .default('9d1d13cc16437a2748e1cc7af7e98cc31a5dea23a9cd82705f374abf49d7b084'),
      windowsRuntimeUrl: z.string().default('https://github.com/ollaya-dev/ollaya/releases/download/v0.18.0/ollaya-windows-amd64.zip'),
      windowsRuntimeSha256: z
        .string()
        .pattern(/^[a-f0-9]{64}$/)
        .default('1ae38f48800ab2d9587f062118f4f5f844943986ae56f353a7157677332fa6ae'),
      maxDownloadBytes: z.number().step(1).min(1).default(1073741824),
      installTimeoutMs: z.number().step(1).min(1000).max(3600000).default(1800000),
      startTimeoutMs: z.number().step(1).min(1000).max(300000).default(120000),
      pollMs: z.number().step(1).min(50).max(10000).default(250),
      graceMs: z.number().step(1).min(100).max(60000).default(3000),
      probeTimeoutMs: z.number().step(1).min(100).max(60000).default(1000),
      outputChars: z.number().step(1).min(512).max(1000000).default(4096),
      diagnosticBytes: z.number().step(1).min(1024).max(1000000).default(8192),
    })
    .default({}),
  memorySharing: z.union(['life', 'conversation']).default('conversation'),
  leasePath: z.string().required(),
  backupPath: z.string(),
  personalDirectory: z.string(),
  records: z.union([
    z.const(undefined),
    z.object({
      titleChars: z.number().step(1).min(1).max(1000).default(200),
      contentChars: z.number().step(1).min(1).max(1_000_000).default(100_000),
      typeChars: z.number().step(1).min(1).max(200).default(80),
      maxTypes: z.number().step(1).min(2).max(1000).default(100),
      toolkits: z
        .array(z.object({ id: z.string(), name: z.string(), description: z.string(), tools: z.array(z.string()) }))
        .default([
          {
            id: 'computer-operation',
            name: '电脑操作',
            description: '使用浏览器和桌面应用',
            tools: [
              'mcp__playwright-mcp__*',
              'mcp__chrome-devtools-mcp__*',
              'stagehand_*',
              'computer',
              'cua',
              'mcp__cua-driver-mcp__*',
              'cua_driver_native__*',
            ],
          },
        ]),
      maxRecords: z.number().step(1).min(2).max(1_000_000).default(20_000),
      maxStateChars: z.number().step(1).min(10000).max(100_000_000).default(20_000_000),
      resultChars: z.number().step(1).min(2048).max(1_000_000).default(16000),
      queryLimit: z.number().step(1).min(1).max(1000).default(20),
      snippetChars: z.number().step(1).min(1).max(10000).default(240),
    }),
  ]),
  timeZone: z.string().default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  temporaryMemory: z
    .object({
      enabled: z.boolean().default(false),
      idleMs: z.number().step(1).min(1000).max(604800000).default(1800000),
      pollMs: z.number().step(1).min(100).max(3600000).default(60000),
      maxSourcesPerSweep: z.number().step(1).min(1).max(100).default(8),
      maxBatchesPerRun: z.number().step(1).min(1).max(100).default(4),
      maxPending: z.number().step(1).min(1).max(10000).default(256),
      maxMemories: z.number().step(1).min(1).max(10000).default(500),
      maxSessions: z.number().step(1).min(1).max(10000).default(1000),
      inputChars: z.number().step(1).min(4096).max(4000000).default(1000000),
      summaryChars: z.number().step(1).min(100).max(1000).default(400),
      maxTokens: z.number().step(1).min(128).default(2048),
      outputChars: z.number().step(1).min(512).default(8000),
      injectLimit: z.number().step(1).min(1).max(100).default(24),
      injectChars: z.number().step(1).min(512).max(100000).default(16000),
      statusLimit: z.number().step(1).min(1).max(100).default(30),
      maxAttempts: z.number().step(1).min(1).max(10).default(3),
      failureThreshold: z.number().step(1).min(1).max(100).default(3),
    })
    .default({}),
  memory: z.union([
    z.const(undefined),
    z.object({
      windowTurns: z.number().step(1).min(1).max(12).default(4),
      decisionUrl: z.string(),
      decisionKeyEnv: z.string(),
      decisionThreshold: z.number().min(0).max(1),
      decisionProvider: z.string().default(''),
      decisionModel: z.string().default(''),
      writerProvider: z.string().default(''),
      writerModel: z.string().default(''),
      embeddingUrl: z.string().default(''),
      embeddingModel: z.string().default(''),
      embeddingKeyEnv: z.string(),
      embeddingDimensions: z.number().step(1).min(0).max(65536).default(0),
      timeoutMs: z.number().step(1).min(100).max(300000).default(30000),
      maxRetries: z.number().step(1).min(0).max(100).default(3),
      retryDelayMs: z.number().step(1).min(0).max(60000).default(500),
      inputChars: z.number().step(1).min(512).max(1000000).default(24000),
      outputChars: z.number().step(1).min(128).max(1000000).default(24000),
      maxTokens: z.number().step(1).min(64).max(32000).default(4096),
      reasoningEffort: z.string().default('auto'),
      organizationLimit: z.number().step(1).min(2).max(100).default(20),
      identityRewriteLimit: z.number().step(1).min(1).max(10000).default(100),
      maxChanges: z.number().step(1).min(1).max(100).default(8),
      maxImplicitMemories: z.number().step(1).min(1).max(100).default(12),
      overview: z
        .object({
          maxReferences: z.number().step(1).min(1).max(1000000).default(10000),
          maxChanges: z.number().step(1).min(1).max(1000).default(64),
          outputChars: z.number().step(1).min(128).max(1000000).default(128000),
          maxTokens: z.number().step(1).min(64).max(32000).default(16384),
          maxCalls: z.number().step(1).min(1).max(1000).default(64),
          timeoutMs: z.number().step(1).min(100).max(3600000).default(300000),
        })
        .default({}),
      associationLimit: z.number().step(1).min(0).max(20).default(3),
      associationChars: z.number().step(1).min(128).max(20000).default(2000),
      associationInputChars: z.number().step(1).min(64).max(10000).default(1000),
      associationTimeoutMs: z.number().step(1).min(50).max(30000).default(1200),
      experienceWindowMs: z.number().step(1).min(0).max(86400000).default(1800000),
      consolidation: z
        .object({
          enabled: z.boolean().default(true),
          idleMs: z.number().step(1).min(100).max(86400000).default(60000),
          cooldownMs: z.number().step(1).min(100).max(86400000).default(300000),
          retryMs: z.number().step(1).min(100).max(86400000).default(60000),
          maxFailures: z.number().step(1).min(1).max(10).default(3),
          batchLimit: z.number().step(1).min(1).max(100).default(20),
          minHabitSupport: z.number().step(1).min(2).max(100).default(3),
        })
        .default({}),
      minSimilarity: z.number().min(-1).max(1).default(0.35),
    }),
  ]),
  qqBasicTools: z.array(z.string()).default(['web_search', 'web_fetch', 'genesis_speech']),
  toolkits: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        tools: z.array(z.string()),
        qqAccess: z.union(['disabled', 'anyone', 'operator']).default('disabled'),
      }),
    )
    .default([
      {
        id: 'browser-reading',
        name: '网页浏览',
        description: '打开网页、读取页面、查看截图与等待页面内容；不含脚本、输入或文件操作',
        tools: [...QQ_BROWSER_TOOLS],
        qqAccess: 'anyone',
      },
      {
        id: 'computer-operation',
        name: '电脑操作',
        description: '使用浏览器和桌面应用',
        tools: [
          'mcp__playwright-mcp__*',
          'mcp__chrome-devtools-mcp__*',
          'stagehand_*',
          'computer',
          'cua',
          'mcp__cua-driver-mcp__*',
          'cua_driver_native__*',
        ],
      },
      { id: 'minecraft', name: 'Minecraft', description: '观察世界、与玩家同行并执行游戏技能', tools: ['minecraft_*'] },
    ]),
  storage: z
    .object({
      pageSize: z.number().step(1).min(2).max(4096).default(256),
      maxRecordChars: z.number().step(1).min(1024).max(100_000_000).default(2_000_000),
    })
    .default({}),
  maxRecords: z.number().step(1).min(20).max(1_000_000).default(20_000),
  maxStateChars: z.number().step(1).min(10000).max(100_000_000).default(10_000_000),
  identityChars: z.number().step(1).min(512).max(10000).default(1200),
  capabilityChars: z.number().step(1).min(256).max(100000).default(4000),
  memoryChars: z.number().step(1).min(256).max(100000).default(4000),
  growthChars: z.number().step(1).min(256).max(100000).default(2000),
  resultChars: z.number().step(1).min(512).max(1000000).default(16000),
  modelCatalogChars: z.number().step(1).min(128).max(16_000_000).default(4_000_000),
  queryLimit: z.number().step(1).min(1).max(1000).default(20),
  taskStopWaitMs: z.number().step(1).min(1).max(300000).default(10000),
})
