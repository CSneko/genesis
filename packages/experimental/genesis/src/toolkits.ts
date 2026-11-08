/** Learned tools enter a conversation only after their operator toolkit is activated. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from './config.ts'
import type { LifeCore } from './core.ts'
import { GenesisError } from './error.ts'
import { activationSchema, toolkitContains } from './toolkit-model.ts'
import type { ToolkitId } from './toolkit-types.ts'
import type { ToolkitPreferences } from './toolkit-preferences.ts'
import { qqBrowserDenial } from './qq-tool-policy.ts'

/** Toolkit activation is innate only when there is a learned member to discover. */
export const TOOLKIT_TOOL = 'genesis_toolkit'
/** Operator-owned QQ capabilities require the current authenticated speaker, independently of learning. */
const OPERATOR_QQ_TOOLS = ['genesis_record', 'genesis_tasks', 'genesis_speech']
/** Instance-owned policy; activation comes exclusively from the calling Session's committed records. */
export class LifeToolkits {
  /** @param ctx - Real scoped tools and Session projections. @param core - Durable learning owner. @param preferences - Operator catalogue. @param config - Retrieval and output bounds. */
  constructor(private readonly ctx: Context, private readonly core: LifeCore,
    private readonly preferences: ToolkitPreferences, private readonly config: Config) {}

  private currentSpeaker(agent: Agent) {
    for (const event of agent.session.ownEvents().toReversed()) {
      if (event.type === 'turn/start') break
      if (event.type === 'user/message') {
        if (event.data.source.kind === 'genesis-person') return event
        if (event.data.source.kind === 'user') return undefined
      }
    }
    return undefined
  }
  /** Operator-only QQ tools require the current authenticated speaker to be the bound operator. */
  private operatorSpeaking(agent: Agent): boolean {
    const speaker = this.currentSpeaker(agent)
    return speaker?.data.source.kind === 'genesis-person' && this.core.isOperatorPerson(speaker.data.source.personId)
  }
  /**
   * Check current QQ execution authority separately from toolkit activation and tool availability.
   * @param agent - Actual bound QQ conversation.
   * @param name - Exact registered tool name.
   * @param operation - Advertising may show operator-only members; execution additionally verifies the current speaker.
   * @returns Innate channel tools or learned active members with current operator-owned QQ permission.
   */
  qqAllowed(agent: Agent, name: string, operation: 'advertise' | 'execute' = 'execute'): boolean {
    if (!this.core.isQqSession(agent.id)) return false
    if (this.core.isOperatorSession(agent.id)) {
      return ['learn', 'genesis_recall', 'genesis_contacts', 'genesis_search_contacts', 'genesis_plan', TOOLKIT_TOOL, 'genesis_message', 'genesis_qq_history',
        'genesis_qq_read_media', 'genesis_qq_send', ...this.config.qqBasicTools].includes(name)
        || (this.core.learningStatus().tools.includes(name) && this.exposed(agent, name))
    }
    if (name === 'genesis_contacts' || name === 'genesis_search_contacts') return false
    if (name === 'genesis_message') return this.operatorSpeaking(agent)
    if (!this.operatorSpeaking(agent) && qqBrowserDenial(name) !== undefined) return false
    if (['genesis_recall', 'genesis_qq_history', 'genesis_qq_read_media', 'genesis_qq_send', TOOLKIT_TOOL, ...this.config.qqBasicTools].includes(name)) return true
    if (OPERATOR_QQ_TOOLS.includes(name)) {
      return this.core.learningStatus().tools.includes(name) && (operation === 'advertise' || this.operatorSpeaking(agent))
    }
    if (!this.core.learningStatus().tools.includes(name)) return false
    const active = this.enabled(agent)
    const state = this.ctx.genesisSessionEvidence.toolkitsOf(agent.session)!
    const speaker = this.currentSpeaker(agent)
    return this.preferences.read().entries.some((entry) => {
      if (!active.includes(entry.id) || !toolkitContains(entry, name)) return false
      const grant = state.grants[entry.id]
      if (grant === undefined) return false
      const proof = agent.session.ownEvents().find(event => event.seq === grant.sourceSeq)
      if (proof?.type !== 'user/message' || proof.data.source.kind !== 'genesis-person'
        || proof.data.source.personId !== grant.actor) return false
      return entry.qqAccess === 'anyone' || (entry.qqAccess === 'operator'
        && this.core.isOperatorPerson(grant.actor) && (operation === 'advertise' || speaker?.data.source.kind === 'genesis-person'
        && this.core.isOperatorPerson(speaker.data.source.personId)))
    })
  }

