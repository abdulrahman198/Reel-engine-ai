import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createApp } from '../server/app.js';
import { Jobs } from '../server/storage.js';
import { ProjectStore } from '../server/storage.js';
import { run } from '../server/media.js';
import { readFile } from 'node:fs/promises';
import { get as httpGet } from 'node:http';

async function setup(t, settings = {}) {
  const data = await mkdtemp(path.join(os.tmpdir(), 'reel-api-'));
  const instance = await createApp({ ...settings, env: { DATA_DIR: data, ...settings.env } });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(data, { recursive: true, force: true }); });
  const post = (route, value) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const job = async id => {
    for (let i = 0; i < 200; i++) {
      const j = await (await fetch(`${base}/api/jobs/${id}`)).json();
      if (['failed', 'completed'].includes(j.status)) return j;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Job did not finish');
  };
  return { ...instance, base, post, job, data };
}

test('demo planning, bad requests, unknown API routes and origin checks', async t => {
  const { base, post } = await setup(t);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.version, '0.7.0'); assert.equal(health.providers.ai, false); assert.equal(health.providers.voice, false);
  const response = await post('/api/generate', { topic: 'فكرة', language: 'ar', duration: 60, aspect: '16:9' });
  assert.equal(response.status, 200); const plan = await response.json();
  assert.equal(plan.mode, 'demo'); assert.equal(plan.scenes.length, 6); assert.equal(plan.aspect, '16:9');
  for (const body of [null, [], { topic: 5 }, { topic: 'x', duration: -30 }]) assert.equal((await post('/api/generate', body)).status, 400);
  assert.equal((await post('/api/voice', { text: 'Hello' })).status, 400);
  assert.equal((await fetch(`${base}/api/not-a-route`)).status, 404);
  assert.equal((await fetch(`${base}/api/health`, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
});

test('image uploads are decoded, stored and retrievable; invalid images and IDs fail', async t => {
  const { base } = await setup(t);
  const png = await sharp({ create: { width: 80, height: 100, channels: 3, background: '#ff0033' } }).png().toBuffer();
  const response = await fetch(`${base}/api/assets/image`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
  assert.equal(response.status, 201); const asset = await response.json();
  const downloaded = Buffer.from(await (await fetch(`${base}${asset.url}`)).arrayBuffer());
  const metadata = await sharp(downloaded).metadata(); assert.equal(metadata.width, 80); assert.equal(metadata.format, 'png');
  assert.equal((await fetch(`${base}/api/assets/image`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: 'not an image' })).status, 400);
  assert.equal((await fetch(`${base}/api/assets/not-a-uuid/file`)).status, 400);
  assert.equal((await fetch(`${base}/api/assets/${randomUUID()}/file`)).status, 404);
});

test('image provider errors preserve completed assets and redact API keys', async t => {
  const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#135689' } }).png().toBuffer();
  let calls = 0;
  const openaiClient = { images: { generate: async input => {
    assert.equal(input.size, '1536x1024'); assert.equal(input.output_format, 'png');
    if (++calls === 2) throw new Error('Provider denied test-key-secret');
    return { data: [{ b64_json: png.toString('base64') }] };
  } } };
  const { post, job } = await setup(t, { openaiClient, env: { OPENAI_API_KEY: 'test-key-secret' } });
  const response = await post('/api/images', { aspect: '16:9', scenes: [{ title: 'One', visualPrompt: 'One' }, { title: 'Two', visualPrompt: 'Two' }] });
  assert.equal(response.status, 202); const result = await job((await response.json()).id);
  assert.equal(result.status, 'failed'); assert.equal(result.result.images.length, 1);
  assert.equal(result.result.images[0].mode, 'ai'); assert.ok(result.error.includes('[redacted]')); assert.ok(!result.error.includes('test-key-secret'));
});

test('structured AI plans are validated before reaching the dashboard', async t => {
  let responseText = JSON.stringify({ script: 'A short script', scenes: Array.from({ length: 4 }, (_, i) => ({ title: `Scene ${i}`, voiceover: 'A line', visualPrompt: 'A scene', onScreenText: '' })) });
  const { post } = await setup(t, { openaiClient: { responses: { create: async input => {
    assert.equal(input.text.format.type, 'json_schema'); assert.equal(input.text.format.strict, true);
    return { output_text: responseText };
  } } } });
  const response = await post('/api/generate', { topic: 'Hamburg', duration: 30 });
  assert.equal(response.status, 200); const plan = await response.json(); assert.equal(plan.mode, 'ai'); assert.equal(plan.scenes.at(-1).end, 30);
  responseText = '{broken'; assert.equal((await post('/api/generate', { topic: 'Hamburg' })).status, 502);
});

test('missing FFmpeg gives an actionable export error', async t => {
  const { post } = await setup(t, { env: { FFMPEG_BIN: 'reel-definitely-missing-ffmpeg' } });
  const plan = await (await post('/api/generate', { topic: 'x' })).json();
  const response = await post('/api/render', { project: plan, imageIds: [] }); assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'ffmpeg_missing');
});

test('jobs interrupted by a restart become failed instead of polling forever', async t => {
  const data = await mkdtemp(path.join(os.tmpdir(), 'reel-restart-')), id = randomUUID();
  t.after(() => rm(data, { recursive: true, force: true }));
  await mkdir(path.join(data, 'jobs', id), { recursive: true });
  await writeFile(path.join(data, 'jobs', id, 'job.json'), JSON.stringify({ id, status: 'running', type: 'render' }));
  const jobs = new Jobs(data, e => e.message); await jobs.init();
  assert.equal(jobs.get(id).status, 'failed'); assert.match(jobs.get(id).error, /restarted/);
});

test('missing FFprobe is reported before a paid voice request is attempted', async t => {
  let called = false;
  const { post } = await setup(t, { env: { FFPROBE_BIN: 'reel-definitely-missing-ffprobe', ELEVENLABS_API_KEY: 'test-key', ELEVENLABS_VOICE_ID: 'testVoice' },
    fetchImpl: async () => { called = true; throw new Error('Should not call the provider'); } });
  const response = await post('/api/voice', { text: 'Hello Hamburg' });
  assert.equal(response.status, 503); assert.equal((await response.json()).error, 'ffprobe_missing'); assert.equal(called, false);
});

test('projects persist incomplete drafts, media references and edits across restarts', async t => {
  const { base, post, data } = await setup(t);
  const project = await (await post('/api/generate', { topic:'Saved project', language:'ar' })).json();
  const created = await post('/api/projects', { project, name:'My reel' }); assert.equal(created.status, 201);
  const doc = await created.json(); assert.equal(doc.images.length, 4); assert.equal(doc.images[0], null);
  doc.project.script = ''; doc.project.scenes[0].visualPrompt = '';
  const updated = await fetch(`${base}/api/projects/${doc.id}`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ project:doc.project, name:'Edited reel' }) });
  assert.equal(updated.status, 200);
  const restored = await new ProjectStore(data).get(doc.id); assert.equal(restored.name,'Edited reel'); assert.equal(restored.project.script,'');
  assert.equal((await (await fetch(`${base}/api/projects`)).json()).projects.length,1);
  assert.equal((await post('/api/projects', { project, imageIds:[randomUUID()] })).status,404);
  assert.equal((await fetch(`${base}/api/projects/${doc.id}`,{ method:'DELETE' })).status,200);
  assert.equal((await fetch(`${base}/api/projects/${doc.id}`)).status,404);
});

