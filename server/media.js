import { spawn } from 'node:child_process';
import { copyFile, writeFile, rm, mkdtemp, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { HttpError } from './core.js';

export function run(binary, args, { cwd, timeout = 180000, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, shell: false, windowsHide: true });
    let output = '', errors = '', expired = false;
    const timer = setTimeout(() => { expired = true; child.kill('SIGKILL'); }, timeout);
    child.stdout.on('data', data => { output = (output + data).slice(-1000000); onProgress?.(String(data)); });
    child.stderr.on('data', data => { errors = (errors + data).slice(-12000); });
    child.once('error', error => { clearTimeout(timer); reject(new Error(`${binary}: ${error.code || 'could not start'}. Install FFmpeg/FFprobe or set their paths in .env.`)); });
    child.once('close', code => { clearTimeout(timer);
      if (expired) reject(new Error('Media processing timed out.'));
      else if (code !== 0) reject(new Error(`Media processing failed: ${errors.slice(-1200)}`)); else resolve(output);
    });
  });
}

export async function probe(file, config) {
  return JSON.parse(await run(config.ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { timeout: 15000 }));
}

export async function capabilities(config) {
  const [ffmpeg, ffprobe] = await Promise.allSettled([run(config.ffmpeg, ['-hide_banner', '-filters'], { timeout: 10000 }), run(config.ffprobe, ['-version'], { timeout: 10000 })]);
  return { ffmpeg: ffmpeg.status === 'fulfilled', ffprobe: ffprobe.status === 'fulfilled', subtitles: ffmpeg.status === 'fulfilled' && /\bsubtitles\b/.test(ffmpeg.value) };
}

export async function importAudio(bytes, config) {
  const root = path.join(config.dataDir, 'tmp'); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(path.join(root, 'audio-'));
  try {
    const source = path.join(dir, 'source'); await writeFile(source, bytes);
    // Only local bytes are accepted; playlists cannot open URLs or other files.
    await run(config.ffmpeg, ['-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mp3,wav,mov,ogg,flac,aac,matroska,webm', '-i', 'source', '-map', '0:a:0', '-vn', '-t', '181', '-c:a', 'libmp3lame', '-b:a', '192k', 'audio.mp3'], { cwd: dir, timeout: 60000 });
    const file = path.join(dir, 'audio.mp3'), info = await probe(file, config), duration = Number(info.format.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 180) throw new HttpError(400, 'invalid_audio_duration', 'Audio must be between 0 and 180 seconds.');
    return { bytes: await readFile(file), duration };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'invalid_audio', 'Upload a valid MP3, WAV, M4A, OGG, FLAC or WebM audio file, up to 20 MB and 180 seconds.');
  } finally { await rm(dir, { recursive: true, force: true }); }
}

const escape = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
export async function demoImage(scene, index, format) {
  const [width, height] = format === '16:9' ? [1280, 720] : [720, 1280];
  const color = ['#7162ff', '#25c2b4', '#cf925d', '#d46bb1', '#5286df', '#62a679'][index % 6];
  const art = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#171e32"/><stop offset="1" stop-color="#090c15"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width * .85}" cy="${height * .22}" r="${width * .6}" fill="${color}" opacity=".2"/><path d="M0 ${height * .55} L${width} ${height * .32} L${width} ${height} L0 ${height}" fill="${color}" opacity=".08"/><rect x="56" y="${height * .58}" width="72" height="7" rx="3" fill="${color}"/></svg>`);
  const title = await sharp({ text: { text: `<span foreground="#ffffff">${escape(scene.title)}</span>`, font: 'DejaVu Sans Bold 48', width: width - 112, height: Math.round(height * .18), rgba: true, wrap: 'word' } }).png().toBuffer();
  const label = await sharp({ text: { text: `<span foreground="#cbd1df">DEMO · SCENE ${index + 1}\nPlaceholder image</span>`, font: 'DejaVu Sans 21', width: width - 112, rgba: true } }).png().toBuffer();
  return sharp(art).composite([{ input: title, top: Math.round(height * .63), left: 56 }, { input: label, top: Math.round(height * .87), left: 56 }]).png().toBuffer();
}

