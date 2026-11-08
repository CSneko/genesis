/** Operator-configurable attachment to an independently managed Chrome. @module */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { validateBrowserMcpConfig } from '@deepseek-ai/dsh-experimental-browser-use-runtime/mcp'
import { playwrightOptions } from './options.ts'
import { mountSharedBrowser } from './persistent.ts'

/** Settings namespace for the external browser connection. */
export const name = 'browser-connection'
/** Services required by the Session-owned browser adapter. */
export { inject } from './index.ts'

/** External Chrome address; saved updates apply after provider restart. */
export interface Config {
  /** HTTP(S) or WS(S) debugging endpoint resolved on the DSH server. */
  endpoint: Volatile<string>
  /** Per-call timeout in milliseconds; omission uses the MCP client's default. */
  toolCallTimeoutMs?: number
}

/** Validate operator edits before the settings store commits them. */
export const Config = Schema.object({
  endpoint: Schema.string()
    .pattern(/^(?:https?|wss?):\/\/(?:\[[0-9a-fA-F:.]+\]|[^\s/:?#@]+)(?::\d{1,5})?(?:[/?#][^\s]*)?$/u)
    .default('http://127.0.0.1:9222').volatile(),
  toolCallTimeoutMs: Schema.number().min(1),
})

/**
 * Share one external Chrome across Sessions without starting or stopping that browser.
 * The provider captures its endpoint until restart and serializes individual calls.
 * @param ctx - Browser registration and Session lifecycle owner.
 * @param config - Persisted operator address and optional call timeout.
 * @returns After shared browser tools have been discovered and published.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const endpoint = config.endpoint.get()
  validateBrowserMcpConfig({ mode: 'attach', endpoint })
  const options = playwrightOptions(ctx)
  await mountSharedBrowser(ctx, {
    env: options.env, args: [...options.args, '--cdp-endpoint', endpoint],
    ...config.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: config.toolCallTimeoutMs },
  })
}
