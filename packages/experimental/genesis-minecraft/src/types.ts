/** Browser-safe Minecraft settings and sampled runtime observations. @module */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-workspace/types' {
  interface SessionActivityKindMap {
    /** A live Minecraft connection keeps its Life conversation available between model turns. */
    minecraft: true
  }
}

/** Stable server-issued player identity, independent of display names. */
export type MinecraftPlayerId = Branded<'MinecraftPlayerId'>
/** One runtime observation; never a life identity or Session event ID. */
export type MinecraftObservationId = Branded<'MinecraftObservationId'>
/** One connection-local short task, independent of durable Life goals. */
export type MinecraftTaskId = Branded<'MinecraftTaskId'>
/** Bounded task progress; inventoryGoal verifies item totals, while unconditioned completion only establishes finished steps. */
export interface MinecraftTaskStatus {
  id: MinecraftTaskId
  goal: string
  phase: 'running' | 'completed' | 'cancelled' | 'timed-out' | 'blocked' | 'failed'
  step: number
  totalSteps: number
  completedActions: number
  deadline: string
  action: string | null
  reason: string | null
  /** Resolved duration and deployment limits; absent in earlier audit records. */
  budget?: {
    requestedTimeoutMs: number
    timeoutMs: number
    timeoutLimitMs: number
    stepLimit: number
    repeatLimit: number
    planCharsLimit: number
  }
  /** Consecutive decisions that did not admit the proposed action; absent in earlier audit records. */
  waitingDecisions?: number
  /** Most recent actual tool result, retained when a task needs replanning. */
  lastResult?: { isError: boolean; value?: JsonValue }
  /** Optional inventory completion condition; counts cover the full inventory. */
  inventoryGoal?: { item: string; required: number; current: number }
}
/** Inventory evidence for a bounded collection attempt, including partially completed attempts. */
export type MinecraftCollectionProgress = {
  item: string
  requested: number
  before: number
  current: number
  gained: number
  minedBlocks: number
}
/** Settled skill evidence; a block change alone does not establish item collection. */
export interface MinecraftSkillOutcome {
  outcome: 'completed' | 'failed' | 'interrupted' | 'timed-out'
  failure: string | null
  target?: { name: string; position: { x: number; y: number; z: number } }
  collection?: MinecraftCollectionProgress
}
/** One attributed server chat packet; sequence distinguishes identical repeated speech within a connection. */
export interface MinecraftChat {
  sequence: number
  channel: 'public' | 'whisper'
  player: string
  playerId?: MinecraftPlayerId
  message: string
}
/** Per-connection choices supplied by the character; never persisted as operator preferences. */
export interface MinecraftConnection {
  host: string
  port: number
  username: string
  version: string
}
/** Operator-owned configuration; secrets are resolved separately through credentials. */
export interface MinecraftSettings {
  enabled: boolean
  reuseKnowledge: boolean
  jevEnabled: boolean
  jevUrl: string
  jevModel: string
  jevKeyRef: string
  intervalMs: number
  timeoutMs: number
  threshold: number
  notificationIntervalMs: number
  vision: boolean
  lowHealth: number
  skillTimeoutMs: number
}
/** A loaded block and current selection evidence; reach does not imply a navigable path. */
export type MinecraftBlockObservation = {
  name: string
  position: { x: number; y: number; z: number }
  stateId: number
  properties: Record<string, string | number | boolean>
  distance: number
  visible: boolean
  withinReach: boolean
}
/** Bounded game information available to this bot; entity positions do not imply visibility. */
export interface MinecraftObservation {
  id: MinecraftObservationId
  time: string
  position: { x: number; y: number; z: number }
  health: number
  food: number
  dimension: string
  action: string
  failure: string | null
  inventory: Array<{ name: string; count: number }>
  entities: Array<{ id: number; uuid?: MinecraftPlayerId; name: string; distance: number }>
  chat: MinecraftChat[]
  /** Queried client-known blocks; visibility and present reach do not guarantee a path exists. */
  blocks?: MinecraftBlockObservation[]
  /** Current raycast hit, or null for no known hit within digging reach. */
  crosshair?: { name: string; position: { x: number; y: number; z: number } } | null
  /** Runtime operations, independent of toolkit activation, learning and permission. */
  supportedActions?: string[]
  /** Last settled skill in this connection; absent before any skill settles. */
  lastAction?: MinecraftSkillOutcome & { action: string }
}
/** Sampled settings and connection state; loading never connects to a server. */
export interface MinecraftStatus {
  /** Actual receiving conversation, including a connection-owned conversation created without an app chat. */
  sessionId: SessionId | null
  task: MinecraftTaskStatus | null
  revision: number
  settings: MinecraftSettings
  connection: 'disconnected' | 'connecting' | 'connected'
  monitor: 'disabled' | 'running' | 'failed'
  failure: string | null
  observation: MinecraftObservation | null
  image: string | null
  lastNotice: string | null
}

/** Detached observed data delivered to resident scripts; chat never authorizes an operation. */
export type MinecraftScriptEvent =
  | { type: 'chat'; channel: 'public' | 'whisper'; player: string; message: string; playerId?: MinecraftPlayerId }
  | { type: 'health'; health: number; food: number }
  | { type: 'blockUpdate'; position: { x: number; y: number; z: number }; before: string | null; after: string | null }
  | { type: 'inventory' }
  | { type: 'tick'; time: string }