test('audio upload normalizes real audio and SRT works without provider keys', async t => {
  const { base, post, data } = await setup(t);
  const file = path.join(data,'source.wav');
  await run('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=200:duration=0.5',file]);
  const response = await fetch(`${base}/api/assets/audio`, { method:'POST',headers:{'Content-Type':'audio/wav'},body:await readFile(file) });
  assert.equal(response.status,201); const audio = await response.json(); assert.equal(audio.mode,'upload'); assert.ok(audio.duration > .4);
  assert.equal((await fetch(`${base}${audio.url}`)).status,200);
  assert.equal((await fetch(`${base}/api/assets/audio`,{method:'POST',headers:{'Content-Type':'audio/wav'},body:'not audio'})).status,400);
  const imported = await post('/api/assets/captions',{srt:'1\n00:00:00,000 --> 00:00:02,000\nمرحبًا Hamburg'});
  assert.equal(imported.status,201); const captions = await imported.json();
  assert.equal(captions.kind,'captions'); assert.equal(captions.duration,2);
  assert.match(await (await fetch(`${base}${captions.url}`)).text(),/مرحبًا/);
});

test('host checks block rebinding and voice choices do not leak credentials', async t => {
  const { base } = await setup(t, { env:{ELEVENLABS_API_KEY:'private-test-value'}, fetchImpl:async (url, init) => {
    assert.ok(url.startsWith('https://api.elevenlabs.io/v2/voices')); assert.equal(init.headers['xi-api-key'],'private-test-value');
    return Response.json({voices:[{voice_id:'voice1',name:'Voice one',labels:{language:'de'},secret:'should not return'}]});
  } });
  // Native fetch owns the Host header. Use the HTTP client to exercise the
  // actual request header received by Express.
  const status = await new Promise((resolve,reject) => httpGet(`${base}/api/health`,{headers:{Host:'rebind.invalid'}},res => { res.resume(); resolve(res.statusCode); }).on('error',reject));
  assert.equal(status,403);
  const response = await fetch(`${base}/api/voices`); const value = await response.json();
  assert.deepEqual(value.voices,[{id:'voice1',name:'Voice one',language:'de'}]);
  assert.ok(!JSON.stringify(value).includes('private-test-value'));
});

