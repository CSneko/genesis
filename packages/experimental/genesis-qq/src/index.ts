import { QqSleepInbox, qqSleepDomain } from './sleep-inbox.ts'
/** Optional QQ transport for the existing Genesis life, loaded through a supported dsh profile. @module */
import { isAbsolute } from 'node:path'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config.ts'
import { QqController } from './controller.ts'
import { QqConnectionPreferences, qqConnectionDomain } from './connection.ts'
import { QqPreferences, qqPreferencesDomain } from './preferences.ts'
import { QqDecisionPreferences, qqDecisionDomain } from './decision-settings.ts'
import { qqMessageProjection } from './message-projection.ts'
import { QqMessageStore, qqMessagesDomain } from './message-store.ts'
import { QqGateway } from './gateway.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional authenticated QQ listener diagnostics; absent when the integration is disabled. */
    genesisQq: QqController
  }
}

export { Config } from './config.ts'
export { QqRuntime } from './runtime.ts'
export { QqController } from './controller.ts'
export { QqGateway } from './gateway.ts'
/** Loader plugin identifier. */
export const name = 'experimental-genesis-qq'
/** Genesis, durable Session ownership and preset composition must remain alive through QQ teardown. */
export const inject = ['llm', 'attachments', 'genesis', 'genesisStatus', 'tools', 'agents', 'agentPresets', 'agentDefaultModel', 'sessions', 'sessionPersistence', 'storageDomain', 'sessionProjections', 'credentials', 'sessionTitle']

/**
 * Mount a reversible loopback OneBot listener with Genesis-owned identities, memory and Session bindings.
 * @param ctx - Plugin effect owner and required services.
 * @param config - Complete transport configuration.
 * @returns After configuration restore; transport failures remain visible through settings.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (!isAbsolute(config.cwd)) throw new GenesisError('invalid-state', 'QQ cwd must be an absolute dedicated workspace path.')
  for (const account of [...config.outboundGroups, ...config.outboundUsers]) {
    if (!/^[1-9][0-9]*$/u.test(account) || !Number.isSafeInteger(Number(account))) {
      throw new GenesisError('invalid-state', 'QQ outbound targets must be positive, safely representable account numbers.')
    }
  }
  if (config.outboundGroups.length + config.outboundUsers.length > config.maxAllowedTargets) {
    throw new GenesisError('capacity', 'QQ outbound target count exceeds maxAllowedTargets. Reduce the outbound lists.')
  }
  ctx.effect(() => ctx.sessionProjections.register(qqMessageProjection(config)))
  const domain = await ctx.storageDomain.open(qqPreferencesDomain)
  let preferences: QqPreferences
  try { preferences = new QqPreferences(domain, config) } catch (error) { await domain.close(); throw error }
  ctx.effect(() => () => preferences.close())
  const connectionDomain = await ctx.storageDomain.open(qqConnectionDomain)
  let connection: QqConnectionPreferences
  try { connection = new QqConnectionPreferences(connectionDomain, config) } catch (error) { await connectionDomain.close(); throw error }
  ctx.effect(() => () => connection.close())
  const decisionDomain = await ctx.storageDomain.open(qqDecisionDomain)
  let decisions: QqDecisionPreferences
  try { decisions = new QqDecisionPreferences(decisionDomain, config.statusLimit) } catch (error) { await decisionDomain.close(); throw error }
  ctx.effect(() => () => decisions.close())
  const messages = new QqMessageStore(await ctx.storageDomain.open(qqMessagesDomain), config.maxMessageReceipts)
  ctx.effect(() => () => messages.close())
  const life = await ctx.genesis.snapshot()
  const inbox = new QqSleepInbox(await ctx.storageDomain.open(qqSleepDomain), life.identity.id, config.sleepInboxLimit, config.sleepInboxChars)
  ctx.effect(() => () => inbox.close())
  await inbox.start(life.events.some(event => event.dedupKey === 'sleep:qq-inbox-initialized'))
  await ctx.genesis.recordSleep('qq-inbox-initialized', 'qq-inbox-initialized', {})
  const runtime = new QqController(ctx, config, preferences, connection, decisions, messages, inbox)
  ctx.provide('genesisQq', runtime)
  ctx.inject(['genesisSleep'], scope => {
    runtime.setSleep(scope.genesisSleep)
    scope.effect(() => scope.genesisSleep.registerBacklog(() => inbox.inspect()))
    scope.effect(() => () => { runtime.setSleep(undefined) })
  })
  ctx.effect(() => () => runtime.close())
  ctx.on('session/event', (session, event) => { runtime.observe(session.id, event) }, { global: true })
  await runtime.start()
  await ctx.plugin(QqGateway, { runtime, preferences })
}
