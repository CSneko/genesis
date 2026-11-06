/** Native Life tool declarations with ordinary guarded batch execution. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolModelInput } from '@deepseek-ai/dsh-tools'
import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native'

/** Keep learning and channel declarations outside the prompt-text waterfall. */
export class LifeToolExecutor extends NativeToolExecutor {
  constructor(ctx: Context, private readonly visible: (tools: readonly ToolDefinition[]) => readonly ToolDefinition[]) {
    super(ctx)
  }

  override describe(tools: readonly ToolDefinition[]): ToolModelInput {
    return { ...super.describe(this.visible(tools)), knownNames: tools.map(tool => tool.name) }
  }
}