function forwardedHealth(base, host, origin) {
  return new Promise((resolve, reject) => httpGet(`${base}/api/health`, {
    headers: { Host: host, ...(origin ? { Origin: origin } : {}) },
  }, res => {
    res.resume(); resolve({ status: res.statusCode, origin: res.headers['access-control-allow-origin'] });
  }).on('error', reject));
}

test('Codespaces accepts its own forwarded host and origin, blocking other codespaces', async t => {
  const { base, post } = await setup(t, { env: {
    CODESPACES: 'true', CODESPACE_NAME: 'reel-private-abc',
    GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev', PORT: '8787',
  } });
  const host = 'reel-private-abc-8787.app.github.dev', origin = `https://${host}`;
  assert.deepEqual(await forwardedHealth(base, host, origin), { status: 200, origin });
  assert.equal((await forwardedHealth(base, 'another-space-8787.app.github.dev', origin)).status, 403);
  assert.equal((await forwardedHealth(base, host, 'https://another-space-8787.app.github.dev')).status, 403);
  assert.equal((await forwardedHealth(base, host, `http://${host}`)).status, 403);
  const preflight = await fetch(`${base}/api/generate`, { method: 'OPTIONS', headers: { Origin: origin } });
  assert.equal(preflight.status, 204);
  const generated = await fetch(`${base}/api/generate`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ topic: 'مشروعي من الموبايل', language: 'ar', duration: 30, aspect: '9:16' }),
  });
  assert.equal(generated.status, 200);
  const project = await generated.json();
  assert.equal((await post('/api/projects', { name: 'Mobile project', project })).status, 201);
});

test('private origin overrides Codespaces and incomplete metadata never allows a forwarded host', async t => {
  const codespace = { CODESPACES: 'true', CODESPACE_NAME: 'reel-private-abc', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'forwarding.example' };
  const { base } = await setup(t, { env: { ...codespace, FRONTEND_ORIGIN: 'https://private.example/' } });
  assert.equal((await forwardedHealth(base, 'private.example', 'https://private.example')).status, 200);
  assert.equal((await forwardedHealth(base, 'reel-private-abc-8787.forwarding.example')).status, 403);
  for (const env of [
    { ...codespace, CODESPACES: 'false' },
    { ...codespace, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: '' },
    { ...codespace, CODESPACE_NAME: 'invalid/name' },
  ]) {
    const instance = await setup(t, { env });
    assert.equal((await forwardedHealth(instance.base, 'reel-private-abc-8787.forwarding.example')).status, 403);
  }
});
