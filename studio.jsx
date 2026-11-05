import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './studio.css';

const STORE = 'handala-studio-project-v1';
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = n => { const s=Math.max(0,n||0); return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0')+'.'+String(Math.floor((s%1)*10)); };
const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
function parseSrt(input){
  const stamp=value=>{const m=value.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);return m?Number(m[1])*3600+Number(m[2])*60+Number(m[3])+Number(m[4].padEnd(3,'0'))/1000:null;};
  return input.replace(/\r/g,'').trim().split(/\n\s*\n/).map(block=>{
    const lines=block.split('\n'),i=lines.findIndex(line=>line.includes('-->'));if(i<0)return null;
    const times=lines[i].split('-->').map(x=>x.trim()),start=stamp(times[0]),end=stamp(times[1]);
    const text=lines.slice(i+1).join('\n').trim();return start!==null&&end!==null&&end>start&&text?{id:uid(),start,end,text}:null;
  }).filter(Boolean);
}

const DB_NAME = 'handala-studio-db';
function openStudioDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('projects'))request.result.createObjectStore('projects');};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function readStudioProject(){
  const db=await openStudioDb();
  return new Promise((resolve,reject)=>{
    const request=db.transaction('projects','readonly').objectStore('projects').get('current');
    request.onsuccess=()=>{db.close();resolve(request.result||null);};
    request.onerror=()=>{db.close();reject(request.error);};
  });
}
async function writeStudioProject(project){
  const db=await openStudioDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('projects','readwrite');
    tx.objectStore('projects').put(project,'current');
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}


