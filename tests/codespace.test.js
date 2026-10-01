import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const source = fileURLToPath(new URL('../', import.meta.url));
let processInspectionAvailable = false;
try {
  // Some hosted runtimes virtualize PIDs without exposing the matching /proc tree.
  const command = await readFile(`/proc/${process.pid}/cmdline`, 'utf8');
  processInspectionAvailable = command.split('\0').includes(process.argv[1]);
} catch { /* The script must refuse to stop an unverifiable process. */ }

test('Codespaces startup, restart ownership and honest readiness checks', { skip: process.platform !== 'linux' }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reel-codespace-'));
  const serverPids = new Set();
  t.after(async () => {
    for (const pid of serverPids) { try { process.kill(pid, 'SIGTERM'); } catch {} }
    await rm(root, { recursive: true, force: true });
  });
  for (const item of ['package.json', 'index.js', 'server', 'scripts']) await cp(path.join(source, item), path.join(root, item), { recursive: true });
  await symlink(path.join(source, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await mkdir(path.join(root, 'dist', 'assets'), { recursive: true });
  const html = '<!doctype html><div id="root"></div><script type="module" src="/assets/app.js"></script>';
  await writeFile(path.join(root, 'dist', 'index.html'), html);
  await writeFile(path.join(root, 'dist', 'assets', 'app.js'), 'console.log("ready");');
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: path.join(root, 'data'), OPENAI_API_KEY: '', ELEVENLABS_API_KEY: '', FRONTEND_ORIGIN: '', CODESPACES: 'true', CODESPACE_NAME: 'startup-test', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev' };
  const run = args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'codespace-start.mjs'), ...args], { cwd: os.tmpdir(), env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.once('error', reject);
    child.once('exit', code => resolve({ code, output }));
  });
  const readPid = async () => Number((await readFile(path.join(root, '.runtime', 'server.pid'), 'utf8')).trim());

  await t.test('check-only reports a stopped server without starting one', async () => {
    const result = await run(['--check']);
    assert.equal(result.code, 1);
    assert.match(result.output, /Startup check failed/);
    await assert.rejects(readPid(), { code: 'ENOENT' });
  });
  await t.test('first start serves the UI and repeated start reuses it', async () => {
    const started = await run([]);
    const pid = await readPid(); serverPids.add(pid);
    assert.equal(started.code, 0, started.output);
    assert.match(started.output, /Local API \+ UI \+ JavaScript: OK/);
    assert.ok(started.output.includes(`https://startup-test-${port}.app.github.dev`));
    assert.match(started.output, /External GitHub access has not been checked/);
    const repeated = await run([]);
    assert.equal(repeated.code, 0, repeated.output);
    assert.equal(await readPid(), pid);
  });
  await t.test('restart replaces only the tracked project server', { skip: !processInspectionAvailable }, async () => {
    const previous = await readPid();
    const result = await run(['--restart']);
    const pid = await readPid(); serverPids.add(pid);
    assert.equal(result.code, 0, result.output);
    assert.notEqual(pid, previous);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
  });
  await t.test('a healthy API with a missing page or bundle fails the check', async () => {
    await rm(path.join(root, 'dist', 'assets', 'app.js'));
    const noBundle = await run(['--check']);
    assert.equal(noBundle.code, 1);
    assert.match(noBundle.output, /Frontend JavaScript is unavailable/);
    await writeFile(path.join(root, 'dist', 'assets', 'app.js'), 'console.log("ready");');
    await writeFile(path.join(root, 'dist', 'index.html'), '<!doctype html><p>Wrong page</p>');
    const noUi = await run(['--check']);
    assert.equal(noUi.code, 1);
    assert.match(noUi.output, /API responds but the UI is unavailable/);
    await writeFile(path.join(root, 'dist', 'index.html'), html);
  });
  await t.test('a stale PID pointing to another process is not killed', async () => {
    const managedPid = await readPid();
    await writeFile(path.join(root, '.runtime', 'server.pid'), `${process.pid}\n`);
    const result = await run(['--restart']);
    assert.equal(result.code, 1);
    assert.match(result.output, /No process was stopped/);
    assert.doesNotThrow(() => process.kill(process.pid, 0));
    await writeFile(path.join(root, '.runtime', 'server.pid'), `${managedPid}\n`);
    assert.equal((await run(['--check'])).code, 0);
  });
});
