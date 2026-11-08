/** Deployment resource budgets; account and permission choices belong to operator settings. @module */
import Schema from '@deepseek-ai/schemastery'
/** Validated plugin configuration. */
export interface Config {
  /** Life preset used for mail processing. */ lifePreset: string
  /** Dedicated absolute mail conversation directory. */ cwd: string
  /** Background synchronization interval. */ pollMs: number
  /** Protocol and complete processing deadline. */ timeoutMs: number
  /** Maximum RFC 822 bytes before parsing. */ maxSourceBytes: number
  /** Maximum plain-text message characters. */ maxTextChars: number
  /** Maximum incoming messages retained in one synchronization. */ batchSize: number
  /** Retained mail and receipt limit. */ maxRecords: number
  /** Complete serialized mailbox limit. */ maxStateChars: number
  /** Complete serialized tool result limit. */ resultChars: number
  /** Maximum list results per page. */ pageSize: number
  /** Main model output limit per request. */ maxTokens: number
  /** Main model requests per mail-processing opportunity. */ maxSteps: number
}
/** Validate all resource budgets before loading the mailbox. */
export const Config: Schema<Config> = Schema.object({
  lifePreset: Schema.string().default('life'), cwd: Schema.string().default(process.cwd()),
  pollMs: Schema.natural().min(1000).default(60000), timeoutMs: Schema.natural().min(1000).max(600000).default(120000),
  maxSourceBytes: Schema.natural().min(1024).max(16777216).default(2097152), maxTextChars: Schema.natural().min(1).max(100000).default(16000),
  batchSize: Schema.natural().min(1).max(100).default(10), maxRecords: Schema.natural().min(1).default(10000),
  maxStateChars: Schema.natural().min(1024).default(64000000), resultChars: Schema.natural().min(1024).default(64000),
  pageSize: Schema.natural().min(1).max(100).default(30), maxTokens: Schema.natural().min(128).max(32768).default(4096),
  maxSteps: Schema.natural().min(1).max(100).default(12),
})
