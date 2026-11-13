/** Browser-safe MCP catalog and installation views. @module */
/** One operator-supplied value required by a catalog recipe. */
export interface McpInput {
  id: string
  label: string
  description: string
  secret: boolean
  required: boolean
  defaultValue: string
  choices: string[]
}
/** One supported remote connection or version-pinned local package. */
export interface McpRecipe {
  id: string
  label: string
  local: boolean
  inputs: McpInput[]
  fingerprint: string
}
/** Official catalog metadata; descriptions are untrusted display data. */
export interface McpProduct {
  name: string
  title: string
  description: string
  version: string
  website: string
  recipes: McpRecipe[]
}
/** Bounded official registry page. */
export interface McpCatalogPage {
  products: McpProduct[]
  cursor: string | null
}
/** Current configured and plugin-owned services, without command arguments or secrets. */
export interface McpInstalled {
  name: string
  managed: boolean
  state: string
  tools: string[]
  omittedTools: number
}
/** Management sample; revision protects profile changes from stale writes. */
export interface McpInventory {
  revision: number
  uncertain: boolean
  servers: McpInstalled[]
  pollMs: number
}
/** Operator-confirmed catalog selection. */
export interface McpInstall {
  name: string
  version: string
  recipe: string
  fingerprint: string
  values: Record<string, string>
  revision: number
}
/** Custom connection, separate from catalog-driven installation. */
export interface McpCustom {
  name: string
  transport: 'streamable-http' | 'stdio'
  url: string
  command: string
  args: string[]
  env: Record<string, string>
  headers: Record<string, string>
}
