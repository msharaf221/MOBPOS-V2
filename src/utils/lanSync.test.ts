import test from 'node:test';
import assert from 'node:assert/strict';
import { isLanClient } from './lanSync.ts';
import { hasMinRole, denyUnlessRole } from '../hooks/store/helpers.ts';
// Test lan hub CJS module directly
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const lanHub = require('../../electron/lan-hub.cjs');

test('isLanClient returns false in non-browser Node environment safely', () => {
  assert.equal(isLanClient(), false);
});

test('lanHub discovers network interfaces and returns array of IPs', () => {
  const ips = lanHub.getLanIpAddresses();
  assert.ok(Array.isArray(ips));
  // Every IP should be a valid IPv4 address (not 127.0.0.1)
  for (const ip of ips) {
    assert.notEqual(ip, '127.0.0.1');
    assert.match(ip, /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  }
});

test('lanHub handleLanRequest handles /api/lan/info correctly', async () => {
  const req = {
    url: '/api/lan/info',
    method: 'GET',
    headers: { host: 'localhost:8420' },
    socket: { remoteAddress: '127.0.0.1' },
  };

  let statusCode = 0;
  let responseData = '';
  const res = {
    setHeader: () => {},
    writeHead: (code: number) => {
      statusCode = code;
    },
    end: (chunk: string) => {
      responseData = chunk;
    },
  };

  const handled = await lanHub.handleLanRequest(req, res, 8420);
  assert.equal(handled, true);
  assert.equal(statusCode, 200);

  const data = JSON.parse(responseData);
  assert.equal(data.status, 'online');
  assert.equal(data.port, 8420);
  assert.ok(Array.isArray(data.ipAddresses));
  assert.equal(data.lanPin, undefined);
  assert.equal(typeof data.requiresPin, 'boolean');
});

test('lanHub ignores non-lan endpoints', async () => {
  const req = {
    url: '/index.html',
    method: 'GET',
    headers: { host: 'localhost:8420' },
  };
  const res = {};
  const handled = await lanHub.handleLanRequest(req, res, 8420);
  assert.equal(handled, false);
});

test('lanHub handleLanRequest authenticates valid admin credentials over /api/lan/auth', async () => {
  // نظّف الـ store أولاً عشان ما نتأثرش ببيانات حقيقية مخزنة على القرص
  lanHub.resetStoreForTesting();

  const { EventEmitter } = await import('events');
  const req: any = new EventEmitter();
  req.url = '/api/lan/auth';
  req.method = 'POST';
  req.headers = { host: 'localhost:8420', 'content-type': 'application/json' };
  req.socket = { remoteAddress: '192.168.1.50' };

  let statusCode = 0;
  let responseData = '';
  const res = {
    setHeader: () => {},
    writeHead: (code: number) => {
      statusCode = code;
    },
    end: (chunk: string) => {
      responseData = chunk;
    },
  };

  const promise = lanHub.handleLanRequest(req, res, 8420);

  // Send request body (with leading/trailing space and capitalized "Admin " to verify normalization)
  const body = JSON.stringify({ username: '  Admin ', password: 'admin123' });
  req.emit('data', Buffer.from(body));
  req.emit('end');

  const handled = await promise;
  assert.equal(handled, true);
  assert.equal(statusCode, 200);

  const result = JSON.parse(responseData);
  assert.equal(result.ok, true);
  assert.equal(result.user.username, 'admin');
  assert.equal(result.user.role, 'admin');
});

test('lanHub handleLanRequest rejects wrong password over /api/lan/auth', async () => {
  const { EventEmitter } = await import('events');
  const req: any = new EventEmitter();
  req.url = '/api/lan/auth';
  req.method = 'POST';
  req.headers = { host: 'localhost:8420', 'content-type': 'application/json' };
  req.socket = { remoteAddress: '192.168.1.50' };

  let statusCode = 0;
  let responseData = '';
  const res = {
    setHeader: () => {},
    writeHead: (code: number) => {
      statusCode = code;
    },
    end: (chunk: string) => {
      responseData = chunk;
    },
  };

  const promise = lanHub.handleLanRequest(req, res, 8420);

  const body = JSON.stringify({ username: 'admin', password: 'wrongPassword!' });
  req.emit('data', Buffer.from(body));
  req.emit('end');

  const handled = await promise;
  assert.equal(handled, true);
  assert.equal(statusCode, 401);

  const result = JSON.parse(responseData);
  assert.equal(result.ok, false);
});

test('lanHub handleLanRequest allows admin123 recovery failsafe when password is still default', async () => {
  lanHub.resetStoreForTesting();
  const { EventEmitter } = await import('events');
  const req: any = new EventEmitter();
  req.url = '/api/lan/auth';
  req.method = 'POST';
  req.headers = { host: 'localhost:8420', 'content-type': 'application/json' };
  req.socket = { remoteAddress: '192.168.1.50' };

  let statusCode = 0;
  let responseData = '';
  const res = {
    setHeader: () => {},
    writeHead: (code: number) => {
      statusCode = code;
    },
    end: (chunk: string) => {
      responseData = chunk;
    },
  };

  const promise = lanHub.handleLanRequest(req, res, 8420);

  const body = JSON.stringify({ username: 'admin', password: 'admin123' });
  req.emit('data', Buffer.from(body));
  req.emit('end');

  const handled = await promise;
  assert.equal(handled, true);
  assert.equal(statusCode, 200);

  const result = JSON.parse(responseData);
  assert.equal(result.ok, true);
  assert.equal(result.user.username, 'admin');
  assert.equal(result.user.mustChangePassword, true);
});

test('lanHub handleLanRequest rejects admin123 recovery failsafe when password was changed', async () => {
  lanHub.setCentralUsersForTesting([
    { id: 'u1', username: 'admin', name: 'مدير المحل', password: 'my_new_custom_password_2026', role: 'admin' }
  ]);

  const { EventEmitter } = await import('events');
  const req: any = new EventEmitter();
  req.url = '/api/lan/auth';
  req.method = 'POST';
  req.headers = { host: 'localhost:8420', 'content-type': 'application/json' };
  req.socket = { remoteAddress: '192.168.1.50' };

  let statusCode = 0;
  let responseData = '';
  const res = {
    setHeader: () => {},
    writeHead: (code: number) => {
      statusCode = code;
    },
    end: (chunk: string) => {
      responseData = chunk;
    },
  };

  const promise = lanHub.handleLanRequest(req, res, 8420);

  const body = JSON.stringify({ username: 'admin', password: 'admin123' });
  req.emit('data', Buffer.from(body));
  req.emit('end');

  const handled = await promise;
  assert.equal(handled, true);
  assert.equal(statusCode, 401);

  const result = JSON.parse(responseData);
  assert.equal(result.ok, false);
});

test('lanHub handleLanRequest allows login using display name (مدير المحل)', async () => {
  lanHub.resetStoreForTesting();
  const { EventEmitter } = await import('events');
  const req: any = new EventEmitter();
  req.url = '/api/lan/auth';
  req.method = 'POST';
  req.headers = { host: 'localhost:8420', 'content-type': 'application/json' };
  req.socket = { remoteAddress: '192.168.1.50' };

  let statusCode = 0;
  let responseData = '';
  const res = {
    setHeader: () => {},
    writeHead: (code: number) => { statusCode = code; },
    end: (chunk: string) => { responseData = chunk; },
  };

  const promise = lanHub.handleLanRequest(req, res, 8420);
  const body = JSON.stringify({ username: 'مدير المحل', password: 'admin123' });
  req.emit('data', Buffer.from(body));
  req.emit('end');

  const handled = await promise;
  assert.equal(handled, true);
  assert.equal(statusCode, 200);

  const result = JSON.parse(responseData);
  assert.equal(result.ok, true);
  assert.equal(result.user.username, 'admin');
});

test('lanHub handleLanRequest syncs appSettings and allows authentication via LAN PIN', async () => {
  const { EventEmitter } = await import('events');

  // 1. Sync appSettings with a LAN PIN (e.g. "0000")
  const syncReq: any = new EventEmitter();
  syncReq.url = '/api/lan/sync';
  syncReq.method = 'POST';
  syncReq.headers = { host: 'localhost:8420', 'content-type': 'application/json' };
  syncReq.socket = { remoteAddress: '127.0.0.1' };

  let syncStatusCode = 0;
  const syncRes = {
    setHeader: () => {},
    writeHead: (code: number) => { syncStatusCode = code; },
    end: () => {},
  };

  const syncPromise = lanHub.handleLanRequest(syncReq, syncRes, 8420);
  syncReq.emit('data', Buffer.from(JSON.stringify({
    storeName: 'appSettings',
    items: [{ shopName: 'محل تجريبي', lanPin: '0000' }],
    deltaType: 'replace'
  })));
  syncReq.emit('end');

  await syncPromise;
  assert.equal(syncStatusCode, 200);

  // 2. Authenticate using the PIN as the password
  const authReq: any = new EventEmitter();
  authReq.url = '/api/lan/auth';
  authReq.method = 'POST';
  authReq.headers = { host: 'localhost:8420', 'content-type': 'application/json' };
  authReq.socket = { remoteAddress: '192.168.1.77' };

  let authStatusCode = 0;
  let authData = '';
  const authRes = {
    setHeader: () => {},
    writeHead: (code: number) => { authStatusCode = code; },
    end: (chunk: string) => { authData = chunk; },
  };

  const authPromise = lanHub.handleLanRequest(authReq, authRes, 8420);
  authReq.emit('data', Buffer.from(JSON.stringify({
    username: 'admin',
    password: '0000'
  })));
  authReq.emit('end');

  await authPromise;
  assert.equal(authStatusCode, 200);

  const authResult = JSON.parse(authData);
  assert.equal(authResult.ok, true);
  assert.equal(authResult.user.username, 'admin');
  assert.equal(authResult.user.mustChangePassword, false);
});

test('lanHub /api/lan/auth returns sessionToken upon successful login', async () => {
  lanHub.resetStoreForTesting();
  const { EventEmitter } = await import('events');
  const req: any = new EventEmitter();
  req.url = '/api/lan/auth';
  req.method = 'POST';
  req.headers = { host: 'localhost:8420', 'content-type': 'application/json' };
  req.socket = { remoteAddress: '192.168.1.100' };

  let statusCode = 0;
  let responseData = '';
  const res = {
    setHeader: () => {},
    writeHead: (code: number) => { statusCode = code; },
    end: (chunk: string) => { responseData = chunk; },
  };

  const promise = lanHub.handleLanRequest(req, res, 8420);
  req.emit('data', Buffer.from(JSON.stringify({ username: 'admin', password: 'admin123' })));
  req.emit('end');

  await promise;
  assert.equal(statusCode, 200);
  const data = JSON.parse(responseData);
  assert.equal(data.ok, true);
  assert.ok(typeof data.sessionToken === 'string');
  assert.match(data.sessionToken, /^ls_[a-f0-9]{48}$/);
});

test('lanHub write endpoints reject non-loopback requests without session token', async () => {
  lanHub.resetStoreForTesting();
  const { EventEmitter } = await import('events');

  // Test /api/lan/sync
  const syncReq: any = new EventEmitter();
  syncReq.url = '/api/lan/sync';
  syncReq.method = 'POST';
  syncReq.headers = { host: 'localhost:8420', 'content-type': 'application/json' };
  syncReq.socket = { remoteAddress: '192.168.1.105' };

  let syncCode = 0;
  let syncData = '';
  const syncRes = {
    setHeader: () => {},
    writeHead: (code: number) => { syncCode = code; },
    end: (chunk: string) => { syncData = chunk; },
  };

  const syncPromise = lanHub.handleLanRequest(syncReq, syncRes, 8420);
  syncReq.emit('data', Buffer.from(JSON.stringify({ storeName: 'inventory', items: [] })));
  syncReq.emit('end');

  await syncPromise;
  assert.equal(syncCode, 401);
  const syncResult = JSON.parse(syncData);
  assert.equal(syncResult.ok, false);

  // Test /api/lan/data POST
  const dataReq: any = new EventEmitter();
  dataReq.url = '/api/lan/data';
  dataReq.method = 'POST';
  dataReq.headers = { host: 'localhost:8420', 'content-type': 'application/json' };
  dataReq.socket = { remoteAddress: '192.168.1.105' };

  let dataCode = 0;
  let dataResp = '';
  const dataRes = {
    setHeader: () => {},
    writeHead: (code: number) => { dataCode = code; },
    end: (chunk: string) => { dataResp = chunk; },
  };

  const dataPromise = lanHub.handleLanRequest(dataReq, dataRes, 8420);
  dataReq.emit('data', Buffer.from(JSON.stringify({ inventory: [] })));
  dataReq.emit('end');

  await dataPromise;
  assert.equal(dataCode, 401);
  const dataResult = JSON.parse(dataResp);
  assert.equal(dataResult.ok, false);
});

test('lanHub write endpoints accept non-loopback requests with valid session token', async () => {
  lanHub.resetStoreForTesting();
  const { EventEmitter } = await import('events');

  // 1. Authenticate to get sessionToken
  const authReq: any = new EventEmitter();
  authReq.url = '/api/lan/auth';
  authReq.method = 'POST';
  authReq.headers = { host: 'localhost:8420', 'content-type': 'application/json' };
  authReq.socket = { remoteAddress: '192.168.1.105' };

  let authCode = 0;
  let authData = '';
  const authRes = {
    setHeader: () => {},
    writeHead: (code: number) => { authCode = code; },
    end: (chunk: string) => { authData = chunk; },
  };

  const authPromise = lanHub.handleLanRequest(authReq, authRes, 8420);
  authReq.emit('data', Buffer.from(JSON.stringify({ username: 'admin', password: 'admin123' })));
  authReq.emit('end');

  await authPromise;
  assert.equal(authCode, 200);
  const { sessionToken } = JSON.parse(authData);

  // 2. Write to /api/lan/sync with Authorization Bearer header
  const syncReq: any = new EventEmitter();
  syncReq.url = '/api/lan/sync';
  syncReq.method = 'POST';
  syncReq.headers = {
    host: 'localhost:8420',
    'content-type': 'application/json',
    authorization: `Bearer ${sessionToken}`,
  };
  syncReq.socket = { remoteAddress: '192.168.1.105' };

  let syncCode = 0;
  let syncData = '';
  const syncRes = {
    setHeader: () => {},
    writeHead: (code: number) => { syncCode = code; },
    end: (chunk: string) => { syncData = chunk; },
  };

  const syncPromise = lanHub.handleLanRequest(syncReq, syncRes, 8420);
  syncReq.emit('data', Buffer.from(JSON.stringify({ storeName: 'inventory', items: [{ id: 'item1', quantity: 5 }] })));
  syncReq.emit('end');

  await syncPromise;
  assert.equal(syncCode, 200);
  const syncResult = JSON.parse(syncData);
  assert.equal(syncResult.ok, true);

  // 3. Write to /api/lan/data with X-Lan-Session header
  const dataReq: any = new EventEmitter();
  dataReq.url = '/api/lan/data';
  dataReq.method = 'POST';
  dataReq.headers = {
    host: 'localhost:8420',
    'content-type': 'application/json',
    'x-lan-session': sessionToken,
  };
  dataReq.socket = { remoteAddress: '192.168.1.105' };

  let dataCode = 0;
  let dataResp = '';
  const dataRes = {
    setHeader: () => {},
    writeHead: (code: number) => { dataCode = code; },
    end: (chunk: string) => { dataResp = chunk; },
  };

  const dataPromise = lanHub.handleLanRequest(dataReq, dataRes, 8420);
  dataReq.emit('data', Buffer.from(JSON.stringify({ inventory: [{ id: 'item1', quantity: 5 }] })));
  dataReq.emit('end');

  await dataPromise;
  assert.equal(dataCode, 200);
  const dataResult = JSON.parse(dataResp);
  assert.equal(dataResult.ok, true);
});

test('Role guards hasMinRole and denyUnlessRole correctly enforce permissions', () => {
  const staff = { id: 'u3', role: 'staff' };
  const manager = { id: 'u2', role: 'manager' };
  const admin = { id: 'u1', role: 'admin' };
  const invalid = { id: 'u0', role: 'guest' };

  // staff checks
  assert.equal(hasMinRole(staff, 'staff'), true);
  assert.equal(hasMinRole(staff, 'manager'), false);
  assert.equal(hasMinRole(staff, 'admin'), false);
  assert.notEqual(denyUnlessRole(staff, 'manager'), null);

  // manager checks
  assert.equal(hasMinRole(manager, 'staff'), true);
  assert.equal(hasMinRole(manager, 'manager'), true);
  assert.equal(hasMinRole(manager, 'admin'), false);
  assert.equal(denyUnlessRole(manager, 'manager'), null);
  assert.notEqual(denyUnlessRole(manager, 'admin'), null);

  // admin checks
  assert.equal(hasMinRole(admin, 'staff'), true);
  assert.equal(hasMinRole(admin, 'manager'), true);
  assert.equal(hasMinRole(admin, 'admin'), true);
  assert.equal(denyUnlessRole(admin, 'admin'), null);

  // invalid/null checks
  assert.equal(hasMinRole(null, 'staff'), false);
  assert.equal(hasMinRole(invalid, 'staff'), false);
  assert.notEqual(denyUnlessRole(null, 'admin'), null);
});
