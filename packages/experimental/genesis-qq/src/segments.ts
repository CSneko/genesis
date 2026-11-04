/** OneBot segment parsing retains CQ escapes without treating wire metadata as instructions. @module */
import { z } from 'zod'
const segment = z.looseObject({ type: z.string().max(40), data: z.record(z.string(), z.unknown()) })
/** Validated wire segment; individual fields are parsed by their consumer. */
export type WireSegment = z.infer<typeof segment>
const unescapeCq = (text: string) => text.replace(/&#44;/gu, ',').replace(/&#91;/gu, '[').replace(/&#93;/gu, ']').replace(/&amp;/gu, '&')
/**
 * Parse arrays or CQ strings.
 * @param message - Untrusted OneBot content.
 * @returns Ordered recognized segment objects.
 */
export function segments(message: string | unknown[]): WireSegment[] {
  if (Array.isArray(message)) return message.map(value => segment.parse(value))
  const result: WireSegment[] = []
  let offset = 0
  for (const match of message.matchAll(/\[CQ:([a-zA-Z_]+)((?:,[^\]]*)?)\]/gu)) {
    if (match.index > offset) result.push({ type: 'text', data: { text: unescapeCq(message.slice(offset, match.index)) } })
    const data: Record<string, unknown> = {}
    for (const field of match[2]!.split(',').slice(1)) {
      const split = field.indexOf('=')
      if (split > 0) data[field.slice(0, split)] = unescapeCq(field.slice(split + 1))
    }
    result.push({ type: match[1]!, data }); offset = match.index + match[0].length
  }
  if (offset < message.length) result.push({ type: 'text', data: { text: unescapeCq(message.slice(offset)) } })
  return result
}
/**
 * Describe non-text input before reply decisions.
 * @param message - Wire content.
 * @returns Labels without bearer URLs or local paths.
 */
export function segmentLabels(message: string | unknown[]): string {
  return segments(message).flatMap(part => ['image', 'mface', 'video', 'file', 'face', 'reply'].includes(part.type)
    ? [`[${part.type}${part.type === 'face' && /^\d+$/u.test(String(part.data['id'])) ? `:${String(part.data['id'])}` : ''}]`] : []).join(' ')
}
