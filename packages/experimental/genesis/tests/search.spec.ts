/** Multilingual ranking shared by persistent, temporary and written records. */
import { expect, it } from 'vitest'
import { searchText } from '../src/search.ts'

const document = (value: string, title: string, content = '') => ({ value,
  fields: [{ text: title, weight: 3 }, { text: content, weight: 1 }] })

it('segments Chinese questions, ranks multiple keywords and matches partial names', () => {
  const documents = [document('unrelated', '今天一起散步'), document('partial', '用户喜欢红茶'),
    document('both', '用户喜欢乌龙茶，每天喝茶'), document('name', '小鲸喜欢玩星露谷物语')]
  expect(searchText('喜欢 乌龙茶', documents)[0]?.value).toBe('both')
  expect(searchText('你还记得用户喜欢什么茶吗？', documents).map(item => item.value)).toContain('both')
  expect(searchText('星露谷', documents)[0]?.value).toBe('name')
  expect(searchText('火星殖民', documents)).toEqual([])
  expect(searchText(' ？！ ', documents)).toEqual([])
})

it('normalizes fullwidth text, preserves original offsets and prefers title coverage over repetition', () => {
  const documents = [document('body', 'Other notes', 'tea '.repeat(100)),
    document('title', 'Ｏｏｌｏｎｇ Tea', 'The preferred warm drink is oolong tea.')]
  const matches = searchText('oolong TEA', documents)
  expect(matches[0]?.value).toBe('title')
  expect(matches[0]?.positions).toEqual([0, 28])
  expect(searchText('foo', [document('expanded', '㍿ ＦＯＯ')])[0]?.positions[0]).toBe(2)
  expect(searchText('oolong, drink', documents)[0]?.value).toBe('title')
})

it('gives exact identifiers priority and uses stable input order for tied records', () => {
  const documents = [document('first', 'topic'), document('second', 'topic'),
    { ...document('exact', 'something else'), id: 'topic' }]
  expect(searchText('topic', documents).map(item => item.value)).toEqual(['exact', 'first', 'second'])
})
