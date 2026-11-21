import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

// Local-only server contract checks. Fixed strings are test fixtures, not secrets.
const directory = await mkdtemp(path.join(tmpdir(), 'mobpos-review-'));
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const child = spawn(process.execPath, ['activation-server/server.js'], {
  env: { ...process.env, PORT: String(port), DATA_FILE: path.join(directory, 'activations.json'),
    ADMIN_TOKEN: 'local-admin-fixture', ACTIVATION_TOKEN: 'local-client-fixture' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', data => { log += data; });
child.stderr.on('data', data => { log += data; });
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { clearInterval(timer); reject(new Error(log)); }, 5000);
    const timer = setInterval(() => {
      if (log.includes('running on')) { clearInterval(timer); clearTimeout(timeout); resolve(); }
    }, 20);
  });
  async function post(endpoint, body, token) {
    const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const record = { keyId: 'localfixture123', deviceId: 'DEV-fixture' };
  assert.equal((await post('/activate', record)).status, 401);
  assert.equal((await post('/verify', record)).status, 401);
  console.log('PASS no shared token rejects activate and verify');
  const first = await post('/activate', record, 'local-client-fixture');
  assert.equal(first.status, 200);
  assert.equal(typeof first.body.machineToken, 'string');
  console.log('CONFIRMED server accepts an arbitrary unsigned keyId with shared client credential');
  const replay = await post('/activate', record, 'local-client-fixture');
  assert.equal(replay.body.machineToken, first.body.machineToken);
  console.log('CONFIRMED same deviceId activation returns the existing machine token without proving ownership');
  assert.equal((await post('/verify', { ...record, machineToken: first.body.machineToken }, 'local-client-fixture')).status, 200);
  assert.equal((await post('/activate', { ...record, deviceId: 'DEV-other' }, 'local-client-fixture')).status, 409);
  assert.equal((await post('/revoke', record, 'local-client-fixture')).status, 401);
  console.log('PASS different device rejected; client credential cannot use admin revoke endpoint');
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
  await rm(directory, { recursive: true, force: true });
                                                            }
