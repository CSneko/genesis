/** Ready, typed readers for Genesis-owned Session evidence. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import type { ZodType } from 'zod'
import type { Config } from './config.ts'
import { manualMemoryProjection } from './manual-projection.ts'
import { conversationMemoryProjection } from './conversation-memory.ts'
import { temporaryProjection } from './temporary-projection.ts'
import { toolkitProjection } from './toolkit-model.ts'
import { initiativeProjection } from './social-projection.ts'
import { taskProjection } from './task-projection.ts'
import { emotionProjection } from './emotion-projection.ts'
import { interestProjection } from './interest-projection.ts'
import { MAX_EMOTION_WINDOW_TURNS } from './emotion-state.ts'

type State<D> = D extends { stateSchema: ZodType<infer S> } ? S : never
interface EvidenceHandles {
  manualMemory: ProjectionHandle<State<typeof manualMemoryProjection>>
  conversationMemory: ProjectionHandle<State<typeof conversationMemoryProjection>>
  temporary: ProjectionHandle<State<typeof temporaryProjection>>
  toolkits: ProjectionHandle<State<typeof toolkitProjection>>
  initiative: ProjectionHandle<State<typeof initiativeProjection>> | undefined
  task: ProjectionHandle<State<typeof taskProjection>>
  emotion: ProjectionHandle<State<ReturnType<typeof emotionProjection>>> | undefined
  interest: ProjectionHandle<State<ReturnType<typeof interestProjection>>> | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Session evidence installed before Genesis engines and their callbacks. */
    genesisSessionEvidence: GenesisSessionEvidence
  }
}

/** Genesis owns registrations; engines read domain state without registry lookups. */
export class GenesisSessionEvidence {
  private constructor(private readonly handles: EvidenceHandles) {}

  /**
   * Await required registrations before publishing any synchronous reader.
   * The calling fiber owns cleanup, including partially completed activation.
   * @param ctx - Genesis plugin's effect owner and projection registry.
   * @param config - Validated feature switches and evidence limits.
   * @returns Ready evidence owner; registration failures reject activation.
   */
  static async create(ctx: Context, config: Config): Promise<GenesisSessionEvidence> {
    const manualMemory = await ctx.sessionProjections.register(manualMemoryProjection)
    const conversationMemory = await ctx.sessionProjections.register(conversationMemoryProjection)
    const temporary = await ctx.sessionProjections.register(temporaryProjection)
    const toolkits = await ctx.sessionProjections.register(toolkitProjection)
    const task = await ctx.sessionProjections.register(taskProjection)
    const initiative = config.socialInitiative === undefined ? undefined
      : await ctx.sessionProjections.register(initiativeProjection)
    const emotion = config.emotion === undefined || config.memory === undefined ? undefined
      : await ctx.sessionProjections.register(emotionProjection(MAX_EMOTION_WINDOW_TURNS, config.memory.inputChars))
    const interest = config.interest === undefined || config.memory === undefined ? undefined
      : await ctx.sessionProjections.register(interestProjection(config.interest.windowTurns, config.memory.inputChars))
    return new GenesisSessionEvidence({ manualMemory, conversationMemory, temporary, toolkits, task, initiative, emotion, interest })
  }

  /** @param session - Prepared Session. @returns Explicit memory-review evidence. */
  manualMemoryOf(session: Session) { return this.handles.manualMemory.stateOf(session) }
  /** @param session - Prepared Session. @returns Attributed conversation text. */
  conversationMemoryOf(session: Session) { return this.handles.conversationMemory.stateOf(session) }
  /** @param session - Prepared Session. @returns Temporary memory evidence and delivery receipts. */
  temporaryOf(session: Session) { return this.handles.temporary.stateOf(session) }
  /** @param session - Prepared Session. @returns Conversation-local toolkit activation. */
  toolkitsOf(session: Session) { return this.handles.toolkits.stateOf(session) }
  /** @param session - Prepared Session. @returns Proactive delivery receipt, or undefined when disabled. */
  initiativeOf(session: Session) { return this.handles.initiative?.stateOf(session) }
  /** @param session - Prepared Session. @returns Assignment and task settlement evidence. */
  taskOf(session: Session) { return this.handles.task.stateOf(session) }
  /** @param session - Prepared Session. @returns Bounded emotional review evidence, or undefined when disabled. */
  emotionOf(session: Session) { return this.handles.emotion?.stateOf(session) }
  /** @param session - Prepared Session. @returns Bounded interest review evidence, or undefined when disabled. */
  interestOf(session: Session) { return this.handles.interest?.stateOf(session) }
}
