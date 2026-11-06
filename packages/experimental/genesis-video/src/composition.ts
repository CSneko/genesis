/** Reproducible Remotion sources for layered clips, timed captions, music and custom React scenes. @module */
import type { VideoRevision } from './model.ts'

/** Built-in scene consumes validated timeline props; clip-relative frames control symmetric fades. */
export const timelineSource = `import React from 'react';
import {AbsoluteFill, Sequence, OffthreadVideo, Img, Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
const Layer = ({clip}) => {
 const frame = useCurrentFrame(); const {fps} = useVideoConfig();
 const n = Math.max(1, Math.round(clip.duration*fps)); const fade = Math.min(Math.round(clip.fade*fps), Math.floor(n/2));
 const opacity = fade ? Math.min(interpolate(frame,[0,fade],[0,1],{extrapolateRight:'clamp'}),interpolate(frame,[n-fade,n],[1,0],{extrapolateLeft:'clamp'})) : 1;
 const style = {width:'100%',height:'100%',objectFit:clip.fit};
 return <AbsoluteFill style={{opacity,backgroundColor:clip.kind==='color'?clip.color:undefined}}>
 {clip.kind==='video'?<OffthreadVideo src={staticFile(clip.asset)} startFrom={Math.round(clip.trim*fps)} volume={clip.volume} style={style}/>:clip.kind==='image'?<Img src={staticFile(clip.asset)} style={style}/>:null}
 </AbsoluteFill>;
};
export default function Scene({timeline}) {
 const {fps} = useVideoConfig(); const frames = seconds => Math.max(1,Math.round(seconds*fps));
 return <AbsoluteFill style={{backgroundColor:'#15151d',fontFamily:'sans-serif'}}>
 {timeline.clips.map((clip,i)=><Sequence key={'c'+i} from={Math.round(clip.from*fps)} durationInFrames={frames(clip.duration)}><Layer clip={clip}/></Sequence>)}
 {timeline.texts.map((t,i)=><Sequence key={'t'+i} from={Math.round(t.from*fps)} durationInFrames={frames(t.duration)}><AbsoluteFill style={{justifyContent:t.position==='top'?'flex-start':t.position==='center'?'center':'flex-end',alignItems:'center',padding:'6%'}}><div style={{fontSize:t.size,color:t.color,whiteSpace:'pre-wrap',textAlign:'center',maxWidth:'100%',overflowWrap:'anywhere',textShadow:'0 2px 6px black'}}>{t.text}</div></AbsoluteFill></Sequence>)}
 {timeline.audio.map((a,i)=><Sequence key={'a'+i} from={Math.round(a.from*fps)} durationInFrames={frames(a.duration)}><Audio src={staticFile(a.asset)} startFrom={Math.round(a.trim*fps)} volume={a.volume}/></Sequence>)}
 </AbsoluteFill>;
}
`
/**
 * Produce a fixed composition entry; custom code never controls CLI options or Node configuration.
 * @param revision - Validated revision, rendered with its matching scene and props.
 * @returns React entry registering one GenesisVideo composition.
 */
export function compositionSource(revision: VideoRevision): string {
  const { width, height, fps, duration } = revision.request
  return `import React from 'react';\nimport {registerRoot, Composition} from 'remotion';\nimport Scene from './scene';\nregisterRoot(() => <Composition id="GenesisVideo" component={Scene} width={${width}} height={${height}} fps={${fps}} durationInFrames={${Math.max(1, Math.round(duration * fps))}}/>);\n`
}
