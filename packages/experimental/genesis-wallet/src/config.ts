/** Deployment bounds, built-in Taobao source and optional custom product endpoint. @module */
import Schema from '@deepseek-ai/schemastery'
/** Wallet deployment settings; balances and products are operator-owned data. */
export interface Config {
  /** Preset allowed to use wallet tools. */ lifePreset: string
  /** Items returned per catalog page. */ pageSize: number
  /** Combined retained product, order and ledger budget. */ maxRecords: number
  /** Complete serialized state budget. */ maxStateChars: number
  /** Complete serialized tool-result budget. */ resultChars: number
  /** Browser refresh interval, including sidebar pending indication. */ pollMs: number
  /** Optional custom HTTP(S) adapter overriding the built-in source. */ productEndpoint: string
  /** Built-in read-only shopping endpoint. */ taobaoEndpoint: string
  /** Credential reference used only for the built-in source. */ taobaoCredentialRef: string
  /** Optional credential reference sent only to the configured endpoint. */ credentialRef: string
  /** Product query deadline. */ timeoutMs: number
  /** Maximum product query response bytes. */ maxResponseBytes: number
}
/** Validate resource limits before mounting. */
export const Config: Schema<Config> = Schema.object({
  lifePreset: Schema.string().default('life'),
  pageSize: Schema.natural().min(1).max(100).default(20),
  maxRecords: Schema.natural().min(1).default(10000),
  maxStateChars: Schema.natural().min(1024).default(16000000),
  resultChars: Schema.natural().min(1024).default(64000),
  pollMs: Schema.natural().min(1000).default(5000),
  taobaoEndpoint: Schema.string().default('https://mcp.yuantoutao.com/mcp'),
  taobaoCredentialRef: Schema.string().default('GENESIS_WALLET_TAOBAO_KEY'),
  productEndpoint: Schema.string().default(''),
  credentialRef: Schema.string().default(''),
  timeoutMs: Schema.natural().min(100).max(120000).default(15000),
  maxResponseBytes: Schema.natural().min(1024).default(1048576),
})
