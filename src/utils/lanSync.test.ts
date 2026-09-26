import test from 'node:test';
import assert from 'node:assert/strict';
import { isLanClient } from './lanSync.ts';
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
