/** Inline game operations retain the shared tool policy and settlement stages. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecutionInput, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'

/**
 * Dispatch one parsed game operation without creating another model batch.
 * @param ctx - Owner of the actual tool registry and guards.
 * @param input - Correlated operation and its cancellation signal.
 * @returns Settled canonical result after policy, dispatch and finalization.
 */
export async function dispatchGameTool(ctx: Context, input: ToolExecutionInput): Promise<ToolExecutionResult> {
  const pipeline = new ToolExecutionPipeline(ctx)
  const prepared = await pipeline.prepare(input)
  const outcome = prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared
  return pipeline.complete(prepared.exec, outcome)
}