async function sceneImage(file, screenText, width, height) {
  const base = sharp(file).resize(width, height, { fit: 'cover' });
  if (!screenText.trim()) return base.png().toBuffer();
  const margin = Math.round(width * .09), boxWidth = width - margin * 2;
  const caption = await sharp({ text: { text: `<span foreground="#ffffff">${escape(screenText)}</span>`,
    font: 'DejaVu Sans Bold 44', width: boxWidth - 36, height: Math.round(height * .13), align: 'centre', rgba: true, wrap: 'word' } }).png().toBuffer();
  const { height: captionHeight } = await sharp(caption).metadata();
  const top = Math.round(height * .12);
  const background = await sharp({ create: { width: boxWidth, height: captionHeight + 28, channels: 4, background: '#080b18ba' } }).png().toBuffer();
  return base.composite([{ input: background, left: margin, top }, { input: caption, left: margin + 18, top: top + 14 }]).png().toBuffer();
}

export async function renderVideo({ project, images, audio, captions, burnCaptions, quality, job, update, assets, jobs, config }) {
  const dir = jobs.dir(job.id), fps = 30, portrait = project.aspect === '9:16';
  const long = quality === '1080p' ? 1920 : 1280, short = quality === '1080p' ? 1080 : 720;
  const [width, height] = portrait ? [short, long] : [long, short];
  let duration = project.duration;
  if (audio) {
    const info = await probe(assets.file(audio), config), actual = Number(info.format.duration);
    if (!Number.isFinite(actual) || actual <= 0 || actual > 180) throw new HttpError(400, 'invalid_audio_duration');
    duration = Math.max(duration, actual + 0.15);
    await copyFile(assets.file(audio), path.join(dir, 'voice.mp3'));
    if (audio.hasCaptions) await copyFile(path.join(assets.dir(audio.id), 'captions.srt'), path.join(dir, 'captions.srt'));
  }
  if (captions) {
    await copyFile(assets.file(captions), path.join(dir, 'captions.srt'));
    duration = Math.max(duration, captions.duration);
  }
  const hasCaptions = !!(captions || audio?.hasCaptions);
  const totalFrames = Math.ceil(duration * fps); duration = totalFrames / fps;
  const tempFiles = [];
  try {
    for (let i = 0; i < images.length; i++) {
      await update(5 + i / images.length * 70, `Rendering scene ${i + 1}/${images.length}`);
      const source = `source-${i}.png`, clip = `scene-${i}.mp4`;
      await writeFile(path.join(dir, source), await sceneImage(assets.file(images[i]), project.scenes[i].onScreenText, width, height)); tempFiles.push(source, clip);
      const frames = Math.round((i + 1) * totalFrames / images.length) - Math.round(i * totalFrames / images.length);
      const vf = `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},zoompan=z='1+0.06*on/${frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${frames}:s=${width}x${height}:fps=${fps},setsar=1,format=yuv420p`;
      await run(config.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-filter_threads', '1', '-i', source, '-vf', vf, '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-threads', '2', clip], { cwd: dir });
    }
    await update(80, 'Combining scenes, narration and subtitles');
    await writeFile(path.join(dir, 'clips.txt'), images.map((_, i) => `file 'scene-${i}.mp4'`).join('\n')); tempFiles.push('clips.txt');
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-filter_threads', '1', '-f', 'concat', '-safe', '1', '-i', 'clips.txt'];
    if (audio) args.push('-i', 'voice.mp3'); else args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    args.push('-map', '0:v:0', '-map', '1:a:0');
    if (burnCaptions && hasCaptions) {
      const font = (config.font || 'DejaVu Sans').replace(/[^a-zA-Z0-9 _-]/g, '');
      args.push('-vf', `subtitles=filename=captions.srt:force_style='FontName=${font},FontSize=${portrait ? 17 : 22},Outline=2,Shadow=0,MarginV=${portrait ? 28 : 18},Alignment=2'`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-threads', '2');
    } else args.push('-c:v', 'copy');
    args.push('-af', 'apad', '-c:a', 'aac', '-b:a', '192k', '-t', String(duration), '-movflags', '+faststart', 'video.mp4');
    await run(config.ffmpeg, args, { cwd: dir });
    const info = await probe(path.join(dir, 'video.mp4'), config), video = info.streams.find(s => s.codec_type === 'video');
    if (!video || video.width !== width || video.height !== height || Math.abs(Number(info.format.duration) - duration) > .2) throw new Error('Output video verification failed.');
    return { url: `/api/jobs/${job.id}/video`, width, height, fps, duration, hasVoice: !!audio,
      captionsBurned: !!(burnCaptions && hasCaptions), hasDemoImages: images.some(x => x.mode === 'demo'),
      warning: duration > project.duration + .2 ? 'The video was extended to preserve the full narration or subtitles.' : undefined };
  } finally { await Promise.all(tempFiles.map(file => rm(path.join(dir, file), { force: true }))); }
}
