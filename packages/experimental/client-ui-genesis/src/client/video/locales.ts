/** Copy for the isolated Remotion composition viewer. @module */
export const zh = {
  title: 'Remotion 工程',
  frame: 'Remotion 工程预览',
  loading: '正在载入 Remotion 工程…',
  failed: '无法打开工程预览，请重新生成预览后重试。',
  openBrowser: '在浏览器中打开',
  download: '下载预览文件',
} satisfies Record<string, string>
/** Remotion preview dictionary keys. */
export type RemotionPreviewKey = keyof typeof zh
/** English copy with the same complete key set. */
export const en = {
  title: 'Remotion project',
  frame: 'Remotion project preview',
  loading: 'Loading Remotion project…',
  failed: 'Could not open the project preview. Generate the preview again and retry.',
  openBrowser: 'Open in browser',
  download: 'Download preview',
} satisfies Record<RemotionPreviewKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Player title, local loading/failure and browser access controls. */
    genesisRemotionPreview: RemotionPreviewKey
  }
}
