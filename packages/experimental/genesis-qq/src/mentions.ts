/** Preserve inbound mention targets and emit atomic OneBot mentions within bounded reply parts. @module */
import { parseMessage } from 'dsh-qq-onebot-bridge/onebot'
import { z } from 'zod'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import { required } from './required.ts'

const account = z
  .union([z.string().regex(/^[1-9][0-9]*$/u), z.number().int().positive().safe()])
  .transform(String)
  .refine(value => Number.isSafeInteger(Number(value)))
const mention = z.looseObject({ type: z.literal('at'), data: z.looseObject({ qq: z.union([account, z.literal('all')]) }) })

/** Actual outbound text or individual-account mention; raw CQ strings stay literal text. */
export type QqSegment = { type: 'text'; data: { text: string } } | { type: 'at'; data: { qq: string } }

/**
 * Retain addressed accounts in both OneBot array and CQ-string messages.
 * @param message - Parsed wire message; individual segment payloads remain untrusted.
 * @returns Plain text with explicit numeric mention targets; media stays excluded.
 */
export function messageText(message: string | unknown[]): string {
  const label = (qq: string) => (qq === 'all' ? '@全体成员' : `@${qq}`)
  const input =
    typeof message === 'string'
      ? message.replace(/\[CQ:at,qq=([^,\]]+)(?:,[^\]]*)?\]/gu, (raw: string, qq: string) => {
        const parsed = z.union([account, z.literal('all')]).safeParse(qq)
        return parsed.success ? ` ${label(parsed.data)} ` : raw
      })
      : message.map((segment) => {
        const parsed = mention.safeParse(segment)
        return parsed.success ? { type: 'text', data: { text: ` ${label(parsed.data.data.qq)} ` } } : segment
      })
  return parseMessage(input, 0).text
}

/**
 * Convert standalone numeric handles in group replies to real mentions without splitting their targets.
 * Blank lines separate messages; a single line break stays inside its message.
 * @param text - Complete visible assistant reply.
 * @param kind - Only group conversations support QQ mentions.
 * @param limit - Validated maximum visible Unicode characters per outgoing part.
 * @returns Ordered nonempty OneBot segment arrays; emails, CQ codes and private-message handles remain text.
 */
export function replyParts(text: string, kind: 'group' | 'private', limit: number): QqSegment[][] {
  const paragraphs = text.split(/\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*/u).filter(part => part.trim())
  if (paragraphs.length !== 1 || paragraphs[0] !== text) return paragraphs.flatMap(part => replyParts(part, kind, limit))
  const tokens: QqSegment[] = []
  let offset = 0
  if (kind === 'group')
    for (const match of text.matchAll(/(?<![A-Za-z0-9_@])@([1-9][0-9]*)(?![A-Za-z0-9_]|\.[A-Za-z0-9])/gu)) {
      if (!account.safeParse(match[1]).success) continue
      if (match.index > offset) tokens.push({ type: 'text', data: { text: text.slice(offset, match.index) } })
      tokens.push({ type: 'at', data: { qq: required(match[1], new GenesisError('invalid-state', 'Mention account is missing.')) } })
      offset = match.index + match[0].length
    }
  if (offset < text.length) tokens.push({ type: 'text', data: { text: text.slice(offset) } })
  const parts: QqSegment[][] = []
  let current: QqSegment[] = [],
    used = 0
  const flush = () => {
    if (current.length > 0) parts.push(current)
    current = []
    used = 0
  }
  for (const token of tokens) {
    if (token.type === 'at') {
      const size = token.data.qq.length + 1
      if (size > limit) throw new GenesisError('capacity', 'A QQ mention exceeds messageChars; increase that limit before sending.')
      if (used + size > limit) flush()
      current.push(token)
      used += size
      continue
    }
    const chars = Array.from(token.data.text)
    for (let index = 0; index < chars.length;) {
      if (used === limit) flush()
      const count = Math.min(limit - used, chars.length - index)
      current.push({ type: 'text', data: { text: chars.slice(index, index + count).join('') } })
      index += count
      used += count
    }
  }
  flush()
  return parts
}
