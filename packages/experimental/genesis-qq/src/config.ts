/** Explicit opt-in QQ routes, identity binding and bounded transport resources. @module */
import z from '@deepseek-ai/schemastery'

/** Resolved deployment configuration; relationship estimates never change these permissions. */
export interface Config {
  /** Explicit autonomous group destinations; operator-requested outbound lists grant no autonomous permission. */
  proactiveGroups: string[]
  /** Explicit autonomous private destinations; empty disables private initiation. */
  proactiveUsers: string[]
  /** Groups permitted for explicit operator-requested outbound messages, independently of incoming admission. */
  outboundGroups: string[]
  /** Private recipients permitted for explicit operator-requested outbound messages. */
  outboundUsers: string[]
  /** Retained cross-conversation receipts; exhaustion refuses new sends without evicting deduplication evidence. */
  maxMessageReceipts: number
  /** Maximum retained sleeping-message and replay receipts. */
  sleepInboxLimit: number
  /** Maximum complete sleeping-inbox JSON characters. */
  sleepInboxChars: number
  /** Maximum text characters introduced in one delayed batch. */
  sleepInboxBatchChars: number
  /** Optional loopback OneBot forward-WebSocket URL; empty starts the reverse listener. */
  wsUrl: string
  /** Reconnection delay for an explicitly configured forward endpoint. */
  reconnectMs: number
  /** Reverse-WebSocket listener port; zero asks the OS to allocate a port. */
  port: number
  /** Legacy deployment shared secret for the configured OneBot client. */
  accessToken: string
  /** Legacy deployment QQ bot account; incoming frames from a different account are refused. */
  botQq: string
  /** Verified operator account, or empty to grant no QQ operator authority. */
  operatorQq: string
  /** Explicit allowed groups; empty refuses all groups. */
  allowGroups: string[]
  /** Explicit allowed private correspondents; empty refuses private chats unless acceptPrivateFromAnyone is enabled. */
  allowUsers: string[]
  /** Accept private text conversations from strangers, without granting tools or operator identity. */
  acceptPrivateFromAnyone: boolean
  /** Let the decision model select group replies; mention-only policy applies when disabled. */
  groupAutoReply: boolean
  /** Number of recent group messages supplied to decisions and replies. */
  recentMessages: number
  /** Complete serialized recent-message page and history-tool result character budget. */
  historyChars: number
  /** Maximum messages returned by one current-conversation history query. */
  historyLimit: number
  /** Require an actual OneBot mention segment in manual group reply mode. */
  replyOnlyWhenMentioned: boolean
  /** Additional QQ conversation preferences, included in logged model context. */
  extraPrompt: string
  /** Desired ordinary private conversation capacity in tokens, capped by model capacity. */
  privateContextTokens: number
  /** Desired group conversation capacity in tokens, capped by model capacity. */
  groupContextTokens: number
  /** Desired verified operator private conversation capacity in tokens. */
  operatorContextTokens: number
  /** Per-request QQ output-token ceiling, including reasoning, independent of adapter defaults. */
  maxCompletionTokens: number
  /** Maximum additional prompt characters. */
  maxPromptChars: number
  /** Registered Genesis life preset. */
  lifePreset: string
  /** Absolute dedicated workspace for this channel. */
  cwd: string
  /** Maximum combined group and private allowlist entries. */
  maxAllowedTargets: number
  /** Maximum recent delivery rows returned to the operator. */
  statusLimit: number
  /** Maximum serialized characters returned by channel inspection. */
  statusChars: number
  /** Maximum queued transport operations; excess input is visibly refused. */
  maxPending: number
  /** Maximum simultaneously opened conversations. */
  maxLiveSessions: number
  /** HTTP(S) media origins, optionally with a leftmost *. subdomain wildcard; redirects are refused. */
  mediaOrigins: string[]
  /** Maximum files per incoming message or processing request. */
  maxMediaItems: number
  /** Maximum bytes per attachment and per outbound media operation. */
  maxMediaBytes: number
  /** Maximum decoded text characters from one file. */
  mediaTextChars: number
  /** Overall attachment download and conversion deadline. */
  mediaTimeoutMs: number
  /** Fixed video frame sample count; audio transcription is not provided. */
  videoFrames: number
  /** Seconds between sampled video frames. */
  videoFrameInterval: number
  /** Maximum video frame width/height before attachment normalization. */
  videoFrameSize: number
  /** Operator-selected frame decoder executable; never taken from messages. */
  ffmpeg: string
  /** Operator-selected PDF text extractor executable. */
  pdftotext: string
  /** Managed subprocess termination grace interval. */
  mediaGraceMs: number
  /** Maximum accepted text input characters. */
  maxInputChars: number
  /** Maximum complete assistant reply characters before refusal. */
  maxOutputChars: number
  /** Maximum characters per outbound QQ message. */
  messageChars: number
  /** Maximum accepted WebSocket frame bytes. */
  maxFrameBytes: number
  /** Listener readiness deadline in milliseconds. */
  startupTimeoutMs: number
  /** OneBot action acknowledgement deadline in milliseconds; timeout leaves delivery uncertain. */
  actionTimeoutMs: number
}

