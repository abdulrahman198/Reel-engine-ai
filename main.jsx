import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Film, Mic, Subtitles, Play, Sparkles, Download, ImagePlus, Upload, CheckCircle2, Plus, Trash2, RefreshCw, Clapperboard, FolderOpen, Save } from 'lucide-react';
import { request, jsonRequest, snapshot, downloadPlan, url } from './client/api.js';
import { translator } from './client/i18n.js';
import './style.css';

const DRAFT = 'reel-engine-v07-draft';
function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function initialDraft() { const d = readLocal(DRAFT, null); return d?.id && d.project && Array.isArray(d.images) ? d : null; }

function App() {
  const [ui, setUi] = useState(() => readLocal('reel-ui-language', 'ar')), t = translator(ui);
  const [health, setHealth] = useState(null), [connectionError, setConnectionError] = useState('');
  const [doc, setDoc] = useState(initialDraft), current = useRef(doc), queue = useRef(Promise.resolve()); current.current = doc;
  const [projectList, setProjectList] = useState([]), [saveState, setSaveState] = useState('localDraft'), [saveError, setSaveError] = useState('');
  const [topic, setTopic] = useState(''), [language, setLanguage] = useState('de'), [duration, setDuration] = useState(30);
  const [style, setStyle] = useState('Cinematic documentary'), [aspect, setAspect] = useState('9:16');
  const [stage, setStage] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState(null);
  const [voices, setVoices] = useState([]), [voiceId, setVoiceId] = useState(''), [watchAttempt, setWatchAttempt] = useState(0), [watchError, setWatchError] = useState(false);
  const project = doc?.project, images = doc?.images || [], audio = doc?.audio, captions = doc?.captions, video = doc?.video;
  const busy = !!stage || !!doc?.activeJob, completeImages = !!project && images.length === project.scenes.length && images.every(Boolean);
  const hasCaptions = !!(captions || audio?.hasCaptions);
  const patch = changes => setDoc(value => value ? { ...value, ...changes } : value);
  const refreshProjects = async () => setProjectList((await request('/api/projects')).projects);

  async function checkConnection() {
    try { setHealth(await request('/api/health')); setConnectionError(''); await refreshProjects(); }
    catch (e) { setHealth(null); setConnectionError(e.message); }
  }
  useEffect(() => { void checkConnection(); }, []);
  useEffect(() => { document.documentElement.lang = ui; document.documentElement.dir = ui === 'ar' ? 'rtl' : 'ltr'; try { localStorage.setItem('reel-ui-language', JSON.stringify(ui)); } catch {} }, [ui]);

  async function save(value = current.current) {
    if (!value) return;
    const saving = queue.current.catch(() => {}).then(() => jsonRequest(`/api/projects/${value.id}`, snapshot(value), 'PUT'));
    queue.current = saving;
    try {
      await saving;
      if (current.current === value) { setSaveState('saved'); setSaveError(''); }
      await refreshProjects();
    } catch (e) { setSaveState('localDraft'); setSaveError(e.message); throw e; }
  }
  useEffect(() => {
    try { if (doc) localStorage.setItem(DRAFT, JSON.stringify(doc)); else localStorage.removeItem(DRAFT); }
    catch { setSaveError('Browser backup is unavailable. Keep the server connected to save your project.'); }
    if (!doc) return;
    setSaveState('saving');
    const timer = setTimeout(() => { void save(doc).catch(() => {}); }, 600);
    return () => clearTimeout(timer);
  }, [doc]);

  // Refreshing resumes the saved job ID without issuing another paid request.
  useEffect(() => {
    const active = doc?.activeJob; if (!active) return;
    let stopped = false; setWatchError(false);
    async function watch() {
      let failures = 0;
      while (!stopped) {
        try {
          const job = await request(`/api/jobs/${active.id}`); if (stopped) return;
          failures = 0; setProgress(job);
          if (job.type === 'images' && job.result?.images) setDoc(value => value?.activeJob?.id === active.id ? { ...value, images: [...job.result.images] } : value);
          if (job.status === 'completed' || job.status === 'failed') {
            if (job.status === 'failed') setError(job.error || 'The job failed.');
            setDoc(value => value?.activeJob?.id === active.id ? { ...value, activeJob: null, ...(job.status === 'completed' && job.type === 'render' ? { video: { ...job.result, jobId: job.id } } : {}) } : value);
            setProgress(null); return;
          }
        } catch (e) { if (++failures >= 5) { if (!stopped) { setError(e.message); setWatchError(true); } return; } }
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }
    void watch(); return () => { stopped = true; };
  }, [doc?.activeJob?.id, watchAttempt]);

  async function perform(name, action) {
    setStage(name); setError('');
    try { await action(); } catch (e) { setError(e.message); } finally { setStage(''); }
  }
  async function createDocument(plan, name) {
    await save(); const value = await jsonRequest('/api/projects', { project: plan, name }); setDoc(value); await refreshProjects();
  }
  function generate() { void perform(t('creatingPlan'), async () => createDocument(await jsonRequest('/api/generate', { topic, language, duration, style, aspect }))); }
  function openProject(id) { if (id) void perform(t('projects'), async () => { await save(); setDoc(await request(`/api/projects/${id}`)); setProgress(null); }); }
  function newProject() { void perform(t('newProject'), async () => { await save(); setDoc(null); setTopic(''); setProgress(null); }); }
  function deleteProject() {
    if (!window.confirm(t('deleteConfirm'))) return;
    void perform(t('deleteProject'), async () => { await save(); await request(`/api/projects/${doc.id}`, { method:'DELETE' }); setDoc(null); await refreshProjects(); });
  }
  async function importPlan(file) {
    if (!file) return;
    await perform(t('importPlan'), async () => {
      if (file.size > 100000) throw new Error('Plan files must be smaller than 100 KB.');
      const value = JSON.parse(await file.text()); await createDocument(value.project || value, value.name);
    });
  }
  function makeVoice() { void perform(t('generatingVoice'), async () => patch({ audio:await jsonRequest('/api/voice', { text:project.script, voiceId:voiceId || undefined }), video:null, captions:null })); }
  function makeImages() { void perform(t('imageJob'), async () => { const job = await jsonRequest('/api/images', { scenes:project.scenes, aspect:project.aspect }); patch({ images:[], video:null, activeJob:{ id:job.id, type:'images' } }); }); }
  function uploadImage(index,file) {
    if (!file) return;
    void perform(t('uploading'), async () => {
      if (file.size > 15*1024*1024) throw new Error('Images must be smaller than 15 MB.');
      const image = await request('/api/assets/image', { method:'POST', headers:{ 'Content-Type':file.type }, body:file });
      setDoc(value => ({ ...value, images:value.project.scenes.map((_,i) => i === index ? image : value.images[i] || null), video:null }));
    });
  }
  function uploadAudio(file) {
    if (!file) return;
    void perform(t('uploading'), async () => {
      if (file.size > 20*1024*1024) throw new Error('Audio files must be smaller than 20 MB.');
      patch({ audio:await request('/api/assets/audio', { method:'POST', headers:{ 'Content-Type':file.type || 'application/octet-stream' }, body:file }), captions:null, video:null });
    });
  }
  function uploadSrt(file) {
    if (!file) return;
    void perform(t('uploading'), async () => {
      if (file.size > 50000) throw new Error('Subtitle files must be smaller than 50 KB.');
      patch({ captions:await jsonRequest('/api/assets/captions', { srt:await file.text() }), video:null });
    });
  }
  function render() { void perform(t('rendering'), async () => {
    const job = await jsonRequest('/api/render', { project, imageIds:images.map(image => image.id), audioId:audio?.id, captionsId:captions?.id, quality:doc.quality, burnCaptions:doc.burnCaptions });
    patch({ video:null, activeJob:{ id:job.id, type:'render' } });
  }); }
  function editScript(script) { patch({ project:{ ...project,script }, audio:audio?.mode === 'upload' ? audio:null, video:null }); }
  function editScene(index,field,value) { patch({ project:{ ...project, scenes:project.scenes.map((scene,i) => i === index ? { ...scene,[field]:value } : scene) }, video:null }); }
  const steps = [[t('script'),Sparkles,!!project], [t('images'),Film,completeImages], [t('voice'),Mic,!!audio], [t('captions'),Subtitles,hasCaptions], [t('video'),Play,!!video]];
  const fileInput = (accept,action,label,Icon = Upload) => <label className={`button secondary upload ${busy ? 'disabled':''}`}><Icon size={16} />{label}<input aria-label={label} type="file" accept={accept} disabled={busy} onChange={e => { action(e.target.files?.[0]); e.target.value = ''; }} /></label>;
  const connections = <><p>{health ? t('connected'):t('offline')}</p>{health && <><p>{t(health.providers.ai ? 'aiReady':'aiDemo')}</p><p>{t(health.providers.voice ? 'voiceReady':'voiceMissing')}</p><p>{t(health.render.ffmpeg && health.render.ffprobe ? 'renderReady':'renderMissing')}</p></>}<button className="secondary" onClick={checkConnection}><RefreshCw size={15} />{t('check')}</button></>;

  return <main>
    <aside><div className="brand"><Clapperboard size={28} /><h2>REEL <span>ENGINE AI</span></h2></div><p className="version">v0.7 · {t('workspace')}</p><div className="side-note">{t('savedHelp')}</div><div className="providers"><h3>{t('connection')}</h3>{connections}</div><details className="setup"><summary>{t('settings')}</summary><p>{t('setupHelp')}</p><a href="https://github.com/abdulrahman198/Reel-engine-ai#readme" target="_blank" rel="noreferrer">README</a></details></aside>
    <section className="workspace">
      <header><div><small className="eyebrow">REEL ENGINE AI / STUDIO</small><h1>{t('heading')}</h1></div><select className="ui-language" aria-label="Interface language" value={ui} onChange={e => setUi(e.target.value)}><option value="ar">العربية</option><option value="de">Deutsch</option><option value="en">English</option></select></header>
      <div className="project-toolbar"><FolderOpen size={20} /><select aria-label={t('projects')} value={doc?.id || ''} disabled={busy} onChange={e => openProject(e.target.value)}><option value="">{t('chooseProject')}</option>{projectList.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select><button className="secondary" disabled={busy} onClick={newProject}><Plus size={17} />{t('newProject')}</button>{fileInput('.json,application/json',importPlan,t('importPlan'))}</div>
      <details className="mobile-connection"><summary>{t('connection')} · {health ? t('connected'):t('offline')}</summary>{connections}</details>
      {connectionError && <p className="error" role="alert">{connectionError}</p>}{saveError && <p className="error" role="alert">{saveError} <button className="secondary" onClick={() => { void save().catch(() => {}); }}>{t('retrySave')}</button></p>}
      {!doc && <div className="composer"><label htmlFor="topic">{t('idea')}</label><textarea id="topic" disabled={busy} value={topic} onChange={e => setTopic(e.target.value)} placeholder={t('placeholder')} maxLength={2000} dir="auto" /><div className="row">
        <label>{t('language')}<select aria-label={t('language')} disabled={busy} value={language} onChange={e => setLanguage(e.target.value)}><option value="de">Deutsch</option><option value="ar">العربية</option><option value="en">English</option></select></label>
        <label>{t('duration')}<select aria-label={t('duration')} disabled={busy} value={duration} onChange={e => setDuration(+e.target.value)}>{[30,45,60].map(n => <option key={n} value={n}>{n} {t('seconds')}</option>)}</select></label>
        <label>{t('style')}<select aria-label={t('style')} disabled={busy} value={style} onChange={e => setStyle(e.target.value)}>{['Cinematic documentary','Motion graphics','Educational','Fast social'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label>{t('format')}<select aria-label={t('format')} disabled={busy} value={aspect} onChange={e => setAspect(e.target.value)}><option value="9:16">9:16 · {t('vertical')}</option><option value="16:9">16:9 · {t('landscape')}</option></select></label><button disabled={busy || !topic.trim() || !health} onClick={generate}><Sparkles size={18} />{t(health?.providers.ai ? 'generate':'demoPlan')}</button></div></div>}
      {doc && <div className="document-heading"><label>{t('name')}<input aria-label={t('name')} value={doc.name} disabled={busy} maxLength={120} onChange={e => patch({ name:e.target.value })} /></label><span className="save-state" role="status"><Save size={15} />{t(saveState)}</span><button className="secondary" onClick={() => downloadPlan(doc)} title={t('planOnly')}><Download size={16} />{t('exportPlan')}</button><button className="icon-button secondary" aria-label={t('deleteProject')} title={t('deleteProject')} disabled={busy} onClick={deleteProject}><Trash2 size={17} /></button></div>}
      {error && <p className="error" role="alert">{error}</p>}{(stage || progress) && <div className="job" role="status"><div><span>{stage || progress?.message}</span>{progress && <b>{progress.progress}%</b>}</div><progress max="100" value={progress ? progress.progress:undefined} /></div>}{watchError && <button onClick={() => setWatchAttempt(x => x+1)}>{t('resume')}</button>}
      <div className="pipeline">{steps.map(([name,Icon,ready]) => <div className={ready ? 'ready':''} key={name}><Icon size={16} />{name}{ready && <CheckCircle2 size={14} />}</div>)}</div>
      {!project && <div className="empty"><Film size={36} /><h2>{t('empty')}</h2><p>{t('emptyText')}</p><p className="muted">{t('demoHelp')}</p></div>}
      {project && <div className="grid"><article><div className="card-heading"><h2>01 / {t('script')}</h2><span className="tag">{t(project.mode === 'ai' ? 'aiDraft':project.mode === 'demo' ? 'demoDraft':'manualDraft')}</span></div>{project.mode === 'demo' && <p className="notice">{t('demoHelp')}</p>}
        <textarea aria-label={t('scriptLabel')} className="script" disabled={busy} dir={project.language === 'ar' ? 'rtl':'ltr'} value={project.script} maxLength={8000} onChange={e => editScript(e.target.value)} />
        {health?.providers.voice && <div className="row voice-picker"><label>{t('voiceId')}<input aria-label={t('voiceId')} dir="ltr" value={voiceId} placeholder={health.providers.defaultVoice || t('voiceDefault')} onChange={e => setVoiceId(e.target.value)} disabled={busy} list="voices" /><datalist id="voices">{voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</datalist></label><button className="secondary" disabled={busy} onClick={() => { void perform(t('loadVoices'),async () => setVoices((await request('/api/voices')).voices)); }}>{t('loadVoices')}</button></div>}
        <div className="row"><button onClick={makeVoice} disabled={busy || !health?.providers.voice || !(voiceId || health?.providers.defaultVoice) || !project.script.trim()}><Mic size={17} />{t('generateVoice')}</button>{fileInput('audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm',uploadAudio,t('uploadAudio'))}</div><p className="muted">{t('voiceHelp')} {t('audioFormats')}</p>
        {audio && <><audio aria-label={t('narration')} controls src={url(audio.url)} /><div className="row"><a className="button secondary" href={url(`${audio.url}?download=1`)}><Download size={16} />{t('downloadAudio')}</a><button className="text-button" disabled={busy} onClick={() => patch({ audio:null,video:null })}>{t('removeAudio')}</button></div></>}
        <div className="card-heading scenes-heading"><h2>02 / {t('scenes')}</h2><button className="secondary" disabled={busy || project.scenes.some(s => !s.visualPrompt.trim())} onClick={makeImages}><ImagePlus size={17} />{t(health?.providers.images ? 'makeImages':'demoImages')}</button></div><p className="muted">{project.aspect} · {t('imageHelp')}</p>
        {project.scenes.map((scene,i) => <div className="scene" key={i}><div className="scene-head"><b>{String(i+1).padStart(2,'0')}</b><input aria-label={`${t('sceneTitle')} ${i+1}`} value={scene.title} disabled={busy} maxLength={160} onChange={e => editScene(i,'title',e.target.value)} /><small dir="ltr">{scene.start}s–{scene.end}s</small></div><div className="scene-body">
          {images[i] && <div className={`image-preview ${project.aspect === '16:9' ? 'landscape':''}`}><img src={url(images[i].url)} alt={scene.title} /><span>{t(images[i].mode === 'demo' ? 'demoCard':images[i].mode === 'upload' ? 'yourImage':'aiImage')}</span></div>}
          <div className="scene-fields"><label>{t('prompt')}<textarea className="prompt" aria-label={`${t('prompt')} ${i+1}`} disabled={busy} value={scene.visualPrompt} maxLength={4000} dir="auto" onChange={e => editScene(i,'visualPrompt',e.target.value)} /></label><label>{t('screenText')}<input aria-label={`${t('screenText')} ${i+1}`} dir="auto" disabled={busy} value={scene.onScreenText} maxLength={160} onChange={e => editScene(i,'onScreenText',e.target.value)} /></label>{fileInput('image/png,image/jpeg,image/webp',file => uploadImage(i,file),t('uploadImage'))}</div></div></div>)}
      </article><article className="export-panel"><h2>03 / {t('export')}</h2><p className="muted">{project.aspect} · {project.duration} {t('seconds')} · 30 fps</p><div className="status-list"><p>{completeImages ? '✓':'○'} {t('images')}</p><p>{audio ? '✓':'○'} {t('narration')} {!audio && `(${t('optional')})`}</p><p>{hasCaptions ? '✓':'○'} {t('captions')}</p></div>
        <label>{t('quality')}<select aria-label={t('quality')} disabled={busy} value={doc.quality} onChange={e => patch({ quality:e.target.value,video:null })}><option value="720p">{t('preview')}</option><option value="1080p">{t('fullHD')}</option></select></label><div className="subtitle-tools">{fileInput('.srt,application/x-subrip,text/plain',uploadSrt,t('importSrt'),Subtitles)}{hasCaptions && <a className="button secondary" href={url(captions ? `${captions.url}?download=1`:audio.captionsUrl)}><Download size={16} />{t('downloadSrt')}</a>}</div><p className="muted">{t('srtHelp')}</p>{captions && <button className="text-button" disabled={busy} onClick={() => patch({ captions:null,video:null })}>{t('removeSrt')}</button>}
        <label className="check"><input type="checkbox" disabled={busy || !hasCaptions || !health?.render.subtitles} checked={doc.burnCaptions} onChange={e => patch({ burnCaptions:e.target.checked,video:null })} />{t('burn')}</label>{!audio && <p className="notice">{t('noAudio')}</p>}{images.some(image => image?.mode === 'demo') && <p className="notice">{t('demoNotice')}</p>}
        <button className="render-button" disabled={busy || !completeImages || !health?.render.ffmpeg || !health?.render.ffprobe || !project.script.trim() || project.scenes.some(s => !s.visualPrompt.trim())} onClick={render}><Play size={18} />{t('render')}</button>{!completeImages && <p className="muted">{t('needImages')}</p>}
        {video && <div className="output"><video controls playsInline preload="metadata" poster={images[0] ? url(images[0].url):undefined} src={url(video.url)} style={{ aspectRatio:project.aspect === '16:9' ? '16 / 9':'9 / 16' }} /><p dir="ltr">{video.width} × {video.height} · {video.duration.toFixed(1)} sec</p><a className="button" href={url(`${video.url}?download=1`)}><Download size={17} />{t('downloadVideo')}</a>{video.warning && <p className="notice">{video.warning}</p>}</div>}
      </article></div>}
    </section>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
