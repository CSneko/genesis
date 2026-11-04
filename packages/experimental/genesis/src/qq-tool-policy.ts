/** Browser operations eligible for ordinary QQ speakers; toolkit permission remains separate. @module */

/** Exact browsing operations; scripts, input, uploads, downloads and tab management are excluded. */
export const QQ_BROWSER_TOOLS: readonly string[] = Object.freeze([
  'mcp__playwright-mcp__browser_navigate',
  'mcp__playwright-mcp__browser_snapshot',
  'mcp__playwright-mcp__browser_take_screenshot',
  'mcp__playwright-mcp__browser_wait_for',
])

/**
 * Limit browser calls from ordinary QQ speakers, including direct executor calls.
 * @param name - Registered tool name.
 * @param args - Parsed tool arguments; omitted when checking schema visibility.
 * @returns A denial reason, or undefined for an eligible call. This does not grant toolkit permission or isolate browser state.
 */
export function qqBrowserDenial(name: string, args?: unknown): string | undefined {
  const browser = ['mcp__playwright-mcp__', 'mcp__chrome-devtools-mcp__', 'stagehand_'].some(prefix => name.startsWith(prefix))
  if (!browser) return undefined
  if (!QQ_BROWSER_TOOLS.includes(name)) return 'Ordinary QQ speakers can browse pages but cannot execute browser scripts, enter input, manage tabs or transfer files.'
  if (args === undefined) return undefined
  if (typeof args !== 'object' || args === null) return 'Browser arguments must be an object.'
  if ('filename' in args) return 'QQ browsing cannot save browser output to a host file. Omit filename.'
  if (name === 'mcp__playwright-mcp__browser_navigate') {
    if (!('url' in args) || typeof args.url !== 'string') return 'QQ browsing requires an HTTP or HTTPS URL.'
    let url: URL
    try { url = new URL(args.url) }
    catch (_error) { return 'QQ browsing requires a valid HTTP or HTTPS URL.' }
    if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') {
      return 'QQ browsing requires an HTTP or HTTPS URL without embedded credentials.'
    }
  }
  return undefined
}
