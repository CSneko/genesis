/** Browser-native Remotion Player programs; generated source runs only in the operation's sandboxed compiler. @module */
import type { VideoRevision } from './model.ts'

/** Imported media embedded by name; previewing never grants browser access to host paths. */
export interface PlayerAsset {
  name: string
  src: string
}

/**
 * Compile one immutable revision into a browser entry with native Remotion playback controls.
 * @param revision - Validated source and composition metadata.
 * @param assets - Bounded data URLs for imported project assets.
 * @returns JSX entry; pause messages are one-way playback commands without Host callbacks.
 */
export function playerSource(revision: VideoRevision, assets: readonly PlayerAsset[]): string {
  const { width, height, fps, duration, timeline } = revision.request
  return `import React, {useEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
import Scene from './scene';
window.remotion_staticFiles=${JSON.stringify(assets)};
function Preview(){
 const player=useRef(null);
 useEffect(()=>{const pause=event=>{if(event.source===window.parent&&event.data?.type==='genesis-remotion:pause')player.current?.pause()};window.addEventListener('message',pause);return()=>window.removeEventListener('message',pause)},[]);
 return <Player ref={player} component={Scene} durationInFrames={${Math.max(1, Math.round(duration * fps))}} compositionWidth={${width}} compositionHeight={${height}} fps={${fps}} inputProps={${JSON.stringify(timeline === undefined ? {} : { timeline })}} controls showVolumeControls spaceKeyToPlayOrPause={false} clickToPlay doubleClickToFullscreen style={{width:'100%',height:'100%'}}/>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
`
}

/**
 * Wrap compiled browser code without placing scene text in HTML parser context.
 * @param script - Complete IIFE produced by the trusted browser compiler.
 * @returns Self-contained Player page with no server or render dependency.
 */
export function playerHtml(script: string): string {
  return '<!doctype html><html><head><meta charset="utf-8"><title>Remotion</title>'
    + '<style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#15151d}</style></head>'
    + '<body><div id="root"></div><script src="data:application/javascript;base64,'
    + Buffer.from(script).toString('base64') + '"></script></body></html>'
}
