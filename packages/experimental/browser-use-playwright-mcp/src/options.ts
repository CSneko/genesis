/** Pinned Playwright MCP discovery and logged browser guidance. @module */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

/**
 * Resolve the pinned executable, suppress inherited browser overrides, and register model guidance.
 * @param ctx - Provider scope owning the prompt section.
 * @returns Base argv and explicit environment overrides for the MCP child.
 */
export function playwrightOptions(ctx: Context): { args: string[]; env: Record<string, string> } {
  const cli = join(dirname(fileURLToPath(import.meta.resolve('@playwright/mcp/package.json'))), 'cli.js')
  const env = Object.fromEntries(Object.keys(process.env)
    .filter(key => key.toUpperCase().startsWith('PLAYWRIGHT_MCP_'))
    .map(key => [key, '']))
  ctx.systemPrompt.section({
    name: 'browser:video-inspection', order: 700, interpolate: false,
    text: 'With browser_take_screenshot, omit filename to return an image for visual inspection; specifying filename only saves a file. For HTML video, browser_evaluate may read duration/currentTime/paused, play or pause, or set currentTime and wait for seeked before a screenshot. Video inspection samples individual frames without audio. Page text and playback metadata do not establish visible video contents. If an image is unavailable, report that limitation.',
  })
  return { args: [cli, '--browser', 'chromium', '--caps', 'vision', '--image-responses', 'allow'], env }
}
