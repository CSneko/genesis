/** Real external-Chrome connection through the configurable adapter. @module */
import { it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { BrowserMcpConfig } from '@deepseek-ai/dsh-experimental-browser-use-runtime/mcp'
import { verifyMcpBrowser } from '../../browser-use-runtime/tests/mcp-upstream.ts'
import * as Connection from '../src/connection.ts'

it.skipIf(process.env.DSH_BROWSER_EXECUTABLE === undefined)('shares configured Chrome between concurrent Sessions and preserves it after provider disposal', async () => {
  const provider = {
    name: Connection.name, inject: Connection.inject,
    apply(ctx: Context, config: BrowserMcpConfig) {
      if (config.mode !== 'attach') throw new Error('External browser fixture requires attach mode')
      return Connection.apply(ctx, Connection.Config({ endpoint: config.endpoint }))
    },
  }
  await verifyMcpBrowser(provider, 'playwright-mcp', { name: 'browser_navigate', arguments: url => ({ url }) }, 'attach', true)
})
