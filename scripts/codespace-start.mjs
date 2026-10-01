import { config as loadEnv } from 'dotenv';
import { spawn } from 'node:child_process';
import { mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { frontendOrigin } from '../server/config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
loadEnv({ path: path.join(root, '.env'), quiet: true });
const port = Number(process.env.PORT || 8787);
const runtime = path.join(root, '.runtime');
const pidFile = path.join(runtime, 'server.pid');
const localUrl = `http://127.0.0.1:${port}`;
const origin = frontendOrigin();
const checkOnly = process.argv.includes('--check');

// Connect only to loopback, including the forwarded Host/Origin check.
// This checks application routing, not GitHub authentication or the external tunnel.
function request(route, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = get(`${localUrl}${route}`, { headers, signal: AbortSignal.timeout(1500) }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 2_000_000) req.destroy(new Error('Response too large.')); });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body }));
    });
    req.on('error', reject);
  });
}

async function ready(headers) {
  try {
    const response = await request('/api/health', headers);
    const health = JSON.parse(response.body);
    return response.status === 200 && health.ok === true && typeof health.version === 'string' && !!health.render ? health : null;
  } catch { return null; }
}

async function restartManagedServer() {
  let pid;
  try { pid = Number((await readFile(pidFile, 'utf8')).trim()); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) throw new Error('Invalid .runtime/server.pid; no process was stopped.');
  try { process.kill(pid, 0); }
  catch (error) { if (error.code === 'ESRCH') return; throw error; }
  // A stale PID file must never authorize stopping an unrelated process.
  let owned = false;
  if (process.platform === 'linux') {
    try {
      const [cwd, executable, command] = await Promise.all([
        realpath(`/proc/${pid}/cwd`), realpath(`/proc/${pid}/exe`), readFile(`/proc/${pid}/cmdline`, 'utf8'),
      ]);
      const args = command.split('\0');
      owned = cwd === await realpath(root) && /^node(?:js)?$/.test(path.basename(executable))
        && !!args[1] && path.resolve(cwd, args[1]) === path.join(cwd, 'index.js');
    } catch {
      // An unreadable /proc entry is not proof that the process exited.
      try { process.kill(pid, 0); }
      catch (error) { if (error.code === 'ESRCH') return; throw error; }
    }
  }
  if (!owned) throw new Error('Saved PID does not identify this project server. No process was stopped; stop the old server from its terminal.');
  console.log('إعادة تشغيل سيرفر المشروع / Restarting project server...');
  process.kill(pid, 'SIGTERM');
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const state = await readFile(`/proc/${pid}/stat`, 'utf8');
      if (state.slice(state.lastIndexOf(')') + 2).startsWith('Z')) return;
    } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    await delay(100);
  }
  throw new Error('The previous server has not stopped. Check its terminal before retrying.');
}

async function main() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  if (!existsSync(path.join(root, 'dist/index.html'))) throw new Error('الواجهة غير مجهزة. شغّل / Run: npm run codespace');
  if (!checkOnly && process.argv.includes('--restart')) await restartManagedServer();
  let health = await ready();
  if (!health && !checkOnly) {
    console.log(`تشغيل السيرفر / Starting server on port ${port}...`);
    await mkdir(runtime, { recursive: true });
    const log = await open(path.join(runtime, 'server.log'), 'a');
    let child;
    try {
      child = spawn(process.execPath, ['index.js'], {
        cwd: root, env: { ...process.env, PORT: String(port) },
        detached: true, stdio: ['ignore', log.fd, log.fd],
      });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      await writeFile(pidFile, `${child.pid}\n`);
      child.unref();
    } finally { await log.close(); }
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      health = await ready();
      if (health || child.exitCode !== null) break;
      await delay(250);
    }
  }
  if (!health) throw new Error('السيرفر لا يستجيب. شغّل / Run: npm run codespace. Details: .runtime/server.log');
  const page = await request('/');
  const script = page.body.match(/<script\b[^>]*\bsrc=["'](\/assets\/[^"'<>]+\.js)["']/i)?.[1];
  if (page.status !== 200 || !page.type.includes('text/html') || !/id=["']root["']/.test(page.body) || !script) {
    throw new Error('API responds but the UI is unavailable. Run npm run codespace to build and restart the managed server.');
  }
  const bundle = await request(script);
  if (bundle.status !== 200 || !/javascript/.test(bundle.type)) throw new Error('Frontend JavaScript is unavailable. Run npm run codespace.');
  if (origin && !await ready({ Host: new URL(origin).host, Origin: origin })) {
    throw new Error('Forwarded Host/Origin rejected. Check FRONTEND_ORIGIN in .env, then run npm run codespace.');
  }
  console.log('نجح فحص السيرفر والواجهة داخل البيئة / Local API + UI + JavaScript: OK');
  console.log(`Local: ${localUrl}`);
  if (!health.render.ffmpeg || !health.render.ffprobe) console.log('MP4 export needs FFmpeg/FFprobe; the web interface can still open.');
  if (origin) {
    console.log('افتح هذا الرابط في متصفحك / Open in your browser:');
    console.log(origin);
    console.log(`If the browser still shows 404/502: PORTS > ${port} > Change Port Protocol > HTTP; keep visibility Private.`);
    console.log('External GitHub access has not been checked by this local test.');
  } else if (process.env.CODESPACES === 'true') {
    console.log(`Codespaces URL metadata is missing. Open PORTS > ${port} > Open in Browser.`);
  }
}

main().catch(error => {
  console.error(`تعذّر التشغيل / Startup check failed: ${error.message}`);
  process.exitCode = 1;
});
