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