function Studio() {
  const [clips,setClips] = useState([]);
  const [captions,setCaptions] = useState([]);\n  const [hydrated,setHydrated] = useState(false);\n  const clipsRef = useRef([]); clipsRef.current = clips;
  const [selected,setSelected] = useState(null);
  const [playhead,setPlayhead] = useState(0);
  const [playing,setPlaying] = useState(false);
  const [ratio,setRatio] = useState('9:16');
  const [overlay,setOverlay] = useState('Your story starts here');
  const [textColor,setTextColor] = useState('#ffffff');
  const [textSize,setTextSize] = useState(100);
  const [textPosition,setTextPosition] = useState('bottom');
  const [volume,setVolume] = useState(80);
  const [zoom,setZoom] = useState(1);
  const [notice,setNotice] = useState('Import video, images, or audio to begin.');
  const [exporting,setExporting] = useState(false);
  const videoRef = useRef(null);
  const audioRefs = useRef({});
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const selectedClip = clips.find(c=>c.id===selected) || null;
  const duration = Math.max(10,...clips.map(c=>c.start+c.end-c.trimStart));
  const activeVideo = clips.filter(c=>c.kind==='video' || c.kind==='image').find(c=>playhead>=c.start && playhead<c.start+(c.end-c.trimStart)) || null;
  const audioClips = clips.filter(c=>c.kind==='audio');
  const activeCaption = captions.find(c=>playhead>=c.start&&playhead<=c.end) || null;

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const saved=await readStudioProject();
        if(cancelled)return;
        if(saved){
          const restored=(saved.clips||[]).map(c=>{const blob=c.blob||c.file;return {...c,file:blob,url:blob?URL.createObjectURL(blob):''};});
          setClips(restored);setCaptions(saved.captions||[]);setRatio(saved.ratio||'9:16');setOverlay(saved.overlay??'');setVolume(saved.volume??80);setTextColor(saved.textColor||'#ffffff');setTextSize(saved.textSize||100);setTextPosition(saved.textPosition||'bottom');
          setNotice('Project restored, including locally saved media.');
        }else{
          const raw=localStorage.getItem(STORE);
          if(raw){const p=JSON.parse(raw);setRatio(p.ratio||'9:16');setOverlay(p.overlay||'');setVolume(p.volume??80);setTextColor(p.textColor||'#ffffff');setTextSize(p.textSize||100);setTextPosition(p.textPosition||'bottom');}
        }
      }catch{setNotice('Could not restore the local project. You can still import media.');}
      finally{if(!cancelled)setHydrated(true);}
    })();
    return()=>{cancelled=true;};
  },[]);
  useEffect(()=>{
    if(!hydrated)return;
    const project={ratio,overlay,volume,textColor,textSize,textPosition,captions,clips:clips.map(({url,file,...c})=>({...c,blob:file||null}))};
    writeStudioProject(project).then(()=>setNotice('Project saved locally with its media.')).catch(()=>setNotice('Local storage is full or unavailable. Export a project backup soon.'));
    try{localStorage.setItem(STORE,JSON.stringify({ratio,overlay,volume,textColor,textSize,textPosition}));}catch{}
  },[clips,captions,ratio,overlay,volume,textColor,textSize,textPosition,hydrated]);
  useEffect(()=>{ if(!playing)return; let last=performance.now(); const tick=now=>{const dt=(now-last)/1000;last=now;setPlayhead(t=>{if(t+dt>=duration){setPlaying(false);return 0;}return t+dt;});rafRef.current=requestAnimationFrame(tick);};rafRef.current=requestAnimationFrame(tick);return()=>cancelAnimationFrame(rafRef.current);},[playing,duration]);
  useEffect(()=>{ const el=videoRef.current;if(!el||!activeVideo||activeVideo.kind!=='video')return; if(el.src!==activeVideo.url){el.src=activeVideo.url;el.load();} const target=activeVideo.trimStart+(playhead-activeVideo.start);if(Math.abs((el.currentTime||0)-target)>.45){try{el.currentTime=target;}catch{}} if(playing)el.play().catch(()=>{});else el.pause(); },[activeVideo?.id,playhead,playing]);
  useEffect(()=>{audioClips.forEach(c=>{const el=audioRefs.current[c.id];if(!el)return;const local=playhead-c.start+c.trimStart;if(playhead>=c.start&&playhead<c.start+(c.end-c.trimStart)){if(Math.abs(el.currentTime-local)>.5)try{el.currentTime=local;}catch{}el.volume=volume/100;if(playing)el.play().catch(()=>{});else el.pause();}else el.pause();});},[playhead,playing,volume,clips]);
  useEffect(()=>()=>{new Set(clipsRef.current.map(c=>c.url).filter(Boolean)).forEach(url=>URL.revokeObjectURL(url));},[]);

  async function importSrt(file){if(!file)return;const parsed=parseSrt(await file.text());setCaptions(parsed);setNotice(parsed.length+' subtitle cues imported.');}
  function importFiles(files){const list=Array.from(files||[]);if(!list.length)return;const incoming=list.map(file=>{const url=URL.createObjectURL(file);const kind=file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':file.type.startsWith('image/')?'image':null;if(!kind){URL.revokeObjectURL(url);return null;}return {id:uid(),name:file.name,file,url,kind,start:kind==='audio'?0:Math.max(0,...clips.filter(c=>c.kind!=='audio').map(c=>c.start+c.end-c.trimStart)),trimStart:0,end:kind==='image'?5:0,duration:kind==='image'?5:0,brightness:100,contrast:100,saturation:100,fadeIn:0,fadeOut:0};}).filter(Boolean);incoming.forEach(c=>{if(c.kind!=='image'){const media=document.createElement(c.kind==='video'?'video':'audio');media.preload='metadata';media.src=c.url;media.onloadedmetadata=()=>{const d=Number.isFinite(media.duration)?media.duration:5;setClips(old=>old.map(x=>x.id===c.id?{...x,duration:d,end:d}:x));};}});setClips(old=>[...old,...incoming]);if(incoming[0])setSelected(incoming[0].id);setNotice(incoming.length+' media file(s) imported.');}
  function update(id,patch){setClips(old=>old.map(c=>c.id===id?{...c,...patch}:c));}
  function remove(id){setClips(old=>old.filter(x=>x.id!==id));if(selected===id)setSelected(null);}
  function split(){const c=selectedClip;if(!c||c.kind==='audio'){setNotice('Select a video or image clip to split.');return;}const local=playhead-c.start+c.trimStart;if(local<=c.trimStart+.05||local>=c.end-.05){setNotice('Move the playhead inside the selected clip to split it.');return;}const right={...c,id:uid(),name:c.name+' (split)',start:playhead,trimStart:local};update(c.id,{end:local});setClips(old=>[...old,right]);setSelected(right.id);setNotice('Clip split at playhead.');}
  function seek(e){const r=e.currentTarget.getBoundingClientRect();setPlayhead(clamp(((e.clientX-r.left)/r.width)*duration,0,duration));}
  function moveClip(id,delta){const c=clips.find(x=>x.id===id);if(!c)return;update(id,{start:Math.max(0,c.start+delta)});}
  async function exportVideo(){
    if(!clips.some(c=>c.kind==='video'||c.kind==='image')){setNotice('Add a video or image clip before exporting.');return;}
    if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){setNotice('This browser does not support in-browser video export.');return;}
    setExporting(true);setNotice('Preparing media and audio…');
    const canvas=canvasRef.current,ctx=canvas.getContext('2d');
    const [w,h]=ratio==='9:16'?[720,1280]:ratio==='1:1'?[1080,1080]:[1280,720];
    canvas.width=w;canvas.height=h;
    const stream=canvas.captureStream(30),chunks=[];
    let recorder,audioContext;
    const sources=new Map();
    try{
      for(const clip of clips.filter(c=>c.kind==='video'||c.kind==='image')){
        if(clip.kind==='image'){
          const img=new Image();img.src=clip.url;
          await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Could not load '+clip.name));});
          sources.set(clip.id,img);
        }else{
          const video=document.createElement('video');video.src=clip.url;video.muted=true;video.playsInline=true;video.preload='auto';
          await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('Could not load '+clip.name));});
          sources.set(clip.id,video);
        }
      }
      const audioFiles=clips.filter(c=>c.kind==='audio');
      if(audioFiles.length&&window.AudioContext){
        audioContext=new AudioContext();await audioContext.resume();
        const destination=audioContext.createMediaStreamDestination();
        for(const clip of audioFiles){
          const bytes=await clip.file.arrayBuffer();
          const buffer=await audioContext.decodeAudioData(bytes.slice(0));
          const source=audioContext.createBufferSource(),gain=audioContext.createGain();
          source.buffer=buffer;gain.gain.value=volume/100;source.connect(gain);gain.connect(destination);
          const offset=clamp(clip.trimStart,0,Math.max(0,buffer.duration-.01));
          const length=Math.min(clip.end-offset,buffer.duration-offset);
          if(length>.02)source.start(audioContext.currentTime+clip.start,offset,length);
        }
        destination.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
      }
      const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')?'video/webm;codecs=vp9,opus':'video/webm';
      recorder=new MediaRecorder(stream,{mimeType:mime});
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      const done=new Promise(resolve=>{recorder.onstop=resolve;});
      const total=duration,startAt=performance.now();
      recorder.start(250);setPlaying(false);setNotice('Rendering video in your browser…');
      const draw=now=>{
        const t=(now-startAt)/1000;
        ctx.fillStyle='#080a10';ctx.fillRect(0,0,w,h);
        const clip=clips.filter(x=>x.kind==='video'||x.kind==='image').find(x=>t>=x.start&&t<x.start+x.end-x.trimStart);
        if(clip){
          const source=sources.get(clip.id);
          if(source instanceof HTMLVideoElement){
            const target=clip.trimStart+t-clip.start;
            if(Math.abs(source.currentTime-target)>.4){try{source.currentTime=target;}catch{}}
            if(source.paused)source.play().catch(()=>{});
          }
          if(source&&source.readyState>=2){
            const sw=source.videoWidth||source.naturalWidth,sh=source.videoHeight||source.naturalHeight;
            if(sw&&sh){const scale=Math.max(w/sw,h/sh),dw=sw*scale,dh=sh*scale;const elapsed=t-clip.start,remaining=clip.end-clip.trimStart-elapsed;const fadeIn=clip.fadeIn||0,fadeOut=clip.fadeOut||0;ctx.globalAlpha=Math.min(1,fadeIn?elapsed/fadeIn:1,fadeOut?remaining/fadeOut:1);ctx.filter='brightness('+(clip.brightness??100)+'%) contrast('+(clip.contrast??100)+'%) saturate('+(clip.saturation??100)+'%)';ctx.drawImage(source,(w-dw)/2,(h-dh)/2,dw,dh);ctx.globalAlpha=1;ctx.filter='none';}
          }
        }
        if(overlay.trim()){
          ctx.fillStyle='rgba(0,0,0,.38)';ctx.fillRect(0,h*.78,w,h*.22);
          ctx.fillStyle=textColor;ctx.textAlign='center';ctx.font='bold '+Math.round(w*.045*textSize/100)+'px Arial';
          const y=textPosition==='top'?h*.16:textPosition==='center'?h*.52:h*.89;ctx.fillText(overlay.slice(0,80),w/2,y,w*.88);
        }
        const cue=captions.find(item=>t>=item.start&&t<=item.end);
        if(cue){ctx.font='bold '+Math.round(w*.035)+'px Arial';ctx.textAlign='center';const lines=cue.text.split('\\n').slice(0,3);const lineH=Math.round(w*.045);const boxH=lines.length*lineH+24;ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(w*.06,h*.86-boxH,w*.88,boxH);ctx.fillStyle='#fff';lines.forEach((line,index)=>ctx.fillText(line,w/2,h*.86-boxH+lineH*(index+1),w*.82));}
        if(t<total&&recorder.state==='recording')requestAnimationFrame(draw);
        else if(recorder.state==='recording')recorder.stop();
      };
      requestAnimationFrame(draw);await done;
      const blob=new Blob(chunks,{type:'video/webm'});
      setNotice('Converting export to MP4 with FFmpeg…');
      let finalBlob=blob,filename='handala-studio-export.webm';
      try{
        const response=await fetch('/api/studio/export/mp4',{method:'POST',headers:{'Content-Type':'video/webm'},body:blob});
        if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.detail||'MP4 conversion is unavailable.');}
        finalBlob=await response.blob();filename='handala-studio.mp4';
      }catch(error){setNotice('MP4 conversion unavailable; downloading WebM instead. '+error.message);}
      const link=document.createElement('a');link.href=URL.createObjectURL(finalBlob);link.download=filename;link.click();
      setTimeout(()=>URL.revokeObjectURL(link.href),30000);
      if(filename.endsWith('.mp4'))setNotice('Export complete. MP4 created and downloaded.');
    }catch(e){
      if(recorder?.state==='recording')recorder.stop();
      setNotice('Export failed: '+e.message);
    }finally{
      stream.getTracks().forEach(t=>t.stop());
      if(audioContext)await audioContext.close().catch(()=>{});
      setExporting(false);
    }
  }
  const pxPerSecond=34*zoom;
  return <div className="studio">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">ح</span><span>HANDALA <b>STUDIO</b><small>CREATIVE VIDEO WORKSPACE</small></span></a><div className="top-actions"><select value={ratio} onChange={e=>setRatio(e.target.value)} aria-label="Canvas aspect ratio"><option value="9:16">Portrait 9:16</option><option value="16:9">Landscape 16:9</option><option value="1:1">Square 1:1</option></select><button className="primary" onClick={exportVideo} disabled={exporting||!clips.length}>{exporting?'Rendering…':'⇩ Export video'}</button></div></header>
    <main className="editor-grid">
      <aside className="media-panel"><div className="panel-title"><span>MEDIA LIBRARY</span><label className="import-button">＋ Import<input type="file" multiple accept="video/*,image/*,audio/*" onChange={e=>{importFiles(e.target.files);e.target.value='';}}/></label><label className="import-button secondary-import">＋ SRT<input type="file" accept=".srt,text/plain" onChange={e=>{importSrt(e.target.files?.[0]);e.target.value='';}}/></label></div><p className="hint">Media and project timeline are saved in this browser using local storage.</p><div className="asset-list">{clips.map(c=><button key={c.id} className={'asset '+(selected===c.id?'chosen':'')} onClick={()=>setSelected(c.id)}><span className="asset-icon">{c.kind==='video'?'▶':c.kind==='audio'?'♫':'▧'}</span><span className="asset-name">{c.name}</span><small>{c.kind.toUpperCase()}</small></button>)}</div><div className="panel-foot">LOCAL PROJECT · MEDIA + TIMELINE AUTO-SAVED</div></aside>
      <section className="preview-panel"><div className="preview-head"><span>PREVIEW MONITOR</span><span>{ratio} · {fmt(playhead)} / {fmt(duration)}</span></div><div className={'stage '+(ratio==='16:9'?'wide':ratio==='1:1'?'square':'portrait')}><div className="stage-content">{activeVideo?.kind==='video'?<video ref={videoRef} muted playsInline style={{filter:activeVideo?`brightness(${activeVideo.brightness??100}%) contrast(${activeVideo.contrast??100}%) saturate(${activeVideo.saturation??100}%)`:'none',opacity:activeVideo?Math.min(1,(playhead-activeVideo.start)/(activeVideo.fadeIn||.001),(activeVideo.end-activeVideo.trimStart-(playhead-activeVideo.start))/(activeVideo.fadeOut||.001)):'1'}} />:activeVideo?.kind==='image'?<img src={activeVideo.url} style={{filter:`brightness(${activeVideo.brightness??100}%) contrast(${activeVideo.contrast??100}%) saturate(${activeVideo.saturation??100}%)`}} />:<div className="stage-empty"><span>ح</span><b>HANDALA STUDIO</b><small>Import media to start editing</small></div>}{overlay&&<div className={'preview-caption '+textPosition} style={{color:textColor,fontSize:textSize+'%'}}>{overlay}</div>}{activeCaption&&<div className="subtitle-preview">{activeCaption.text}</div>}</div></div><div className="transport"><button onClick={()=>setPlayhead(0)} title="Go to start">|◀</button><button className="play" onClick={()=>setPlaying(x=>!x)}>{playing?'Ⅱ':'▶'}</button><button onClick={()=>{setPlayhead(duration);setPlaying(false);}} title="Go to end">▶|</button><span>{fmt(playhead)}</span><input aria-label="Playhead" type="range" min="0" max={duration} step=".05" value={Math.min(playhead,duration)} onChange={e=>setPlayhead(+e.target.value)}/><span>{fmt(duration)}</span></div><canvas ref={canvasRef} className="hidden-canvas" /></section>
      <aside className="inspector"><div className="panel-title"><span>INSPECTOR</span><span className="inspector-dot"/></div>{selectedClip?<><div className="inspector-name">{selectedClip.name}</div><label>Clip start (seconds)<input type="number" min="0" step=".1" value={selectedClip.start} onChange={e=>update(selectedClip.id,{start:Math.max(0,+e.target.value)})}/></label><label>Trim in (seconds)<input type="number" min="0" max={selectedClip.end-.1} step=".1" value={selectedClip.trimStart} onChange={e=>update(selectedClip.id,{trimStart:clamp(+e.target.value,0,selectedClip.end-.1)})}/></label><label>Trim out (seconds)<input type="number" min={selectedClip.trimStart+.1} max={selectedClip.duration} step=".1" value={selectedClip.end} onChange={e=>update(selectedClip.id,{end:clamp(+e.target.value,selectedClip.trimStart+.1,selectedClip.duration||99999)})}/></label>{selectedClip.kind!=='audio'&&<><label>Brightness <b>{selectedClip.brightness??100}%</b><input type="range" min="30" max="170" value={selectedClip.brightness??100} onChange={e=>update(selectedClip.id,{brightness:+e.target.value})}/></label><label>Contrast <b>{selectedClip.contrast??100}%</b><input type="range" min="30" max="170" value={selectedClip.contrast??100} onChange={e=>update(selectedClip.id,{contrast:+e.target.value})}/></label><label>Saturation <b>{selectedClip.saturation??100}%</b><input type="range" min="0" max="200" value={selectedClip.saturation??100} onChange={e=>update(selectedClip.id,{saturation:+e.target.value})}/></label><label>Fade in <b>{selectedClip.fadeIn??0}s</b><input type="range" min="0" max="3" step=".1" value={selectedClip.fadeIn??0} onChange={e=>update(selectedClip.id,{fadeIn:+e.target.value})}/></label><label>Fade out <b>{selectedClip.fadeOut??0}s</b><input type="range" min="0" max="3" step=".1" value={selectedClip.fadeOut??0} onChange={e=>update(selectedClip.id,{fadeOut:+e.target.value})}/></label></>}<div className="inspector-actions"><button onClick={split}>✂ Split at playhead</button><button className="danger" onClick={()=>remove(selectedClip.id)}>Delete clip</button></div></>:<p className="hint">Select a clip on the timeline to edit its timing and trim points.</p>}
      <div className="inspector-divider"/><label>Text overlay<input value={overlay} onChange={e=>setOverlay(e.target.value)} placeholder="Add a title…" maxLength="100"/></label><label>Text size <b>{textSize}%</b><input type="range" min="60" max="180" value={textSize} onChange={e=>setTextSize(+e.target.value)}/></label><label>Text color<input type="color" value={textColor} onChange={e=>setTextColor(e.target.value)}/></label><label>Text position<select value={textPosition} onChange={e=>setTextPosition(e.target.value)}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label><label>Audio volume <b>{volume}%</b><input type="range" min="0" max="100" value={volume} onChange={e=>setVolume(+e.target.value)}/></label><p className="hint">Text overlays and audio volume are included in the browser export. Advanced effects and keyframes are planned.</p></aside>
    </main>
    <section className="timeline-panel"><div className="timeline-toolbar"><div><b>TIMELINE</b><span>{clips.length} clips</span></div><div className="timeline-tools"><button onClick={split} disabled={!selectedClip}>✂ Split</button><button onClick={()=>setZoom(z=>clamp(z/1.25,.5,4))}>−</button><button onClick={()=>setZoom(z=>clamp(z*1.25,.5,4))}>＋</button><span>{Math.round(zoom*100)}%</span></div></div><div className="timeline-scroll"><div className="ruler" style={{width:Math.max(900,duration*pxPerSecond+160)}} onClick={seek}>{Array.from({length:Math.ceil(duration/5)+1},(_,i)=><span key={i} style={{left:i*5*pxPerSecond}}>{fmt(i*5)}</span>)}</div>{['video','audio','image','captions'].map(kind=><div className="track-row" key={kind}><div className="track-label">{kind==='video'?'VIDEO':kind==='audio'?'AUDIO':kind==='image'?'OVERLAYS':'SUBTITLES'}</div><div className="track-lane" style={{width:Math.max(900,duration*pxPerSecond+160)}} onClick={e=>{if(e.target===e.currentTarget)seek(e);}}>{clips.filter(c=>kind==='video'?c.kind==='video':kind==='audio'?c.kind==='audio':kind==='image'?c.kind==='image':false).map(c=><div key={c.id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',c.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');const other=clips.find(x=>x.id===id);if(other)moveClip(id,c.start-other.start);}} onClick={e=>{e.stopPropagation();setSelected(c.id);}} className={'timeline-clip '+kind+(selected===c.id?' selected':'')} style={{left:c.start*pxPerSecond,width:Math.max(42,(c.end-c.trimStart)*pxPerSecond)}} title={c.name}><b>{c.kind==='audio'?'♫':c.kind==='image'?'▧':'▶'} {c.name}</b><small>{fmt(c.end-c.trimStart)}</small></div>)}{kind==='captions'&&captions.map(c=><div key={c.id} className="timeline-clip caption" style={{left:c.start*pxPerSecond,width:Math.max(38,(c.end-c.start)*pxPerSecond)}} title={c.text}><b>CC {c.text}</b></div>)}</div></div>)}<div className="playhead" style={{left:112+playhead*pxPerSecond}} onMouseDown={e=>{e.preventDefault();const lane=e.currentTarget.parentElement;const fn=ev=>{const r=lane.getBoundingClientRect();setPlayhead(clamp((ev.clientX-r.left-112)/pxPerSecond,0,duration));};const up=()=>{window.removeEventListener('mousemove',fn);window.removeEventListener('mouseup',up);};window.addEventListener('mousemove',fn);window.addEventListener('mouseup',up);}}/></div></section>
    {audioClips.map(c=><audio key={c.id} ref={el=>audioRefs.current[c.id]=el} src={c.url} preload="auto" />)}<footer><span>HANDALA STUDIO · EARLY ACCESS</span><span>{notice}</span></footer>
  </div>;
}
createRoot(document.getElementById('studio-root')).render(<Studio />);
