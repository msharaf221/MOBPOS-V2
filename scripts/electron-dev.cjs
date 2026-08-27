#!/usr/bin/env node
// Starts Vite on the fixed Electron origin (127.0.0.1:8420) and then opens
// Electron against that dev server, preserving HMR and IndexedDB/OAuth origin.

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const DEV_SERVER_URL = 'http://127.0.0.1:8420';
const viteBin = path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const electronBin = require('electron');

function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', (err) => {
        if (Date.now() > deadline) reject(err);
        else setTimeout(attempt, 250);
      });
      req.setTimeout(2000, () => req.destroy(new Error('Timed out waiting for Vite')));
    };
    attempt();
  });
}

const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '8420', '--strictPort'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: { ...process.env, MOBPOS_ELECTRON_DEV: '1' },
});

let electron = null;
let shuttingDown = false;

async function main() {
  try {
    await waitForServer(DEV_SERVER_URL);
    electron = spawn(electronBin, ['.'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        MOBPOS_ELECTRON_DEV: '1',
        MOBPOS_ELECTRON_DEV_SERVER_URL: DEV_SERVER_URL,
      },
    });

    electron.on('exit', (code) => {
      shutdown(code ?? 0);
    });
  } catch (err) {
    console.error('[electron:dev] Failed to start:', err?.message || err);
    shutdown(1);
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electron && !electron.killed) electron.kill();
  if (!vite.killed) vite.kill();
  process.exit(code);
}

vite.on('exit', (code) => {
  if (!shuttingDown && !electron) {
    console.error(`[electron:dev] Vite exited before Electron started (code ${code}).`);
    shutdown(code || 1);
  }
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main();
