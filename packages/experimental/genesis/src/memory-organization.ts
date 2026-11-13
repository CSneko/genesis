/** Versioned declarative organization; classification never changes remembered evidence. @module */
import { z } from 'zod'
import { personIdSchema } from './people-model.ts'
import type { LifeMemory } from './model.ts'
import { isNonDeclarative } from './personality.ts'

/** Optional directory placement and subject associations, independent of the original memory category. */
export const memoryOrganizationSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.enum(['knowledge', 'person', 'event', 'unclassified']),
    paths: z
      .array(z.array(z.string().trim().min(1).max(80)).min(1).max(8))
      .max(8)
      .optional(),
    subjects: z
      .array(z.strictObject({ name: z.string().trim().min(1).max(200), personId: personIdSchema.optional() }))
      .max(16)
      .optional(),
    // Accept the review marker carried by existing organization records.
    reviewed: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'knowledge' && !value.paths?.length) ctx.addIssue({ code: 'custom', message: 'Knowledge needs a directory path.' })
    if (value.type === 'person' && !value.subjects?.length)
      ctx.addIssue({ code: 'custom', message: 'Person memory needs a named subject.' })
  })
/** Current organization metadata; unresolved names do not establish account identity. */
export type MemoryOrganization = z.infer<typeof memoryOrganizationSchema>

/**
 * Supply deterministic placement for old records without interpreting their prose.
 * @param memory - Current record, including legacy records without an explicit layer.
 * @returns Existing placement, an event placement for explicit experiences, or pending classification.
 */
export function memoryOrganization(memory: LifeMemory): MemoryOrganization | undefined {
  if (isNonDeclarative(memory)) return undefined
  return memory.organization ?? { version: 1, type: memory.experience === undefined ? 'unclassified' : 'event' }
}

/** Writer instructions for declarative organization. */
export const CLASSIFICATION_GUIDANCE =
  '陈述性记忆增加 organization：{"version":1,"type":"knowledge|person|event|unclassified"}。知识包含 paths（字符串路径数组的数组，第一层为领域，后续为目录）；人物包含 subjects（{name,personId?} 数组）。事件可以关联 subjects 和 paths。无法确定或混合内容保留 unclassified，不改写或拆分正文。人物 ID 只能来自提供的已知人物且证据明确支持同一身份；同名、发言者身份和文本提及不能单独证明人物绑定。目录名称沿用提供的已有目录，避免同义重复。分类不改变事实、归属或置信度。非陈述性条目不设置 organization。'

/**
 * Apply directory and subject filters before ranking or budgeting.
 * @param memory - Already audience-authorized record.
 * @param filter - Optional independent organization filters.
 * @returns Whether the record belongs to the requested view.
 */
export function organizationMatches(
  memory: LifeMemory,
  filter: {
    type?: MemoryOrganization['type']
    path?: readonly string[]
    person?: string
  },
): boolean {
  const organization = memoryOrganization(memory)
  const pathFilter = filter.path
  return (
    (filter.type === undefined || organization?.type === filter.type) &&
    (pathFilter === undefined ||
      organization?.paths?.some(path => pathFilter.every((part, index) => path[index] === part)) === true) &&
    (filter.person === undefined ||
      organization?.subjects?.some(subject => subject.personId === filter.person || subject.name === filter.person) === true)
  )
}
