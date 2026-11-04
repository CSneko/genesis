/** Safe diagnostics exported by the life settings Gateway. @module */
import { z } from 'zod'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { RemoteError, remoteErrorOf, type RemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { ReviewStage } from './status-types.ts'
import { GenesisError } from './error.ts'

/**
 * Preserve owned diagnostics and classify transport/validation failures without disclosing response bodies or input values.
 * @param error - Rejected life settings operation.
 * @returns A failure with a stable code and safe diagnostic; the original cause remains Host-only.
 */
export function statusFailure(error: unknown): RemoteFailure {
  const remote = remoteErrorOf(error)
  if (remote !== undefined) return remote
  const codes = new Set<string>()
  const visit = (value: unknown, depth: number) => {
    if (!(value instanceof Error) || depth > 4) return
    if ('code' in value && typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value.code)) codes.add(value.code)
    if (value instanceof AggregateError) for (const member of value.errors) visit(member, depth + 1)
    visit(value.cause, depth + 1)
  }
  visit(error, 0)
  let reason: string
  let message: string
  if (error instanceof GenesisError) {
    reason = error.code
    message = error.message
  } else if (error instanceof z.ZodError) {
    reason = 'validation'
    const fields = new Set(['decision', 'writer', 'maxRetries', 'url', 'model', 'provider', 'kind', 'keyRef', 'dimensions', 'threshold', 'data', 'embedding', 'index', 'models', 'name', 'id',
      'answers', 'remember', 'emotion', 'noul', 'type', 'choices', 'finish_reason', 'message', 'content', 'update',
      'delta', 'moodDelta', 'reason', 'happiness', 'sadness', 'anger', 'fear', 'valence', 'arousal', 'needs', 'needsDelta', 'targets',
      'tenderness', 'gratitude', 'longing', 'curiosity', 'frustration', 'disappointment',
      'appraisal', 'novelty', 'expectationMatch', 'controllability', 'relationshipMeaning', 'responsibility', 'summary', 'shortSummary',
      'relationshipDelta', 'affection', 'trust', 'attachment', 'familiarity', 'feltSecurity', 'label',
      'relationshipEnabled', 'maxRelationshipDelta', 'moodSupportTurns', 'importantEventThreshold', 'repetitionDiscount', 'maxNeedsDelta', 'needsHalfLifeMs', 'interactionHalfLifeMs', 'socialDesire', 'socialSatisfaction', 'relationshipQuality', 'recentInteraction', 'solitudePreference', 'exploration', 'autonomy', 'creativity', 'loneliness',
      'changes', 'action', 'sourceSeqs', 'memory', 'category', 'importance', 'confidence', 'attribution',
      'motivations', 'goals', 'candidates', 'selected', 'strength', 'status', 'interestIds', 'memoryIds', 'sourceEventIds',
      'origin', 'motivationIds', 'priority', 'nextAction', 'failures', 'disposition', 'goalIds', 'factors', 'createdAt', 'updatedAt',
      'motivation', 'interest', 'commitment', 'benefit', 'cost', 'risk', 'urgency', 'relationship', 'context',
      'offlineChanges', 'moodEmotionScale', 'emotionMoodInfluence', 'clockCheckpointMs',
      'enabled', 'sessionId', 'intervalMs', 'minSendIntervalMs', 'maxPer24Hours', 'userIdleMs', 'eventImportance', 'maxPending', 'maxPendingAgeMs'])
    message = error.issues.slice(0, 8).map((issue) => {
      const path = issue.path.filter(part => typeof part === 'number' || fields.has(String(part))).join('.') || 'configuration/response'
      const bound = 'minimum' in issue ? `; minimum=${String(issue.minimum)}` : 'maximum' in issue ? `; maximum=${String(issue.maximum)}` : ''
      const keys = issue.code === 'unrecognized_keys' ? issue.keys.filter(key => fields.has(key)).slice(0, 8) : []
      const unknown = issue.code === 'unrecognized_keys' ? issue.keys.length - keys.length : 0
      const fieldsText = keys.length ? `; fields=${keys.join(',')}` : ''
      const unknownText = issue.code === 'unrecognized_keys'
        ? `${unknown > 0 ? `; unknown fields=${unknown}` : ''}; inspect the logged auxiliary response` : ''
      return `${path}: ${issue.code}${bound}${fieldsText}${unknownText}`
    }).join('; ')
  } else if (error instanceof HarnessError) {
    if (error.code === 'GENESIS_DELIBERATION_FAILED'
      && (error.cause instanceof GenesisError || error.cause instanceof z.ZodError || error.cause instanceof SyntaxError)) {
      return statusFailure(error.cause)
    }
    reason = error.code
    message = ['MISSING_CREDENTIAL', 'INVALID_CREDENTIAL', 'NO_ADAPTER'].includes(error.code)
      ? error.message : `Model provider failed (${error.code}). Check the selected provider and its credentials.`
  } else if (error instanceof SyntaxError) {
    reason = 'invalid-json'
    message = 'The endpoint returned invalid JSON. Check the API endpoint and response format.'
  } else {
    reason = error instanceof Error ? error.name : 'unknown'
    message = codes.size > 0 ? `Connection failed: ${[...codes].join(', ')}. Check the endpoint, network and TLS configuration.`
      : reason === 'TimeoutError' ? 'The request timed out. Check service availability and the configured timeout.'
        : reason === 'AbortError' ? 'The operation was cancelled before a result was confirmed.'
          : `Settings operation failed (${reason}). Check Host diagnostics before retrying.`
  }
  if (error instanceof GenesisError && codes.size > 0) message += ` (${[...codes].join(', ')})`
  return new RemoteError('genesis/operation', `[${reason}] ${message}`, { reason }, { cause: error })
}

/**
 * Attribute a contained review failure to its actual operation without exporting the raw cause.
 * @param stage - Operation active when the failure occurred.
 * @param error - Rejected review operation.
 * @returns A typed retry failure whose diagnostic is also safe for the live status projection.
 */
export function reviewFailure(stage: ReviewStage, error: unknown): RemoteError<'genesis/review'> {
  const diagnostic = statusFailure(error)
  return new RemoteError('genesis/review', diagnostic.message, { stage, reason: diagnostic.code }, { cause: error })
}
