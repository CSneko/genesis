/** Attribution of game observations in Sessions written by the retired Minecraft connector. @module */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'

/** Identifier of a historical game observation. */
type MinecraftObservationId = Branded<'MinecraftObservationId'>

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Observed game data and model judgments; never human instructions. @persistenceAttribution */
    'genesis-minecraft': { kind: 'genesis-minecraft'; observationId: MinecraftObservationId } & ContextFormed
  }
}