  /**
   * Check QQ permission and browser argument restrictions at execution.
   * @param agent - Actual bound QQ conversation.
   * @param name - Registered tool name.
   * @param args - Parsed executor arguments.
   * @returns A denial reason, or undefined when current channel policy permits the call.
   */
  qqExecutionDenial(agent: Agent, name: string, args: unknown): string | undefined {
    if (this.core.isOperatorSession(agent.id)) return undefined
    if (!this.qqAllowed(agent, name)) {
      if (this.qqAllowed(agent, name, 'advertise')) return 'This QQ tool requires the bound operator to be the current authenticated speaker. It is still available; learning it again will not grant permission.'
      if (!this.core.learningStatus().tools.includes(name)) return 'This tool has not been learned or is not an innate QQ tool. Learning does not grant QQ execution permission.'
      const owners = this.preferences.read().entries.filter(entry => toolkitContains(entry, name))
      if (!owners.some(entry => entry.qqAccess === 'anyone' || entry.qqAccess === 'operator')) {
        return 'This learned tool has no QQ-enabled toolkit. The operator must configure toolkit access; learning it again will not restore QQ access.'
      }
      return 'This learned QQ tool needs an enabled toolkit with a valid speaker grant. Use genesis_toolkit to enable its toolkit; operator-only access requires the bound operator to speak.'
    }
    return this.operatorSpeaking(agent) ? undefined : qqBrowserDenial(name, args)
  }

