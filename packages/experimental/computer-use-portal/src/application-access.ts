/** Application consent for AT-SPI access beyond the selected screen's pixels. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { PortalClient } from './client.ts'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'

const ApplicationInfo = z.strictObject({
  appId: z.string(), name: z.string(), pid: z.number().int().positive(), executable: z.string(),
  permission: z.enum(['not-granted', 'granted', 'denied']),
})
const Reply = z.object({ isError: z.boolean().optional(), content: z.array(z.object({ type: z.literal('text'), text: z.string() })).min(1) })
const ALLOW = 'Allow this application for this connection'

/**
 * Apply operator configuration or obtain interactive consent before reading an application.
 * The worker enforces consent again for inspection and every element action.
 * @param ctx - Human question provider when interactive consent is required.
 * @param client - Worker holding connection-owned application identities and permissions.
 * @param execution - Exact calling Agent and cancellation, combined with plugin disposal.
 * @param appId - Opaque application instance from the current application list.
 * @param requireConsent - Whether the operator requires a per-application question.
 * @returns After existing access, configured preapproval, or an interactive grant is verified.
 */
export async function authorizeApplication(
  ctx: Context, client: PortalClient, execution: ToolExecution, appId: string, requireConsent: boolean,
): Promise<void> {
  const agent = execution.agent
  if (agent === undefined) throw new UserQuestionError('Application access requires an Agent Session.', 'CALLER_NOT_LIVE')
  const raw = Reply.parse(await client.call(agent.session.id, { action: 'app_info', appId }, execution.signal))
  const content = raw.content[0]
  if (content === undefined) throw new Error('Application metadata was not returned.')
  if (raw.isError === true) throw new UserQuestionError(content.text, 'APPLICATION_UNAVAILABLE')
  const app = ApplicationInfo.parse(JSON.parse(content.text))
  if (app.permission === 'granted') return
  if (app.permission === 'denied') throw new UserQuestionError('Application access was denied for this connection. Stop using this application.', 'APPLICATION_ACCESS_DENIED')
  let allowed = true
  if (requireConsent) {
    const questions = ctx.get('userQuestions')
    if (questions === undefined) throw new UserQuestionError('No operator answerer is available. Application inspection remains disabled.', 'NO_PROVIDER')
    const answer = await questions.ask({ agent, signal: execution.signal, questions: [{
      id: 'desktop-application-access',
      question: `Allow accessibility reading and control of ${JSON.stringify(app.name)}?`,
      detail: `Executable: ${app.executable}\nProcess: ${app.pid}\nThis covers this application's accessible windows, including windows outside the shared monitor and background controls. Password controls are excluded. Access ends when desktop sharing stops, this application exits, or the desktop provider is unloaded. Other execution permissions still apply.`,
      options: [{ label: ALLOW }, { label: 'Deny' }],
    }] })
    execution.signal.throwIfAborted()
    const choice = answer.answers.find(item => item.id === 'desktop-application-access')
    allowed = answer.answers.length === 1 && choice !== undefined && !choice.custom?.trim()
      && choice.selected.length === 1 && choice.selected[0] === ALLOW
  }
  const decision = Reply.parse(await client.call(agent.session.id, { action: allowed ? 'authorize_app' : 'deny_app', appId }, execution.signal))
  if (decision.isError === true) throw new UserQuestionError(decision.content[0]?.text ?? 'Application consent failed.', 'APPLICATION_UNAVAILABLE')
  if (!allowed) throw new UserQuestionError('Application access was denied. No application contents were read or input sent.', 'APPLICATION_ACCESS_DENIED')
}
