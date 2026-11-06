/** Two isolated frames keep authored scene scripts away from the application and its network origin. @module */

import { bytesToBase64 } from '@deepseek-ai/dsh-util-crypto'

const SCENE_POLICY = "default-src 'none'; script-src 'unsafe-inline' data: blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src data: blob:; frame-src 'none'; form-action 'none'; base-uri 'none'"
const WRAPPER_POLICY = "default-src 'none'; script-src 'unsafe-inline' data: blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src data: blob:; frame-src blob:; form-action 'none'; base-uri 'none'"

/**
 * Protect complete Player HTML without trusting its markup or scene JavaScript.
 * @param bytes - File bytes admitted by the shared document reader's size limit.
 * @returns Trusted outer page; its opaque child cannot navigate to HTTP(S) or access Host callbacks.
 */
export function remotionDocument(bytes: Uint8Array<ArrayBuffer>): string {
  const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  for (const element of parsed.querySelectorAll('base,meta[http-equiv]')) element.remove()
  const policy = parsed.createElement('meta')
  policy.setAttribute('http-equiv', 'Content-Security-Policy')
  policy.setAttribute('content', SCENE_POLICY)
  parsed.head.prepend(policy)
  const data = new TextEncoder().encode('<!doctype html>' + parsed.documentElement.outerHTML)
  const encoded = bytesToBase64(data)
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${WRAPPER_POLICY}">
<style>html,body,iframe{margin:0;width:100%;height:100%;border:0;overflow:hidden}iframe{display:block}</style></head><body>
<iframe sandbox="allow-scripts" allow="fullscreen" allowfullscreen title="Remotion Player"></iframe><script>(()=>{
const frame=document.querySelector('iframe');
const data=Uint8Array.from(atob('${encoded}'),value=>value.charCodeAt(0));
frame.src=URL.createObjectURL(new Blob([data],{type:'text/html'}));
window.addEventListener('message',event=>{if(event.source===window.parent&&event.data?.type==='genesis-remotion:pause')frame.contentWindow.postMessage({type:'genesis-remotion:pause'},'*')});
})()</script></body></html>`
}
