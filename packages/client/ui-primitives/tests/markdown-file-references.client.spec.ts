/** Reply file discovery uses the same Markdown grammar as file links. */
import { describe, expect, it } from 'vitest'
import { extractMarkdownFilePaths } from '../src/markdown/file-references.ts'

describe('reply file references', () => {
  it('collects links, images, inline paths and bare paths without duplicate line references', () => {
    expect(extractMarkdownFilePaths([
      '[报告](<output/季度 报告.pdf>)',
      '![图](/tmp/plot.png)',
      '`/tmp/plot.png` and ./output/data.csv and notes.txt.',
      '[源文件](src/index.ts#L24) [再次](src/index.ts:32)',
      '`C:\\work\\report.pdf` `src/other.ts:8`',
    ].join('\n'))).toEqual(['output/季度 报告.pdf', '/tmp/plot.png', './output/data.csv', 'notes.txt', 'src/index.ts', 'C:\\work\\report.pdf', 'src/other.ts'])
  })

  it('resolves used reference links and ignores external URLs, reasoning-free code samples and unused definitions', () => {
    expect(extractMarkdownFilePaths([
      '[file][result] [website](https://example.com/report.pdf)',
      'https://example.com/report.pdf `https://example.com/file.txt`',
      '```sh',
      'cat /private/secret.txt',
      '```',
      '[result]: /tmp/result.pdf',
      '[unused]: /tmp/unused.pdf',
    ].join('\n'))).toEqual(['/tmp/result.pdf'])
  })
})
