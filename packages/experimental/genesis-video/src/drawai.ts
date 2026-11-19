/** DrawAI canvas assets for Genesis videos; executable rendering stays with the managed video owner. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolkitId } from '@deepseek-ai/dsh-experimental-genesis/types'
import { z } from 'zod'
import type { Config } from './index.ts'

const canvasTools = ['diagram_read', 'diagram_apply', 'diagram_export', 'motion_spec']
const edits = new Set(['addNode', 'addEdge', 'setLabel', 'setLabelPos', 'setStyle', 'setEdge', 'order',
  'duplicate', 'addLayer', 'setLayer', 'setLayerProps', 'move', 'remove', 'highlight'])
const operations = z.object({ ops: z.array(z.object({ op: z.string() }).passthrough()) }).passthrough()
const target = z.object({ path: z.string().trim().min(1) }).passthrough()
const ownsTool = (name: string) => name.startsWith('diagram_') || name.startsWith('motion_')
  || name === 'audio_asset' || name === 'mg_style' || name === 'shotcraft_search'

/** Register a live canvas toolkit without installing DrawAI, teaching tools or granting file access.
 * @param ctx - Video plugin effect owner; groups and guards disappear on disposal.
 * @param config - Existing video input/output limits and deployment opt-in.
 * @param participates - Current operator Life authorization, checked on each execution.
 * @returns A bounded guide derived from currently registered tools, for logged guide results only.
 */
export function installDrawai(ctx: Context, config: Config, participates: (agent: Agent | undefined) => boolean) {
  const available = () => ctx.tools.schemas().map(tool => tool.name).filter(name => canvasTools.includes(name))
  ctx.genesisToolkits.registerManaged('genesis-drawai', () => {
    const tools = available()
    return tools.length ? [{ id: brandString<ToolkitId>('drawai'), name: '画布与视频素材',
      description: '编辑 DrawAI 画布与分镜，导出 PNG 素材供 genesis_video 制作视频', tools, qqAccess: 'disabled' }] : []
  })
  ctx.tools.guard((exec) => {
    if (!ownsTool(exec.name)) return undefined
    if (!participates(exec.agent)) return 'DrawAI integration requires the configured operator Life conversation.'
    if (!canvasTools.includes(exec.name)) return 'This DrawAI operation is outside the Genesis canvas integration. Use genesis_video for managed previews, rendering, cancellation and delivery. Independent DrawAI rendering and automatic component downloads are unavailable here.'
    if (JSON.stringify(exec.arguments).length > config.inputChars) return 'DrawAI input exceeds inputChars. Split the canvas edit before retrying.'
    if (!target.safeParse(exec.arguments).success) return 'Supply an explicit workspace canvas path. Do not use another conversation’s focused canvas.'
    if (exec.name === 'diagram_apply') {
      const parsed = operations.safeParse(exec.arguments)
      if (!parsed.success || parsed.data.ops.some(op => !edits.has(op.op)))
        return 'Use static canvas edits only. Media imports, tracing, extraction and browser exports are unavailable; use diagram_export with format=png, then genesis_video import.'
    }
    return undefined
  })
  ctx.on('tools/post-execute', async (exec, result, next) => {
    if (!canvasTools.includes(exec.name) || result.isError) return next()
    if (JSON.stringify(result).length > config.resultChars)
      return { kind: 'block', feedback: [{ type: 'text', text: 'DrawAI result exceeds resultChars. A completed edit or export remains committed. Read a smaller selection before continuing.' }] }
    return next()
  }, { global: true })
  return () => ({
    available: available(),
    toolkitId: 'drawai',
    canvasImport: 'A complete existing .drawio or .drawai canvas may be opened, reused and exported as a whole, including as video artwork. Use diagram_read with its explicit authorized path and page; inspect its existing nodes, edges, layers, text, geometry and styles before editing. Preserve the original file unless the user explicitly requests editing it; otherwise make a copy with an authorized file tool before editing. Do not reduce an import request to copying only layout and colors, redraw selected fragments, or require icons and photographic backgrounds unless the user requests that redesign. Visual design suggestions are optional and do not restrict canvas import. Check each requested page separately. Unsupported styles or external/relative image references may not render: report the specific missing content and export warnings, request the required assets or a rendered original, and never claim a partial rendering is a complete import.',
    workflow: 'Learn the available DrawAI tools and enable toolkit drawai. Use explicit workspace paths. Follow canvasImport for existing canvases; use diagram_apply only when creation or editing is requested. Export a local PNG with diagram_export. Create a genesis_video project, import that PNG, and use its returned asset name in a timeline image clip or custom React scene. Preview, render and deliver through genesis_video. DrawAI and Genesis projects remain separate.',
    limits: 'Static canvas edits and motion_spec only. No DrawAI media operations, independent rendering, automatic downloads or publishing. Export fidelity may be approximate; inspect the actual composition. Installed, learned, authorized and successfully used are separate facts.',
  })
}
