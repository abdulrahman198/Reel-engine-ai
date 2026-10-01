import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError } from './core.js';

export const validId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export async function jsonFile(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2)); await rename(temp, file);
}

export class AssetStore {
  constructor(root) { this.root = path.join(root, 'assets'); }
  dir(id) { if (!validId(id)) throw new HttpError(400, 'invalid_asset_id'); return path.join(this.root, id); }
  async create(kind, bytes, extra = {}) {
    const id = randomUUID(), dir = this.dir(id);
    await mkdir(dir, { recursive: true });
    const file = { image: 'image.png', audio: 'audio.mp3', captions: 'captions.srt' }[kind];
    if (!file) throw new HttpError(400, 'invalid_asset_kind');
    const meta = { ...extra, id, kind, file, url: `/api/assets/${id}/file`, createdAt: new Date().toISOString() };
    await writeFile(path.join(dir, file), bytes); await jsonFile(path.join(dir, 'meta.json'), meta); return meta;
  }
  async get(id, kind) {
    let meta;
    try { meta = JSON.parse(await readFile(path.join(this.dir(id), 'meta.json'), 'utf8')); }
    catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(404, 'asset_not_found'); }
    if (kind && meta.kind !== kind) throw new HttpError(400, 'wrong_asset_type'); return meta;
  }
  file(meta) { return path.join(this.dir(meta.id), meta.file); }
}

export class ProjectStore {
  constructor(root) { this.root = path.join(root, 'projects'); this.writes = new Map(); }
  file(id) {
    if (!validId(id)) throw new HttpError(400, 'invalid_project_id');
    return path.join(this.root, `${id}.json`);
  }
  async get(id) {
    const file = this.file(id);
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') throw new HttpError(404, 'project_not_found'); throw error; }
  }
  async list() {
    await mkdir(this.root, { recursive: true });
    const results = await Promise.all((await readdir(this.root)).filter(name => name.endsWith('.json') && validId(name.slice(0, -5))).map(async name => {
      const doc = await this.get(name.slice(0, -5));
      return { id: doc.id, name: doc.name, updatedAt: doc.updatedAt, language: doc.project.language, aspect: doc.project.aspect, duration: doc.project.duration };
    }));
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async save(value, id = randomUUID(), create = false) {
    const previous = this.writes.get(id) || Promise.resolve();
    const writing = previous.catch(() => {}).then(async () => {
      const existing = create ? null : await this.get(id);
      const now = new Date().toISOString();
      const doc = { ...value, id, createdAt: existing?.createdAt || now, updatedAt: now };
      await jsonFile(this.file(id), doc); return doc;
    });
    this.writes.set(id, writing);
    try { return await writing; } finally { if (this.writes.get(id) === writing) this.writes.delete(id); }
  }
  async remove(id) {
    await this.writes.get(id)?.catch(() => {});
    await this.get(id); await unlink(this.file(id));
  }
}

export class Jobs {
  constructor(root, safeMessage) {
    this.root = path.join(root, 'jobs'); this.jobs = new Map(); this.queue = []; this.running = false; this.safeMessage = safeMessage;
  }
  async init() {
    await mkdir(this.root, { recursive: true });
    for (const id of await readdir(this.root)) {
      if (!validId(id)) continue;
      try {
        const job = JSON.parse(await readFile(path.join(this.root, id, 'job.json'), 'utf8'));
        if (['queued', 'running'].includes(job.status)) { job.status = 'failed'; job.error = 'The server restarted. Start this job again.'; await this.save(job); }
        this.jobs.set(id, job);
      } catch { /* Ignore incomplete temporary writes. */ }
    }
  }
  dir(id) { if (!validId(id)) throw new HttpError(400, 'invalid_job_id'); return path.join(this.root, id); }
  save(job) { return jsonFile(path.join(this.dir(job.id), 'job.json'), job); }
  get(id) {
    if (!validId(id)) throw new HttpError(400, 'invalid_job_id');
    const job = this.jobs.get(id); if (!job) throw new HttpError(404, 'job_not_found'); return job;
  }
  async create(type, task) {
    if (this.queue.length >= 8) throw new HttpError(429, 'queue_full', 'Wait for the current jobs to finish.');
    const job = { id: randomUUID(), type, status: 'queued', progress: 0, message: 'Queued', createdAt: new Date().toISOString(), result: {} };
    await this.save(job); this.jobs.set(job.id, job); this.queue.push({ job, task }); void this.drain(); return structuredClone(job);
  }
  async drain() {
    if (this.running) return; this.running = true;
    try {
      while (this.queue.length) {
        const { job, task } = this.queue.shift();
        try {
          job.status = 'running'; await this.save(job);
          const update = async (progress, message) => { job.progress = Math.round(progress); job.message = message; await this.save(job); };
          job.result = await task(job, update); job.status = 'completed'; job.progress = 100; job.message = 'Ready';
        } catch (e) { job.status = 'failed'; job.error = this.safeMessage(e); job.message = 'Failed'; }
        job.finishedAt = new Date().toISOString(); await this.save(job);
      }
    } finally { this.running = false; }
  }
}
