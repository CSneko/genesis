/** Recover one completed importance result from its exact, already durable auxiliary call. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { TemporaryMemoryId } from './temporary-model.ts'
import { endpointResult } from './model-endpoint.ts'
/**
 * Reuse a completed assessment after a crash between its audit flush and state commit.
 * @param ctx - Registered Session projection reader.
 * @param session - Source Session holding the exact recorded auxiliary inputs and outputs.
 * @param id - Pending summary identity supplied in the original model input.
 * @returns The untrusted recorded JSON result, or no result when the prior request outcome remains unknown.
 */
export function completedTemporaryAssessment(ctx: Context, session: Session, id: TemporaryMemoryId): { value: unknown } | undefined {
  const assessment = ctx.genesisSessionEvidence.temporaryOf(session)?.assessment
  if (assessment === undefined || assessment.id !== id || !assessment.completed) return
  if (assessment.text !== undefined) return { value: JSON.parse(assessment.text) }
  if (assessment.route !== undefined) return { value: endpointResult(assessment.route, assessment.body) }
}
