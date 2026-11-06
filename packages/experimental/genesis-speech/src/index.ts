/** Optional logged speech tool with live operator-owned CosyVoice configuration. @module */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-experimental-genesis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { z } from 'zod'
import { httpsUrl, SpeechError, synthesize } from './synthesis.ts'

/** Live route fields are captured once per invocation; budgets apply until completion. */
export interface Config {
  /** HTTPS CosyVoice SpeechSynthesizer endpoint, including regional workspace when required. */
  endpoint: Volatile<string>
  /** Alibaba model bound to the selected voice. */
  model: Volatile<string>
  /** Built-in voice or an already enrolled custom voice ID. */
  voice: Volatile<string>
  /** Credential reference resolved per invocation through the provider, or launch environment when no provider is mounted. */
  keyEnv: Volatile<string>
  /** Only the operator's configured Life preset may execute speech requests. */
  lifePreset: string
  /** Maximum input text characters per billable invocation. */
  maxTextChars: number
  /** Maximum downloaded WAV bytes per invocation. */
  maxAudioBytes: number
  /** Entire synthesis and download deadline. */
  timeoutMs: number
}
/** Validate route configuration before exposing live edits or loading the tool. */
export const Config = Schema.object({
  endpoint: Schema.string().default('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer').pattern(/^https:\/\/[^\s]+$/u).volatile(),
  model: Schema.string().pattern(/^cosyvoice-[a-zA-Z0-9.-]+$/u).default('cosyvoice-v3-flash').volatile(),
  voice: Schema.string().pattern(/^[a-zA-Z0-9_.-]{1,256}$/u).default('longanyang').volatile(),
  keyEnv: Schema.string().role('credential-ref').pattern(/^[A-Za-z_][A-Za-z0-9_]*$/u).default('DASHSCOPE_API_KEY').volatile(),
  lifePreset: Schema.string().default('life'),
  maxTextChars: Schema.natural().min(1).max(20000).default(2000),
  maxAudioBytes: Schema.natural().min(1024).max(134217728).default(16777216),
  timeoutMs: Schema.natural().min(1000).max(600000).default(120000),
})
/** Loader plugin name and settings namespace. */
export const name = 'genesis-speech'
/** Existing authorization, logged execution and durable attachment owners. */
export const inject = ['genesis', 'agentPresets', 'tools', 'attachments']

/** Register speech without making any billable request at startup.
 * @param ctx - Registration and teardown owner.
 * @param config - Validated operator configuration.
 */
export function apply(ctx: Context, config: Config): void {
  httpsUrl(config.endpoint.get())
  const alive = new AbortController()
  const running = new Set<Promise<unknown>>()
  ctx.effect(() => async () => { alive.abort(); await Promise.allSettled([...running]) })
  ctx.tools.register(defineTool({
    name: 'genesis_speech', description: 'Synthesize text as a durable WAV audio attachment using the operator-configured Alibaba Cloud CosyVoice model and voice. An optional voice selects an existing custom or built-in voice ID compatible with that model. This sends text to the configured speech provider and may incur charges. Use rate for speaking speed and instruction for emotional expression. The Web UI can play the resulting audio inline. Does not clone voices or publish audio. Available by default in QQ Life conversations; other Life conversations require the operator and learning. In QQ, send the returned attachment with genesis_qq_send kind=file and asVoice=true.',
    parameters: { text: { type: 'string', required: true, description: 'Text to speak.' },
      voice: { type: 'string', description: 'Existing voice ID; omitted uses the operator default.' },
      rate: { type: 'number', description: 'Speaking rate from 0.5 to 2.0; omitted uses 1.0.' },
      instruction: { type: 'string', description: 'Optional emotional expression or style instruction, e.g. 请用温柔开心的语气说话。 Natural-language instructions suit cosyvoice-v3.5-plus/flash cloned or designed voices. Other model/voice combinations may require fixed instructions or reject them. Maximum 100 weighted characters; Han characters count as two.' } },
    output: { schema: { type: 'json' }, render: (_args, value) => {
      const result = z.object({ attachment: z.object({ attachmentId: z.string().transform(AttachmentId), bytes: z.number(), name: z.string() }) }).parse(value)
      return [{ type: 'text', text: JSON.stringify(value) }, { type: 'file', attachment: result.attachment }]
    } },
    async execute(args, exec) {
      if (exec.agent === undefined) throw new SpeechError('permission', 'Speech synthesis requires an active Life conversation.')
      const preset = ctx.agentPresets.composedPreset(exec.agent.ctx)
      if (preset !== config.lifePreset) throw new SpeechError('permission', `Speech synthesis requires preset ${config.lifePreset}; the current preset is ${preset ?? 'unconfigured'}. Match the speech and QQ Life preset settings.`)
      if (!ctx.genesis.isOperatorSession(exec.agent.id) && !ctx.genesis.isQqSession(exec.agent.id)) {
        throw new SpeechError('permission', 'Speech synthesis requires an operator Life conversation or a bound QQ Life conversation.')
      }
      const voice = args.voice ?? config.voice.get()
      if (!/^[a-zA-Z0-9_.-]{1,256}$/u.test(voice)) throw new SpeechError('configuration', 'Select an existing voice ID from the speech provider.')
      const route = { endpoint: config.endpoint.get(), model: config.model.get(), voice, keyEnv: config.keyEnv.get(),
        maxTextChars: config.maxTextChars, maxAudioBytes: config.maxAudioBytes, timeoutMs: config.timeoutMs,
        rate: args.rate ?? 1, ...(args.instruction === undefined ? {} : { instruction: args.instruction.trim() }) }
      const signal = AbortSignal.any([exec.signal, alive.signal, AbortSignal.timeout(route.timeoutMs)])
      const operation = (async () => {
        const credentials = ctx.get('credentials')
        const ref = credentialRef(route.keyEnv)
        const key = credentials === undefined ? launchEnvironmentOf(ctx).get(ref)?.value
          : (await credentials.resolve(ref))?.value
        if (!key) throw new SpeechError('configuration', 'Speech API key is missing. Save the configured reference in the Harness credentials store or set it in the Host launch environment.')
        signal.throwIfAborted()
        const audio = await synthesize(route, args.text, key, signal)
        signal.throwIfAborted()
        const attachment = await ctx.attachments.saveFile({ data: audio.data, name: 'speech.wav' })
        const path = ctx.attachments.fileHostPath(attachment)
        return z.json().parse({ attachment, model: audio.model, voice: audio.voice, format: 'wav', rate: route.rate,
          ...(route.instruction === undefined ? {} : { instruction: route.instruction }), ...(path === undefined ? {} : { path }) })
      })()
      running.add(operation)
      try { return await operation } finally { running.delete(operation) }
    },
    presentCall: args => ({ card: 'generic', title: 'CosyVoice', kind: 'execute', rawInput: args.text }),
  }))
}
