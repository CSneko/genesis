/** Local file references in Markdown replies, independent of rendering and file access. */
import type { Nodes } from 'mdast'
import { parseGfm } from './parse.ts'
import { parseFileLink } from './file-link.ts'

/**
 * Collect local link targets and path-like prose in first-seen order. Code blocks,
 * HTML, external URLs and unused link definitions do not contribute files.
 * Bare filenames require an extension; paths containing spaces require a link or inline code.
 * This recognizes references only; existence and permission remain the file reader's responsibility.
 * @param text - settled Markdown reply.
 * @returns unique decoded paths without line selectors.
 */
export function extractMarkdownFilePaths(text: string): string[] {
  const root = parseGfm(text)
  const definitions = new Map(root.children.flatMap(node => node.type === 'definition'
    ? [[node.identifier.toUpperCase(), node.url] as const] : []))
  const paths = new Set<string>()
  const add = (value: string): void => {
    const file = parseFileLink(value)
    if (file !== undefined) paths.add(file.path)
  }
  const looksLikePath = (value: string): boolean => {
    const file = parseFileLink(value)
    return file !== undefined
      && /^(?:[\\/]|\.{1,2}[\\/]|[a-z]:[\\/])|^[^\s<>:]+[\\/][^\s<>:]+|^[^\s<>:]+\.[a-z\d]{1,16}$/iu.test(file.path)
  }
  const walk = (node: Nodes): void => {
    if (node.type === 'link' || node.type === 'image') { add(node.url); return }
    if (node.type === 'linkReference' || node.type === 'imageReference') {
      const url = definitions.get(node.identifier.toUpperCase())
      if (url !== undefined) add(url)
      return
    }
    if (node.type === 'inlineCode') {
      if (looksLikePath(node.value)) add(node.value)
      return
    }
    if (node.type === 'text') {
      for (const token of node.value.split(/[\s<>"'`，。；！？（）【】]+/u)) {
        const value = token.replace(/^[([{]+|[)\]},;!。]+$/gu, '').replace(/\.$/u, '')
        if (value !== '' && looksLikePath(value)) add(value)
      }
    }
    if ('children' in node) for (const child of node.children) walk(child)
  }
  walk(root)
  return [...paths]
}
