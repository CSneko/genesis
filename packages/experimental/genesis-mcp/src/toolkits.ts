/** Derive automatic groups from live MCP intent and still-registered teardown consumers. @module */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { McpManagedServerView } from '@deepseek-ai/dsh-mcp-manager/types'
import type { ToolkitDefinition, ToolkitId } from '@deepseek-ai/dsh-experimental-genesis/types'

/** Keep one group per enabled server until its remaining tool registrations are withdrawn.
 * @param servers - Current manager views, including retained teardown records.
 * @param registered - Exact currently registered tool names; learning does not affect ownership.
 * @returns Read-only derived definitions; disabling or removal withdraws them after tool cleanup.
 */
export function mcpToolkits(servers: readonly McpManagedServerView[], registered: readonly string[]): ToolkitDefinition[] {
  return servers
    .filter(
      server =>
        (server.configured && server.status.state !== 'disabled') || registered.some(tool => tool.startsWith(`mcp__${server.name}__`)),
    )
    .map(server => ({
      id: brandString<ToolkitId>(`mcp-${server.name}`),
      name: `MCP · ${server.name}`,
      description: 'Tools managed by this MCP service.',
      tools: [`mcp__${server.name}__*`],
      qqAccess: 'disabled',
    }))
}