/** Validated source-workspace deployment values; listener binding is always loopback. */
export const Config: z<Partial<Config> & Pick<Config, 'cwd'>, Config> = z.object({
  sleepInboxLimit: z.number().min(1).step(1).default(10000),
  sleepInboxChars: z.number().min(1000).step(1).default(5000000),
  sleepInboxBatchChars: z.number().min(1000).step(1).default(16000),
  proactiveGroups: z.array(z.string().pattern(/^[1-9][0-9]*$/)).default([]), proactiveUsers: z.array(z.string().pattern(/^[1-9][0-9]*$/)).default([]),
  outboundGroups: z.array(z.string()).default([]), outboundUsers: z.array(z.string()).default([]),
  maxMessageReceipts: z.number().min(1).step(1).default(10000),
  wsUrl: z.string().default(''), reconnectMs: z.number().min(100).step(1).default(2000),
  port: z.number().min(0).max(65535).step(1).default(6700),
  accessToken: z.string().role('secret').default(''), botQq: z.string().default(''), operatorQq: z.string().default(''),
  allowGroups: z.array(z.string()).default([]), allowUsers: z.array(z.string()).default([]),
  acceptPrivateFromAnyone: z.boolean().default(false), groupAutoReply: z.boolean().default(true),
  recentMessages: z.number().min(1).max(50).step(1).default(5),
  historyChars: z.number().min(1000).step(1).default(16000), historyLimit: z.number().min(1).max(100).step(1).default(20),
  replyOnlyWhenMentioned: z.boolean().default(true),
  extraPrompt: z.string().default(''), maxPromptChars: z.number().min(1).step(1).default(8000),
  privateContextTokens: z.number().min(1000).step(1).default(200000),
  groupContextTokens: z.number().min(1000).step(1).default(400000),
  operatorContextTokens: z.number().min(1000).step(1).default(500000),
  maxCompletionTokens: z.number().min(1).step(1).default(16384),
  lifePreset: z.string().default('life'), cwd: z.string().required(),
  maxAllowedTargets: z.number().min(1).step(1).default(1000),
  statusLimit: z.number().min(1).step(1).default(20), statusChars: z.number().min(1000).step(1).default(20000),
  maxPending: z.number().min(1).step(1).default(100), maxLiveSessions: z.number().min(1).step(1).default(100),
  mediaOrigins: z.array(z.string()).default(['https://*.qq.com', 'https://multimedia.nt.qq.com.cn', 'https://gchat.qpic.cn', 'https://c2cpicdw.qpic.cn']),
  maxMediaItems: z.number().min(1).max(20).step(1).default(5),
  maxMediaBytes: z.number().min(1024).max(104857600).step(1).default(20971520),
  mediaTextChars: z.number().min(100).max(100000).step(1).default(12000),
  mediaTimeoutMs: z.number().min(100).step(1).default(30000),
  videoFrames: z.number().min(1).max(10).step(1).default(3), videoFrameInterval: z.number().min(1).max(300).default(5),
  videoFrameSize: z.number().min(64).max(2048).step(1).default(768),
  ffmpeg: z.string().default('ffmpeg'), pdftotext: z.string().default('pdftotext'), mediaGraceMs: z.number().min(1).step(1).default(1000),
  maxInputChars: z.number().min(1).step(1).default(8000), maxOutputChars: z.number().min(1).step(1).default(12000),
  messageChars: z.number().min(1).step(1).default(1500), maxFrameBytes: z.number().min(1).step(1).default(1048576),
  startupTimeoutMs: z.number().min(1).step(1).default(10000), actionTimeoutMs: z.number().min(1).step(1).default(10000),
})
