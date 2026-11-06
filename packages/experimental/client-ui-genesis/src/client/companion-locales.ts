/** Typed operator copy for the internal companion settings. @module */
export const en = {
  title: 'AI companion', description: 'Connect AstrBot for private internal conversations. Only Genesis sends messages to QQ. Neither side starts automatically while either is asleep.',
  enabled: 'Enable connection', interaction: 'Allow internal conversations', endpoint: 'AstrBot reverse WebSocket URL', name: 'Partner name',
  token: 'Shared token', tokenSaved: 'A token is stored', tokenMissing: 'Save a token of at least 16 characters', saveToken: 'Save token', removeToken: 'Remove token',
  sleep: 'Partner sleep schedule', sleepEnabled: 'Use partner sleep schedule', zone: 'Time zone', start: 'Sleep time', end: 'Wake time',
  scheduleHint: 'This schedule controls triggers from Genesis. AstrBot’s other channels keep their own schedules. Configure Genesis separately in Sleep settings.',
  rounds: 'Maximum Genesis replies per exchange', save: 'Save and apply connection', refresh: 'Refresh', stale: 'Settings changed. Reload the form before saving.', reload: 'Reload form',
  topic: 'Topic to share with the partner', begin: 'Start one conversation', stop: 'Stop conversation', continue: 'Continue the conversation', wakeGenesis: 'Wake Genesis', wakePartner: 'Temporarily wake partner',
  wakeHint: 'Waking does not start a conversation. Partner wake duration follows deployment settings; Genesis stays awake until its next scheduled interval.',
  connected: 'Connected', disconnected: 'Disconnected', awake: 'Awake', asleep: 'Asleep', genesis: 'Genesis', partner: 'Partner',
  status: 'Connection and sleep', active: 'Conversation in progress', idle: 'No active conversation',
  'blocked.disabled': 'Connection is disabled', 'blocked.interaction-disabled': 'Internal conversations are disabled', 'blocked.disconnected': 'Connect AstrBot first',
  'blocked.genesis-asleep': 'Genesis is asleep', 'blocked.partner-asleep': 'The partner is asleep', ready: 'Both sides may converse',
  'blocked.archived': 'Restore the archived partner conversation before continuing',
  failure: 'Connection or interaction needs attention. Check the endpoint, token and sleep settings; inspect Host logs and the source Session before retrying uncertain delivery.',
  unavailable: 'Companion status is unavailable. Refresh to retry.', understanding: 'Genesis’s current understanding', inference: 'Revisable model inference, supported by the listed internal messages',
  unknown: 'No relationship interpretation yet', history: 'Recent internal messages', empty: 'No messages yet', omitted: 'Older messages remain in the source Sessions',
  'outcome.recorded': 'Recorded internally', 'outcome.reserved': 'Delivery reserved', 'outcome.emitted': 'Written to internal socket', 'outcome.uncertain': 'Delivery uncertain',
  openSession: 'Open source conversation',
} as const
/** Locale key set shared by the plugin registration and its component. */
export type CompanionKey = keyof typeof en
/** Chinese copy with the same key set as English. */
export const zh: Record<CompanionKey, string> = {
  title: '智能体伙伴', description: '连接 AstrBot，进行私密的内部交流。QQ 消息仍由 Genesis 发送。任一方睡眠时不自动启动双方互动。',
  enabled: '启用连接', interaction: '允许内部互动', endpoint: 'AstrBot 反向 WebSocket 地址', name: '伙伴名称',
  token: '共用令牌', tokenSaved: '已保存令牌', tokenMissing: '请保存至少 16 个字符的令牌', saveToken: '保存令牌', removeToken: '移除令牌',
  sleep: '伙伴作息', sleepEnabled: '启用伙伴睡眠时间', zone: '时区', start: '入睡时间', end: '醒来时间',
  scheduleHint: '此作息限制 Genesis 向伙伴发起的触发；AstrBot 其他通道的作息由它自行管理。Genesis 的作息请在睡眠设置中配置。',
  rounds: '每次交流最多由 Genesis 回复几次', save: '保存并应用连接', refresh: '刷新', stale: '设置已变化，请重新载入表单后保存', reload: '重新载入表单',
  topic: '明确分享给伙伴的话题', begin: '开始一次交流', stop: '停止交流', continue: '继续聊', wakeGenesis: '唤醒 Genesis', wakePartner: '临时唤醒伙伴',
  wakeHint: '唤醒不会开始交流。伙伴临时唤醒时长由部署设置控制，默认 30 分钟；Genesis 保持清醒到下一次计划睡眠。',
  connected: '已连接', disconnected: '未连接', awake: '清醒', asleep: '睡眠', genesis: 'Genesis', partner: '伙伴',
  status: '连接与作息状态', active: '正在交流', idle: '暂无进行中的交流',
  'blocked.disabled': '连接已禁用', 'blocked.interaction-disabled': '内部互动已禁用', 'blocked.disconnected': '请先连接 AstrBot',
  'blocked.genesis-asleep': 'Genesis 正在睡眠', 'blocked.partner-asleep': '伙伴正在睡眠', ready: '双方可以交流',
  'blocked.archived': '请先取消归档伙伴会话，再继续交流',
  failure: '连接或交流需要处理，请核对地址、令牌和作息；投递不确定时，先查看服务端日志和来源会话，再决定是否重试',
  unavailable: '无法读取伙伴状态，请刷新重试', understanding: 'Genesis 当前对伙伴的认识', inference: '可修订的模型推断，依据所列内部消息形成',
  unknown: '尚未形成关系认识', history: '近期内部交流', empty: '尚无消息', omitted: '更早消息保留在来源会话中',
  'outcome.recorded': '已记录于内部', 'outcome.reserved': '已预留投递', 'outcome.emitted': '已写入内部连接', 'outcome.uncertain': '投递结果不确定',
  openSession: '打开来源会话',
}