  /**
   * Check grouping independently of learning and permission checks.
   * @param agent - Actual calling conversation.
   * @param name - Actual registered tool name.
   * @returns Whether no group owns the tool, or at least one owning group is active here.
   */
  exposed(agent: Agent, name: string): boolean {
    if (this.core.isQqSession(agent.id) && !this.core.isOperatorSession(agent.id)) return this.qqAllowed(agent, name)
    const owners = this.preferences.read().entries.filter(entry => toolkitContains(entry, name))
    return owners.length === 0 || owners.some(entry => this.enabled(agent).includes(entry.id))
  }
  /**
   * Retain registered QQ declarations across permission changes; explicit closure removes members.
   * Context compaction preserves declarations; current eligibility restores previously omitted members.
   * @param agent - Calling QQ conversation; inherited declarations are excluded.
   * @param registered - Currently registered schemas before Genesis filtering.
   * @param eligible - Schemas admitted by current learning and toolkit policy.
   * @returns Stable declarations; execution guards still check current authority.
   */
  retainQqTools(agent: Agent, registered: ToolSchema[], eligible: ToolSchema[]): ToolSchema[] {
    let retained = new Set<string>()
    const closed = new Set<string>()
    const entries = this.preferences.read().entries
    const active = new Set<ToolkitId>()
    for (const event of agent.session.ownEvents()) {
      if (event.type === 'request/header') retained = new Set(event.data.header.tools?.map(tool => tool.name))
      const record = pluginRecordOf(event)
      if (record?.type !== 'plugin:genesis/toolkit') continue
      const activation = activationSchema.parse(record.data)
      if (activation.sessionId !== agent.id) continue
      if (activation.enabled) active.add(activation.id)
      else active.delete(activation.id)
      const entry = entries.find(entry => entry.id === activation.id)
      if (entry === undefined) continue
      for (const tool of registered) {
        if (!toolkitContains(entry, tool.name)) continue
        if (activation.enabled) closed.delete(tool.name)
        else if (!entries.some(other => active.has(other.id) && toolkitContains(other, tool.name))) {
          retained.delete(tool.name)
          closed.add(tool.name)
        }
      }
    }
    // Innate channel and discovery tools must remain available without reactivation.
    const innate = new Set(['learn', 'genesis_recall', 'genesis_contacts', 'genesis_search_contacts', 'genesis_plan', TOOLKIT_TOOL, 'genesis_message',
      'genesis_qq_history', 'genesis_qq_read_media', 'genesis_qq_send', ...this.config.qqBasicTools])
    const admitted = new Set(eligible.filter(tool => innate.has(tool.name) || !closed.has(tool.name)).map(tool => tool.name))
    return registered.filter(tool => retained.has(tool.name) || admitted.has(tool.name))
  }
  private enabled(agent: Agent) {
    const state = this.ctx.genesisSessionEvidence.toolkitsOf(agent.session)
    if (state === undefined) throw new GenesisError('invalid-state', 'Toolkit activation recovery is unavailable. Reload Genesis before using tools.')
    return state.sessionId === agent.session.id ? state.enabled : []
  }
  /** Whether any group has a learned member. @returns Discovery visibility without revealing unknown tools. */
  discoverable(agent?: Agent): boolean {
    const learned = this.core.learningStatus().tools
    return this.preferences.read().entries.some(entry => (agent === undefined || !this.core.isQqSession(agent.id) || this.core.isOperatorSession(agent.id) || (entry.qqAccess !== undefined && entry.qqAccess !== 'disabled'))
      && learned.some(name => toolkitContains(entry, name)))
  }
  /**
   * Return complete catalogue entries within the complete serialized budget.
   * @param agent - Calling Session, used for active state and current scoped availability.
   * @param chars - Complete response character budget.
   * @param query - Optional name, identifier or description search; absent lists all eligible groups.
   * @returns Only groups with a learned member, with omission counts and no unknown member names.
   */
  catalogue(agent: Agent, chars: number, query = '') {
    const learned = this.core.learningStatus().tools
    const available = new Set(this.ctx.tools.schemas(agent).map(tool => tool.name))
    const active = this.enabled(agent)
    const qq = this.core.isQqSession(agent.id) && !this.core.isOperatorSession(agent.id)
    const matching = this.preferences.read().entries.filter(entry => (!qq || entry.qqAccess === 'anyone' || entry.qqAccess === 'operator') && learned.some(name => toolkitContains(entry, name))
      && `${entry.id} ${entry.name} ${entry.description}`.toLowerCase().includes(query.trim().toLowerCase()))
    const result: { entries: Array<{ id: ToolkitId; name: string; description?: string; learned: number; available: number; enabled: boolean; qqAccess?: 'disabled' | 'anyone' | 'operator' }>; omitted: number } = {
      entries: [], omitted: matching.length,
    }
    for (const entry of matching.slice(0, this.config.queryLimit)) {
      const tools = learned.filter(name => toolkitContains(entry, name))
      const summary = { id: entry.id, name: entry.name, learned: tools.length,
        available: tools.filter(name => available.has(name)).length, enabled: active.includes(entry.id), ...(qq && entry.qqAccess !== undefined ? { qqAccess: entry.qqAccess } : {}) }
      const detailed = { ...summary, description: entry.description }
      const fits = (value: typeof summary) => JSON.stringify({ entries: [...result.entries, value], omitted: result.omitted - 1 }).length <= chars
      const value = fits(detailed) ? detailed : summary
      if (!fits(value)) continue
      result.entries.push(value); result.omitted--
    }
    return result
  }
  /**
   * Mount the discovery tool and enforce closed groups at the real executor.
   * @param lifeMode - Select character conversations; task-mode tools remain unaffected.
   */
  install(lifeMode: (agent: Agent | undefined) => boolean): void {
    this.ctx.tools.guard((exec) => {
      if (!lifeMode(exec.agent) || exec.agent === undefined || exec.name === 'learn') return undefined
      try {
        if (this.core.isQqSession(exec.agent.id) && !this.core.isOperatorSession(exec.agent.id)) {
          return this.qqExecutionDenial(exec.agent, exec.name, exec.arguments)
        }
        return this.exposed(exec.agent, exec.name) ? undefined : 'This tool belongs to an inactive toolkit. Enable its toolkit with genesis_toolkit first.'
      } catch (_error) {
        // Untrusted settings or projection state cannot authorize tool execution.
        return 'Toolkit state is unavailable. Stop dependent work and reload verified Genesis storage.'
      }
    })
    this.ctx.tools.register(defineTool({
      name: TOOLKIT_TOOL,
      description: '查看、启用或关闭当前对话的工具包。仅展示含有已学会工具的工具包；启用后，下次请求注入包内当前可用且已学会的工具。新对话默认关闭。QQ 工具包由操作者配置为禁用、任何人可启用或仅操作者可启用；受限工具的每次调用也必须由当前已验证的操作者发言触发。已绑定操作者的私聊采用 Web 权限，不受 QQ 工具包受众限制。工具声明在权限变化后保留，未授权调用返回错误；压缩上下文不会移除工具声明；此前因压缩而隐藏、当前仍符合条件的工具会自动恢复。主动关闭工具包会移除其声明，重新启用即可恢复。搜索等 QQ 基础工具已内置。其他执行权限仍单独检查。',
      parameters: { action: { type: 'string', required: true, enum: ['list', 'enable', 'disable'] },
        id: { type: 'string', description: '启用或关闭时，传入上下文中的工具包 ID。' },
        query: { type: 'string', description: '查看时可按名称或说明搜索工具包。' } },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async (args, exec) => {
        exec.signal.throwIfAborted()
        const agent = exec.agent
        if (agent === undefined || !lifeMode(agent)) throw new GenesisError('invalid-source', 'Toolkit activation requires a Life conversation.')
        if (args.action === 'list') return this.catalogue(agent, this.config.resultChars, args.query)
        const entry = this.preferences.read().entries.find(entry => entry.id === args.id)
        const learned = this.core.learningStatus().tools
        if (entry === undefined || !learned.some(name => toolkitContains(entry, name))) {
          throw new GenesisError('invalid-source', 'No learned toolkit matches this ID. List available toolkits first.')
        }
        const enabled = args.action === 'enable'
        const qq = this.core.isQqSession(agent.id)
        const speaker = qq ? this.currentSpeaker(agent) : undefined
        if (qq && !this.core.isOperatorSession(agent.id) && enabled && (entry.qqAccess === undefined || entry.qqAccess === 'disabled'
          || speaker?.data.source.kind !== 'genesis-person'
          || entry.qqAccess === 'operator' && !this.core.isOperatorPerson(speaker.data.source.personId))) {
          throw new GenesisError('invalid-source', 'This QQ toolkit requires its configured audience and a current authenticated speaker; operator-only toolkits require the bound operator account.')
        }
        const tools = enabled ? this.ctx.tools.schemas(agent).map(tool => tool.name)
          .filter(name => learned.includes(name) && toolkitContains(entry, name)) : []
        const result = { id: entry.id, enabled, tools, permission: 'checked-at-execution' }
        if (JSON.stringify(result).length > this.config.resultChars) throw new GenesisError('capacity', 'Toolkit result exceeds resultChars. Reduce toolkit membership or increase resultChars.')
        if (qq) {
          const grant = enabled && speaker?.data.source.kind === 'genesis-person'
            ? { actor: speaker.data.source.personId, sourceSeq: speaker.seq } : undefined
          appendPluginRecord(agent.session, 'plugin:genesis/toolkit', { version: 2, sessionId: agent.session.id, id: entry.id, enabled,
            ...(grant === undefined ? {} : { grant }) })
        } else if (this.enabled(agent).includes(entry.id) !== enabled) {
          appendPluginRecord(agent.session, 'plugin:genesis/toolkit', { version: 1, sessionId: agent.session.id, id: entry.id, enabled })
        }
        return result
      },
      presentCall: args => ({ card: 'generic', title: '工具包', kind: 'edit', rawInput: args.id ?? args.query ?? args.action }),
    }))
  }
}
