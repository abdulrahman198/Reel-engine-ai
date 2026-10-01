import express from 'express';
import OpenAI from 'openai';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { HttpError, options, scenes, aspect, text, normalizePlan, draftPlan, demoPlan, planSchema, captionsFromAlignment, toSrt, parseSrt } from './core.js';
import { AssetStore, Jobs, ProjectStore, jsonFile } from './storage.js';
import { capabilities, demoImage, probe, renderVideo, importAudio } from './media.js';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function createApp({ env = process.env, openaiClient, fetchImpl = globalThis.fetch } = {}) {
  const config = {
    ffmpeg: env.FFMPEG_BIN || 'ffmpeg', ffprobe: env.FFPROBE_BIN || 'ffprobe', font: env.FONT_NAME || 'DejaVu Sans',
    dataDir: path.resolve(env.DATA_DIR || path.join(root, 'data')),
  };
  const client = openaiClient ?? (env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 240000, maxRetries: 0 }) : null);
  const safeMessage = error => {
    let message = String(error?.message || 'The request failed.');
    for (const key of [env.OPENAI_API_KEY, env.ELEVENLABS_API_KEY]) if (key) message = message.split(key).join('[redacted]');
    return message.slice(0, 1200);
  };
  const assets = new AssetStore(config.dataDir), jobs = new Jobs(config.dataDir, safeMessage);
  const projects = new ProjectStore(config.dataDir);
  await jobs.init();
  const mediaCapabilities = await capabilities(config);
  const app = express(); app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    try { if (env.FRONTEND_ORIGIN) hosts.add(new URL(env.FRONTEND_ORIGIN).hostname); } catch { /* Invalid configuration is not an allowed host. */ }
    if (!hosts.has(req.hostname)) return next(new HttpError(403, 'host_not_allowed', 'Use localhost, or configure FRONTEND_ORIGIN for your private host.'));
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    const origin = req.get('Origin');
    if (origin) {
      let allowed = origin === env.FRONTEND_ORIGIN;
      try { const u = new URL(origin); allowed ||= ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname); } catch { /* Reject malformed origins. */ }
      if (!allowed) return next(new HttpError(403, 'origin_not_allowed'));
      res.set('Access-Control-Allow-Origin', origin); res.vary('Origin');
      res.set('Access-Control-Allow-Headers', 'Content-Type'); res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (_, res) => res.json({ ok: true, version: '0.7.0',
    providers: { ai: !!client, images: !!client, voice: !!env.ELEVENLABS_API_KEY, defaultVoice: env.ELEVENLABS_VOICE_ID || '' },
    render: mediaCapabilities,
  }));

  app.get('/api/voices', async (_req, res) => {
    if (!env.ELEVENLABS_API_KEY) return res.json({ voices: [] });
    const response = await fetchImpl('https://api.elevenlabs.io/v2/voices?page_size=100', {
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new HttpError(502, 'voice_list_failed', 'Could not load ElevenLabs voices. You can use the voice ID in your settings.');
    const data = await response.json();
    res.json({ voices: (data.voices || []).filter(v => typeof v.voice_id === 'string').map(v => ({ id: v.voice_id, name: v.name || v.voice_id, language: v.labels?.language || '' })), hasMore: !!data.has_more });
  });

  async function snapshot(body) {
    const project = draftPlan(body?.project);
    const ids = body.imageIds ?? [];
    if (!Array.isArray(ids) || ids.length > project.scenes.length) throw new HttpError(400, 'invalid_image_ids');
    const images = await Promise.all(project.scenes.map((_, i) => ids[i] == null ? null : assets.get(ids[i], 'image')));
    const audio = body.audioId ? await assets.get(body.audioId, 'audio') : null;
    const captions = body.captionsId ? await assets.get(body.captionsId, 'captions') : null;
    let video = null, activeJob = null;
    if (body.videoJobId) {
      const job = jobs.get(body.videoJobId);
      if (job.type !== 'render' || job.status !== 'completed') throw new HttpError(400, 'invalid_video_job');
      video = { ...job.result, jobId: job.id };
    }
    if (body.activeJobId) { const job = jobs.get(body.activeJobId); activeJob = { id: job.id, type: job.type }; }
    const quality = body.quality || '720p';
    if (!['720p', '1080p'].includes(quality)) throw new HttpError(400, 'invalid_quality');
    return { name: text(body.name || project.topic.slice(0, 100), 'project_name', 120), project, images, audio, captions, video, activeJob, quality, burnCaptions: body.burnCaptions !== false };
  }
  app.get('/api/projects', async (_req, res) => res.json({ projects: await projects.list() }));
  app.get('/api/projects/:id', async (req, res) => res.json(await projects.get(req.params.id)));
  app.post('/api/projects', async (req, res) => res.status(201).json(await projects.save(await snapshot(req.body), undefined, true)));
  app.put('/api/projects/:id', async (req, res) => res.json(await projects.save(await snapshot(req.body), req.params.id)));
  app.delete('/api/projects/:id', async (req, res) => { await projects.remove(req.params.id); res.json({ ok: true }); });

  app.post('/api/generate', async (req, res) => {
    const input = options(req.body);
    if (!client) return res.json({ ...demoPlan(input), mode: 'demo', warning: 'Demo script. Configure OPENAI_API_KEY for an AI production plan.' });
    const count = input.duration === 60 ? 6 : input.duration === 45 ? 5 : 4;
    const language = { ar: 'Arabic', de: 'German', en: 'English' }[input.language];
    const response = await client.responses.create({
      model: env.OPENAI_MODEL || 'gpt-5.6-luna',
      instructions: `Create a ${input.duration}-second ${input.aspect} short-video production plan in ${language}. Use exactly ${count} scenes. The script must be the scene voiceover lines joined in order, around ${Math.round(input.duration * 2.1)} spoken words. Write specific, varied visual prompts in English, with consistent characters and environment when appropriate. Style: ${input.style}. On-screen text should be brief and in ${language}. Do not invent historical facts, numbers, quotes or dates.`,
      input: input.topic,
      text: { format: { type: 'json_schema', name: 'reel_plan', strict: true, schema: planSchema } },
    });
    try {
      if (response.status === 'incomplete' || !response.output_text) throw new Error('Empty or incomplete model response.');
      const plan = normalizePlan(JSON.parse(response.output_text), input);
      if (plan.scenes.length !== count) throw new Error('Unexpected scene count.');
      res.json({ ...plan, mode: 'ai' });
    } catch (e) { throw new HttpError(502, 'invalid_model_payload', `The AI returned an invalid plan: ${safeMessage(e)}`); }
  });

  app.post('/api/voice', async (req, res) => {
    const script = text(req.body?.text, 'text', 8000);
    const voiceId = req.body.voiceId || env.ELEVENLABS_VOICE_ID;
    if (!env.ELEVENLABS_API_KEY) throw new HttpError(400, 'elevenlabs_not_configured', 'Add ELEVENLABS_API_KEY to the server .env file.');
    if (typeof voiceId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(voiceId)) throw new HttpError(400, 'voice_id_required');
    if (!mediaCapabilities.ffprobe) throw new HttpError(503, 'ffprobe_missing', 'Install FFprobe and restart the server before generating narration.');
    const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: script, model_id: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2' }),
      signal: AbortSignal.timeout(120000),
    });
    let data;
    try { data = await response.json(); } catch { throw new HttpError(502, 'invalid_voice_payload', 'ElevenLabs returned an unreadable response. Please retry.'); }
    if (!response.ok) throw new HttpError(502, 'voice_generation_failed', typeof data.detail === 'string' ? data.detail : data.detail?.message || 'ElevenLabs rejected the request.');
    if (typeof data.audio_base64 !== 'string' || !data.audio_base64) throw new HttpError(502, 'invalid_voice_payload');
    const bytes = Buffer.from(data.audio_base64, 'base64');
    if (bytes.length > 20 * 1024 * 1024) throw new HttpError(502, 'voice_too_large');
    const normalized = captionsFromAlignment(data.normalized_alignment);
    const cues = normalized.length ? normalized : captionsFromAlignment(data.alignment);
    const asset = await assets.create('audio', bytes, { mode: 'elevenlabs', sourceText: script, hasCaptions: cues.length > 0 });
    const info = await probe(assets.file(asset), config);
    asset.duration = Number(info.format.duration);
    if (!Number.isFinite(asset.duration) || asset.duration <= 0 || asset.duration > 180) throw new HttpError(502, 'invalid_voice_duration');
    if (cues.length) {
      await writeFile(path.join(assets.dir(asset.id), 'captions.srt'), toSrt(cues));
      asset.captionsUrl = `/api/assets/${asset.id}/captions`;
    }
    await jsonFile(path.join(assets.dir(asset.id), 'meta.json'), asset);
    res.json({ ...asset, warning: cues.length ? undefined : 'ElevenLabs returned no usable timing. Audio is ready; captions are unavailable.' });
  });

  app.post('/api/images', async (req, res) => {
    const items = scenes(req.body?.scenes), format = aspect(req.body?.aspect);
    const demo = !client || req.body.demo === true;
    const job = await jobs.create('images', async (job, update) => {
      const images = []; job.result = { images, mode: demo ? 'demo' : 'ai' };
      for (let i = 0; i < items.length; i++) {
        await update(i / items.length * 100, `${demo ? 'Creating demo card' : 'Generating image'} ${i + 1}/${items.length}`);
        let bytes;
        if (demo) bytes = await demoImage(items[i], i, format);
        else {
          const result = await client.images.generate({ model: env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
            prompt: `${items[i].visualPrompt}\nCompose for a ${format} video. No embedded text, logos or watermarks.`,
            n: 1, size: format === '9:16' ? '1024x1536' : '1536x1024',
            quality: ['low', 'medium', 'high'].includes(env.IMAGE_QUALITY) ? env.IMAGE_QUALITY : 'low', output_format: 'png',
          });
          if (!result.data?.[0]?.b64_json) throw new HttpError(502, 'invalid_image_payload');
          bytes = Buffer.from(result.data[0].b64_json, 'base64');
        }
        const png = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().png().toBuffer();
        const image = await assets.create('image', png, { mode: demo ? 'demo' : 'ai', sceneIndex: i });
        images.push(image); await update((i + 1) / items.length * 100, `Image ${i + 1}/${items.length} ready`);
      }
      return { images, mode: demo ? 'demo' : 'ai', warning: demo ? 'Demo cards, not AI-generated scene images.' : undefined };
    });
    res.status(202).json(job);
  });

  app.post('/api/assets/image', express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '15mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'image_required');
    let png;
    try { png = await sharp(req.body, { limitInputPixels: 40000000 }).rotate().png().toBuffer(); }
    catch { throw new HttpError(400, 'invalid_image', 'Upload a PNG, JPEG or WebP image up to 15 MB.'); }
    res.status(201).json(await assets.create('image', png, { mode: 'upload' }));
  });

  app.post('/api/assets/audio', express.raw({ type: ['audio/*', 'video/webm', 'video/mp4', 'application/octet-stream'], limit: '20mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'audio_required');
    if (!mediaCapabilities.ffmpeg || !mediaCapabilities.ffprobe) throw new HttpError(503, 'ffmpeg_missing', 'Install FFmpeg and FFprobe to import audio.');
    const audio = await importAudio(req.body, config);
    res.status(201).json(await assets.create('audio', audio.bytes, { mode: 'upload', duration: audio.duration, hasCaptions: false }));
  });

  app.post('/api/assets/captions', async (req, res) => {
    const cues = parseSrt(req.body?.srt);
    res.status(201).json(await assets.create('captions', Buffer.from(toSrt(cues)), { mode: 'upload', count: cues.length, duration: cues.at(-1).end }));
  });

  app.post('/api/render', async (req, res) => {
    const input = options(req.body?.project), project = normalizePlan(req.body.project, input);
    if (!mediaCapabilities.ffmpeg || !mediaCapabilities.ffprobe) throw new HttpError(503, 'ffmpeg_missing', 'Install FFmpeg and FFprobe, then restart the server.');
    const ids = req.body.imageIds;
    if (!Array.isArray(ids) || ids.length !== project.scenes.length) throw new HttpError(400, 'scene_images_required', 'Every scene needs one image.');
    const images = await Promise.all(ids.map(id => assets.get(id, 'image')));
    const audio = req.body.audioId ? await assets.get(req.body.audioId, 'audio') : null;
    const captions = req.body.captionsId ? await assets.get(req.body.captionsId, 'captions') : null;
    if (audio?.sourceText && audio.sourceText !== project.script.trim()) throw new HttpError(409, 'stale_voice', 'The script changed. Generate the narration again.');
    const burnCaptions = req.body.burnCaptions !== false;
    if (burnCaptions && (audio?.hasCaptions || captions) && !mediaCapabilities.subtitles) throw new HttpError(503, 'subtitles_unavailable', 'This FFmpeg build needs libass for burned-in subtitles.');
    const quality = req.body.quality || '720p';
    if (!['720p', '1080p'].includes(quality)) throw new HttpError(400, 'invalid_quality');
    const job = await jobs.create('render', (job, update) => renderVideo({ project, images, audio, captions, burnCaptions, quality, job, update, assets, jobs, config }));
    res.status(202).json(job);
  });

  app.get('/api/jobs/:id', (req, res) => res.json(jobs.get(req.params.id)));
  app.get('/api/jobs/:id/video', (req, res) => {
    const job = jobs.get(req.params.id);
    if (job.type !== 'render' || job.status !== 'completed') throw new HttpError(409, 'video_not_ready');
    const file = path.join(jobs.dir(job.id), 'video.mp4');
    if (req.query.download === '1') res.download(file, 'reel-engine-video.mp4'); else res.sendFile(file);
  });
  app.get('/api/assets/:id/file', async (req, res) => {
    const asset = await assets.get(req.params.id);
    if (req.query.download === '1') res.download(assets.file(asset), asset.file); else res.sendFile(assets.file(asset));
  });
  app.get('/api/assets/:id/captions', async (req, res) => {
    const asset = await assets.get(req.params.id, 'audio');
    if (!asset.hasCaptions) throw new HttpError(404, 'captions_not_available');
    res.download(path.join(assets.dir(asset.id), 'captions.srt'), 'captions.srt');
  });

  app.use('/api', (_, res) => res.status(404).json({ error: 'endpoint_not_found' }));
  const dist = path.join(root, 'dist');
  if (existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get(/.*/, (_, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 502;
    res.status(status).json({ error: error.code || (status === 400 ? 'invalid_request' : 'request_failed'), detail: safeMessage(error) });
  });
  return { app, assets, jobs, projects, config };
}
