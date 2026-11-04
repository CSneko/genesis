/** Versioned original-text and outbound-plan records; neither grants execution authority. @module */
import { z } from 'zod'
import { conversationIdSchema } from '@deepseek-ai/dsh-experimental-genesis'
import { qqMessageIdSchema } from './message-store.ts'
const account = z.union([z.string().regex(/^[1-9][0-9]*$/u), z.number().int().positive()]).transform(String)
/** Durable original text and exact outbound plans; both are untrusted conversation data. */
export const qqMessageRecordSchema = z.discriminatedUnion('kind', [
  z.strictObject({ version: z.literal(1), kind: z.literal('input'), messageId: z.string().min(1), qq: account,
    nickname: z.string(), text: z.string(), textOnly: z.boolean() }),
  z.strictObject({ version: z.literal(1), kind: z.literal('planned'), id: qqMessageIdSchema,
    targetId: conversationIdSchema, text: z.string(), requestedBy: account, forwardedMessageId: z.string().optional() }),
])
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Original QQ plain text and cross-conversation plans; never replayed as send commands. */
    'plugin:genesis-qq/message': z.infer<typeof qqMessageRecordSchema>
  }
}
