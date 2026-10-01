import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { frontendOrigin } from '../server/config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
if (!existsSync(path.join(root, 'dist/index.html'))) throw new Error('Run npm ci && npm run build first.');
const localUrl = `http://127.0.0.1:${port}`;
const url = frontendOrigin() || localUrl;

async function ready() {
  try {
    const response = await fetch(`${localUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
    const health = await response.json();
    return response.ok && health.ok === true && typeof health.version === 'string' && !!health.render;
  } catch { return false; }
}

if (!await ready()) {
  const runtime = path.join(root, '.runtime');
  await mkdir(runtime, { recursive: true });
  const log = await open(path.join(runtime, 'server.log'), 'a');
  let child;
  try {
    child = spawn(process.execPath, ['index.js'], {
      cwd: root, env: { ...process.env, PORT: String(port) },
      detached: true, stdio: ['ignore', log.fd, log.fd],
    });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    await writeFile(path.join(runtime, 'server.pid'), `${child.pid}\n`);
    child.unref();
  } finally { await log.close(); }
  let started = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await ready()) { started = true; break; }
    if (child.exitCode !== null) break;
    await delay(250);
  }
  if (!started) throw new Error('Server did not start. Check .runtime/server.log, then rerun node scripts/codespace-start.mjs.');
}

console.log(`Reel Engine AI is ready: ${localUrl}`);
console.log(`Open in your browser: ${url}`);
