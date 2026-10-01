import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../server/app.js';
import { probe, run } from '../server/media.js';

test('real MP4 export: portrait Full HD, landscape captions, complete narration and downloads', { timeout: 300000 }, async t => {
  const data = await mkdtemp(path.join(os.tmpdir(), 'reel-render-'));
  const config = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
  const audioFile = path.join(data, 'tone.mp3');
  // A deterministic local tone exercises audio muxing without making paid API calls.
  await run(config.ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '32', '-c:a', 'libmp3lame', audioFile]);
  const audioBytes = await readFile(audioFile), narration = 'Hallo Hamburg. مرحبًا هامبورغ.';
  const chars = [...narration], step = 2 / chars.length;
  let providerCalled = false;
  const instance = await createApp({ env: { DATA_DIR: data, ELEVENLABS_API_KEY: 'offline-test-key', ELEVENLABS_VOICE_ID: 'offlineVoice' },
    fetchImpl: async (url, init) => {
      assert.ok(url.endsWith('/with-timestamps?output_format=mp3_44100_128'));
      assert.equal(JSON.parse(init.body).text, narration); assert.equal(init.headers['xi-api-key'], 'offline-test-key');
      providerCalled = true;
      return Response.json({ audio_base64: audioBytes.toString('base64'), normalized_alignment: {
        characters: chars, character_start_times_seconds: chars.map((_, i) => .3 + i * step), character_end_times_seconds: chars.map((_, i) => .3 + (i + 1) * step),
      } });
    },
  });
  const server = instance.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(data, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (route, body) => {
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value;
  };
  const wait = async id => {
    for (let i = 0; i < 1200; i++) {
      const job = await (await fetch(`${base}/api/jobs/${id}`)).json();
      if (job.status === 'failed') throw new Error(job.error);
      if (job.status === 'completed') return job;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Render timed out');
  };
  const saveDir = process.env.REEL_TEST_OUTPUT_DIR;
  if (saveDir) await mkdir(saveDir, { recursive: true });
  for (const aspect of ['9:16', '16:9']) {
    const project = await post('/api/generate', { topic: 'Hamburg demo / هامبورغ', language: 'de', duration: 30, aspect });
    project.scenes[0].onScreenText = 'Hamburg / هامبورغ';
    const imageJob = await wait((await post('/api/images', { scenes: project.scenes, aspect })).id);
    assert.equal(imageJob.result.images.length, 4); assert.equal(imageJob.result.mode, 'demo');
    let audio;
    if (aspect === '16:9') {
      project.script = narration; audio = await post('/api/voice', { text: narration });
      assert.ok(providerCalled); assert.ok(audio.hasCaptions);
      const srt = await (await fetch(`${base}${audio.captionsUrl}`)).text(); assert.ok(srt.includes('هامبورغ.'));
      const stale = await fetch(`${base}/api/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        project: { ...project, script: 'Edited script' }, imageIds: imageJob.result.images.map(x => x.id), audioId: audio.id,
      }) });
      assert.equal(stale.status, 409);
    }
    const quality = aspect === '9:16' ? '1080p' : '720p';
    const rendered = await wait((await post('/api/render', { project, imageIds: imageJob.result.images.map(x => x.id), audioId: audio?.id, quality, burnCaptions: true })).id);
    assert.equal(rendered.result.hasVoice, !!audio); assert.equal(rendered.result.captionsBurned, !!audio);
    assert.equal(rendered.result.hasDemoImages, true);
    const file = path.join(instance.jobs.dir(rendered.id), 'video.mp4');
    const metadata = await probe(file, config), video = metadata.streams.find(s => s.codec_type === 'video');
    assert.equal(video.codec_name, 'h264'); assert.equal(video.pix_fmt, 'yuv420p'); assert.equal(video.r_frame_rate, '30/1');
    assert.equal(video.width, aspect === '9:16' ? 1080 : 1280); assert.equal(video.height, aspect === '9:16' ? 1920 : 720);
    assert.ok(metadata.streams.some(s => s.codec_name === 'aac'));
    assert.ok(Math.abs(Number(metadata.format.duration) - rendered.result.duration) < .1);
    if (audio) { assert.ok(rendered.result.duration > 32); assert.match(rendered.result.warning, /extended/); }
    else assert.equal(Number(metadata.format.duration), 30);
    const download = await fetch(`${base}${rendered.result.url}?download=1`);
    assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition'), /attachment/);
    const range = await fetch(`${base}${rendered.result.url}`, { headers: { Range: 'bytes=0-99' } });
    assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 100);
    if (saveDir) {
      const name = aspect === '9:16' ? 'Reel-engine-ai-v0.6-demo-9x16' : 'landscape-caption-check';
      await copyFile(file, path.join(saveDir, `${name}.mp4`));
      await run(config.ffmpeg, ['-y', '-v', 'error', '-ss', '1.7', '-i', file, '-frames:v', '1', path.join(saveDir, `${name}.png`)]);
    }
  }
});
