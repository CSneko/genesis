/** Model-facing controls for the pre-awakening configuration conversation. @module */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-user-approval'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { GenesisError } from './error.ts'
import { MODEL_SETUP_TOOL } from './mode.ts'
import type { GenesisStatusGateway } from './status.ts'
import type { ModelPreferences } from './model-preferences.ts'
import type { MemoryModelsSettings } from './status-types.ts'

interface SetupAccess {
  allows(agent: Agent): boolean
  run<T>(agent: Agent, checking: boolean, signal: AbortSignal,
    run: (current: ReturnType<ModelPreferences['read']>, owned: AbortSignal) => Promise<T>): Promise<T>
  verified(revision: number, signal: AbortSignal): Promise<void>
}

/**
 * Expose an isolated setup prompt and verify or change the shared decision route through its existing owner.
 * @param ctx - Genesis contribution owner.
 * @param status - Settings and one-time setup owner.
 * @param isSetup - Whether a Session uses the isolated setup preset.
 * @param access - Live setup grant and serialization with naming.
 */
export function registerModelSetup(ctx: Context, status: GenesisStatusGateway, isSetup: (agent: Agent | undefined) => boolean,
  access: SetupAccess): void {
  ctx.systemPrompt.section({
    name: 'genesis-setup:guide',
    order: 650,
    interpolate: false,
    text: ({ agent }) => !isSetup(agent) ? '' : `You are the Genesis model setup assistant. The operator has not started the life conversation. Use configure_genesis to inspect the decision route, then help the operator choose how to run decisions. A dedicated decision model answers typed questions with probabilities, such as whether a conversation is worth remembering. Managed local deployment uses the host's resources. A compatible text model can also be tested for judgments that accept generated JSON. Ask what the operator prefers and use their language.
Offer these dedicated cloud options when relevant. Both use configure-cloud with protocol "jev" and requiresKey true.
- OpenRouter System One: endpoint https://openrouter.ai/api/v1/systemone, model typesafe/jev-1.14, and an OpenRouter API key.
- Gemini Decisions: endpoint https://generativelanguage.googleapis.com/v1beta/decisions, model gemini-decision-1, and a Gemini API key.
Confirm the provider choice before configuring it. For another cloud service, ask for the HTTPS endpoint, protocol, model, and whether it needs a key. Never ask for a key, password or token in chat. Have the operator save any key in the password field at Settings → Knowledge base → Cloud configuration, then return to this conversation and verify. Check the selected route before saying it is ready. After successful verification, ask the operator to use Initialize life in this conversation to name and awaken Genesis. You cannot initialize the life. If the setup tool is unavailable, direct the operator to start a new setup conversation.`,
  })
  const tool = defineTool({
    name: MODEL_SETUP_TOOL,
    description: 'Inspect or verify Genesis decision setup. Select the saved cloud route with use-configured-cloud, set a new HTTPS endpoint with configure-cloud, use a registered model with use-provider, or deploy the managed local model. Changes ask the operator for approval. Never include credentials.',
    parameters: {
      action: { type: 'string', required: true,
        enum: ['inspect', 'verify', 'use-configured-cloud', 'configure-cloud', 'use-provider', 'deploy-local'] },
      provider: { type: 'string', description: 'Existing Harness provider identifier for use-provider.' },
      model: { type: 'string', description: 'Model identifier for use-provider or configure-cloud.' },
      endpoint: { type: 'string', description: 'Full HTTPS decision endpoint for configure-cloud. Exclude credentials and query parameters.' },
      protocol: { type: 'string', enum: ['jev', 'openai'], description: 'Jev/System One or OpenAI-compatible chat completions, required for configure-cloud.' },
      requiresKey: { type: 'boolean', description: 'Whether the cloud service requires a key, required for configure-cloud. The operator enters any key in settings.' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const agent = exec.agent
      if (agent === undefined) throw new GenesisError('invalid-source', 'Model setup requires an authorized Session.')
      return access.run(agent, args.action !== 'inspect', exec.signal, async (current, signal) => {
        const { models, configuredDecision, revision } = current
        if (args.action === 'inspect') {
          const chat = agent.model.current()
          return {
            active: models.localDecision ? 'local' : models.decision.kind,
            model: models.decision.model,
            configuredModel: configuredDecision.model,
            chat: chat === undefined ? null : { provider: chat.provider, model: chat.model },
          }
        }
        const probe = async (route: MemoryModelsSettings['decision']) => {
          const result = await status.decide(agent.session, 'Does two plus two equal five?', { participants: {} },
            { true: 'The sum is five.', false: 'The sum is not five.' }, signal, route)
          if (result.update) throw new GenesisError('memory-provider', 'The decision model gave the wrong result on the setup check.')
        }
        if (args.action === 'verify') {
          await probe(models.decision)
          await access.verified(revision, signal)
          return { ready: true }
        }
        let route = configuredDecision
        const model = args.model?.trim()
        if (args.action === 'use-provider') {
          const provider = args.provider?.trim()
          if (!provider || !model || provider.length > 512 || model.length > 512)
            throw new GenesisError('invalid-source', 'Choose a registered provider and model.')
          route = { kind: 'provider', provider, model }
        }
        if (args.action === 'configure-cloud') {
          const endpoint = args.endpoint === undefined ? null : URL.parse(args.endpoint)
          if (!model || model.length > 512 || args.protocol === undefined || args.requiresKey === undefined ||
            endpoint === null || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
            endpoint.search || endpoint.hash || endpoint.href.length > 2048)
            throw new GenesisError('invalid-source', 'Provide an HTTPS endpoint without credentials or query parameters, a model, a protocol and the key requirement.')
          const url = endpoint.href
          // A credential saved for one endpoint must not be attached to a different endpoint.
          const keyRef = args.requiresKey
            ? `GENESIS_DECISION_ENDPOINT_${createHash('sha256').update(url).digest('hex').toUpperCase()}`
            : undefined
          const endpointRoute = { url, model, ...(keyRef === undefined ? {} : { keyRef }) }
          route = args.protocol === 'jev' ? {
            kind: 'jev', ...endpointRoute, threshold: configuredDecision.kind === 'jev' ? configuredDecision.threshold : 0.5,
          } : { kind: 'openai', ...endpointRoute }
        }
        const reason = args.action === 'deploy-local' ? 'Download and start the managed local Genesis decision model?'
          : route.kind === 'provider' ? `Use ${route.provider} / ${route.model} for Genesis decisions?`
            : `Use ${route.kind} for Genesis decisions at ${args.action === 'configure-cloud' ? route.url : new URL(route.url).origin} with model ${route.model}?`
        const outcome = await ctx.get('approval')?.request({ agent, toolName: MODEL_SETUP_TOOL, callId: exec.callId, reason, signal })
        if (outcome !== 'allowed-once') throw new GenesisError('invalid-source', 'The operator did not approve this decision model change.')
        signal.throwIfAborted()
        if (args.action === 'deploy-local') {
          const next = await status.deployLocalDecision(revision, signal)
          await access.verified(next, signal)
        } else {
          const needsKey = args.action === 'configure-cloud' && args.requiresKey === true
          if (!needsKey) await probe(route)
          signal.throwIfAborted()
          const next = await status.saveModels({ ...models, decision: route, localDecision: false }, revision, signal)
          if (needsKey) return { ready: false, next: 'Save the decision key in Knowledge base, then verify.' }
          await access.verified(next, signal)
        }
        return { ready: true }
      })
    },
    presentCall: args => ({ card: 'generic', title: 'Genesis setup', kind: 'edit', rawInput: args.action }),
  })
  const registrations = new Map<Agent, () => void>()
  const remove = (agent: Agent) => {
    registrations.get(agent)?.()
    registrations.delete(agent)
  }
  const sync = (agent: Agent) => {
    if (!isSetup(agent)) remove(agent)
    else if (!registrations.has(agent)) {
      registrations.set(agent, agent.ctx.tools.register(tool, { when: ({ agent }) => access.allows(agent) }))
    }
  }
  ctx.on('agent/created', ({ agent }) => { sync(agent) }, { global: true })
  ctx.on('agent/disposed', ({ agent }) => { remove(agent) }, { global: true })
  ctx.on('agent-preset/selected', (id) => {
    const agent = ctx.agents.get(id)
    if (agent !== undefined) sync(agent)
  })
  ctx.effect(() => () => {
    for (const dispose of registrations.values()) dispose()
    registrations.clear()
  })
  for (const agent of ctx.agents.list()) sync(agent)
}
