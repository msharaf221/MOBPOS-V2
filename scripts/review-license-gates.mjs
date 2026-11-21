import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

// Exercises the actual PR20 engine with a test-only signing key, deterministic
// device, and controlled HTTP responses. No customer key or production call.
const storage = new Map();
const requests = [];
let response = { status: 401, body: { ok: false, reason: 'unauthorized' } };
const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
const ctx = vm.createContext({
  crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
  btoa, atob, AbortController, setTimeout, clearTimeout, console,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  },
  fetch: async (url, options) => {
    requests.push({ url, ...options });
    if (response.throw) throw new Error('test network outage');
    return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.body };
  },
  window: { dispatchEvent() {} }, CustomEvent: class {},
});
const fingerprint = { version: 3, hash: 'fixture', signals: [] };
const keys = {
  LICENSE_PUBLIC_KEY: publicKey,
  ACTIVATION_SERVER_URL: 'https://activation.invalid',
  ACTIVATION_SERVER_TOKEN: '',
  STORAGE_KEYS: { activeLicense: 'license', lastServerVerify: 'verifyAt' },
};
function stub(name, exports) {
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context: ctx, identifier: name });
}
const cryptoModule = new vm.SourceTextModule(ts.transpileModule(readFileSync('src/license/crypto.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText, { context: ctx });
await cryptoModule.link(() => { throw new Error('unexpected crypto dependency'); });
const engine = new vm.SourceTextModule(ts.transpileModule(readFileSync('src/license/engine.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText, { context: ctx });
await engine.link(name => {
  if (name === './keys') return stub(name, keys);
  if (name === './crypto') return cryptoModule;
  if (name === './types') return stub(name, { PLAN_FEATURES: { lifetime: { modules: [], maxUsers: 10 } } });
  if (name === './device') return stub(name, {
    getDeviceId: async () => 'DEV-fixture',
    getDeviceFingerprint: async () => fingerprint,
    matchCurrentDeviceFingerprint: async () => ({ matches: true }),
  });
  throw new Error(`Unexpected import: ${name}`);
});
await engine.evaluate();
const api = engine.namespace;
const payload = { v: 2, id: 'fixture123', p: 'lifetime', s: 'Test shop', u: 2,
  i: new Date().toISOString(), e: '', lt: true, to: 'Test', n: '' };
const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
const message = `MSP2.${encoded}`;
const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(message));
const key = `${message}.${Buffer.from(signature).toString('base64url')}`;
assert.equal((await api.validateLicenseKey(key)).valid, true);
assert.equal((await api.activateLicense(key)).ok, false);
assert.equal(requests.at(-1).headers.Authorization, undefined);
assert.equal(storage.has('license'), false);
console.log('PASS fresh activation without shared token fails on 401 and stores no license');

response = { status: 200, body: { ok: true, machineToken: 'test-machine-token' } };
const activated = await api.activateLicense(key);
assert.equal(activated.ok, true);
assert.equal(activated.license.machineToken, 'test-machine-token');
console.log('PASS successful activation stores machine token');

response = { status: 401, body: { ok: false, reason: 'unauthorized' } };
assert.equal((await api.verifyStoredActivation()).status, 'ok');
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(storage.has('license'), true);
assert.equal(storage.has('verifyAt'), true);
assert.equal(await api.reverifyLicense(activated.license), 'throttled');
console.log('PASS licensed startup survives 401, but verification is suppressed for 24h');

storage.delete('verifyAt');
response = { throw: true };
assert.equal(await api.reverifyLicense(activated.license), 'server_unreachable');
assert.equal(storage.has('verifyAt'), false);
assert.equal(storage.has('license'), true);
console.log('PASS network outage preserves license and permits retry');

for (const reason of ['revoked', 'used_on_other_device', 'bad_token']) {
  storage.delete('verifyAt');
  api.storeLicense(activated.license);
  response = { status: 403, body: { ok: false, reason } };
  assert.equal(await api.reverifyLicense(activated.license), reason);
  assert.equal(storage.has('license'), false);
  console.log(`PASS authoritative ${reason} clears local activation`);
}
