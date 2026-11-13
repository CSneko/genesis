/** Registry endpoint, profile owner and explicit resource budgets. @module */
import Schema from '@deepseek-ai/schemastery'
/** Deployment settings for operator-managed MCP discovery and installation. */
export interface Config {
  registryUrl: string
  managerEntry: string
  lifePreset: string
  pageSize: number
  timeoutMs: number
  maxResponseBytes: number
  cacheMs: number
  cacheEntries: number
  resultChars: number
  contextChars: number
  maxTools: number
  pollMs: number
}
/** Validate deployment limits before exposing the management API. */
export const Config: Schema<Config> = Schema.object({
  registryUrl: Schema.string().default('https://registry.modelcontextprotocol.io'),
  managerEntry: Schema.string().default('mcp-manager'),
  lifePreset: Schema.string().default('life'),
  pageSize: Schema.natural().min(1).max(100).default(20),
  timeoutMs: Schema.natural().min(100).max(120000).default(15000),
  maxResponseBytes: Schema.natural().min(1024).default(2097152),
  cacheMs: Schema.natural().min(1000).default(3600000),
  cacheEntries: Schema.natural().min(1).default(64),
  resultChars: Schema.natural().min(1024).default(262144),
  contextChars: Schema.natural().min(256).default(8000),
  maxTools: Schema.natural().min(1).default(100),
  pollMs: Schema.natural().min(1000).default(3000),
})
