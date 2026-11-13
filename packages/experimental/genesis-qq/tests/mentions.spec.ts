/** Mention parsing and exact Unicode reply limits preserve account targets. */
import { expect, it } from 'vitest'
import { messageText, replyParts } from '../src/mentions.ts'

it('retains the same account targets from arrays and CQ strings, including mention-only input', () => {
  expect(
    messageText([
      { type: 'at', data: { qq: '12345' } },
      { type: 'text', data: { text: '你好' } },
      { type: 'at', data: { qq: 99999 } },
    ]),
  ).toBe('@12345 你好 @99999')
  expect(messageText('[CQ:at,qq=12345,name=小明]你好[CQ:at,qq=99999]')).toBe('@12345 你好 @99999')
  expect(messageText([{ type: 'at', data: { qq: '12345' } }])).toBe('@12345')
  expect(messageText('[CQ:at,qq=all]')).toBe('@全体成员')
})

it('keeps mention targets atomic across Unicode reply parts and leaves private handles and emails literal', () => {
  expect(replyParts('🐋🐋 @12345 好', 'group', 8)).toEqual([
    [{ type: 'text', data: { text: '🐋🐋 ' } }],
    [
      { type: 'at', data: { qq: '12345' } },
      { type: 'text', data: { text: ' 好' } },
    ],
  ])
  const text = 'email@12345.com @昵称 [CQ:at,qq=12345] @all'
  expect(replyParts(text, 'group', 100)).toEqual([[{ type: 'text', data: { text } }]])
  expect(replyParts('@12345', 'private', 100)).toEqual([[{ type: 'text', data: { text: '@12345' } }]])
  expect(replyParts('你好@12345请看', 'group', 100)).toEqual([
    [
      { type: 'text', data: { text: '你好' } },
      { type: 'at', data: { qq: '12345' } },
      { type: 'text', data: { text: '请看' } },
    ],
  ])
  expect(() => replyParts('@12345', 'group', 5)).toThrow(/mention exceeds/u)
})

it('splits blank lines while preserving single line breaks, CQ literals and Unicode limits', () => {
  expect(replyParts('第一行\n第二行\r\n \t\r\n@12345 好\n\n\n尾巴', 'group', 100)).toEqual([
    [{ type: 'text', data: { text: '第一行\n第二行' } }],
    [
      { type: 'at', data: { qq: '12345' } },
      { type: 'text', data: { text: ' 好' } },
    ],
    [{ type: 'text', data: { text: '尾巴' } }],
  ])
  expect(replyParts('\n\n🐋🐋🐋\n\n', 'private', 2)).toEqual([
    [{ type: 'text', data: { text: '🐋🐋' } }],
    [{ type: 'text', data: { text: '🐋' } }],
  ])
  expect(replyParts('\n \n', 'private', 20)).toEqual([])
})
