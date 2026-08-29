// ============================================================
//  MOBPOS Activation Server v2
//  يفرض أن كل مفتاح ترخيص يعمل على جهاز واحد فقط، مرة واحدة.
//
//  الجديد في v2 — Machine Token + Re-verification + فصل الصلاحيات:
//   • عند أول تفعيل يُصدر السيرفر Machine Token (سر عشوائي)
//     مرتبط بالمفتاح + الجهاز، ويُعيد إرساله للعميل ليحتفظ به.
//   • العميل يعيد تقديم الثلاثية { keyId, deviceId, machineToken }
//     دورياً على /verify لإثبات أنه لا يزال الجهاز الأصلي.
//   • فصل تام في الصلاحيات:
//     - ADMIN_TOKEN (إلزامي): يحمي /revoke و /release و /key/:id
//     - ACTIVATION_TOKEN (اختياري للعميل): يحمي /activate و /verify
//   • حماية Rate Limiting مدمجة على /activate و /verify
//   • /revoke: إلغاء مفتاح نهائياً (إدارة)
//   • /release: فك ارتباط مفتاح بجهازه (دعم فني)
//   • سجلات v1 القديمة (بدون machineToken) تُرقّى تلقائياً
//     عند أول تفعيل أو تحقق من نفس الجهاز المرتبط.
// ============================================================

import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, 'activations.json');
const PORT = Number(process.env.PORT || 8787);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

// توكن الإدارة (إلزامي لحماية /revoke و /release و /key/:id)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// توكن العميل (إلزامي، لحماية /activate و /verify)
const ACTIVATION_TOKEN = process.env.ACTIVATION_TOKEN || '';

// التحقق الإلزامي من وجود ADMIN_TOKEN عند بدء السيرفر (Fail-Closed)
if (!ADMIN_TOKEN || ADMIN_TOKEN.trim() === '' || !ACTIVATION_TOKEN || ACTIVATION_TOKEN.trim() === '') {
  console.error('================================================================');
  console.error('⛔ خطأ فادح: ADMIN_TOKEN و ACTIVATION_TOKEN إلزاميان لبدء السيرفر!');
  console.error('FATAL ERROR: ADMIN_TOKEN and ACTIVATION_TOKEN are required.');
  console.error('اضبط سراً قوياً لكل منهما، ولا تضع ADMIN_TOKEN في كود العميل.');
  console.error('================================================================');
  process.exit(1);
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('FATAL ERROR: PORT must be an integer between 1 and 65535.');
  process.exit(1);
}
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

// ===== Storage (atomic writes) =====
// `db` is created with a null prototype and every key is validated against an
// allow-listed charset before use, so attacker-controlled keyIds/device ids
// (e.g. "__proto__", "constructor", "prototype") can never pollute the
// object prototype chain or shadow inherited members.
let db = Object.create(null);
try {
  if (fs.existsSync(DATA_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    db = Object.assign(Object.create(null), parsed);
  }
} catch (err) {
  console.error('Failed to load data file, starting fresh:', err.message);
  db = Object.create(null);
}

let dirty = false;
function writeNow() {
  if (!dirty) return;
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  try {
    // Activation is a security decision. Do not acknowledge it before the
    // atomic replacement succeeds; otherwise a crash in the debounce window
    // could make the same key available again after restart.
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, DATA_FILE);
    dirty = false;
  } catch (err) {
    console.error('persist failed; stopping to avoid accepting activations that cannot be recovered:', err.message);
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    dirty = false;
    process.exit(1);
  }
}
function persist() {
  dirty = true;
  writeNow();
}

// Flush any pending debounced write before the process actually exits, so a
// crash/kill within the 100ms debounce window can't silently lose the most
// recent activation/verify state.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    writeNow();
    process.exit(0);
  });
}
process.on('exit', writeNow);

// ===== Helpers =====

function newMachineToken() {
  return crypto.randomBytes(24).toString('hex');
}

// keyId is generated client-side as base36 chars only (see src/license/engine.ts);
// deviceId is "DEV-<hex>" or "DEV-F-<base36><base36>". Restricting to this
// charset (in addition to the null-prototype `db`) defends in depth against
// prototype-pollution style keys such as "__proto__"/"constructor"/"prototype".
const KEY_ID_RE = /^[a-z0-9]{1,64}$/i;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{1,128}$/;

function validKeyIds(keyId) {
  return typeof keyId === 'string' && KEY_ID_RE.test(keyId);
}

function validDeviceId(deviceId) {
  return typeof deviceId === 'string' && DEVICE_ID_RE.test(deviceId);
}

function sanitizeLoadedDb(raw) {
  const safe = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return safe;
  for (const [keyId, value] of Object.entries(raw)) {
    if (!validKeyIds(keyId) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const rec = value;
    if (!validDeviceId(rec.deviceId) || typeof rec.activatedAt !== 'string') continue;
    if (rec.machineToken !== undefined &&
        (typeof rec.machineToken !== 'string' || !/^[a-f0-9]{48}$/i.test(rec.machineToken))) continue;
    safe[keyId] = {
      deviceId: rec.deviceId,
      machineToken: rec.machineToken,
      activatedAt: rec.activatedAt,
      lastSeen: typeof rec.lastSeen === 'string' ? rec.lastSeen : rec.activatedAt,
      hits: Number.isSafeInteger(rec.hits) && rec.hits > 0 ? rec.hits : 1,
      ...(rec.revoked === true ? { revoked: true, revokedAt: typeof rec.revokedAt === 'string' ? rec.revokedAt : new Date().toISOString() } : {}),
    };
  }
  return safe;
}

db = sanitizeLoadedDb(db);
try {
  if (fs.existsSync(DATA_FILE)) fs.chmodSync(DATA_FILE, 0o600);
} catch (err) {
  console.error('FATAL ERROR: activation data file is not private:', err.message);
  process.exit(1);
}

/** Constant-time comparison of a request's bearer token against the expected secret. */
function safeTokenEquals(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function maskDevice(deviceId) {
  return deviceId.slice(0, 6) + '…' + crypto.createHash('sha256').update(deviceId).digest('hex').slice(0, 4);
}

// ===== App =====
const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

// CORS (the client app may run from any origin)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// In-memory Rate Limiter (30 requests/minute per IP)
const rateLimitMap = new Map();
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetTime) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);
cleanupTimer.unref?.();
function rateLimiter(limit = 30, windowMs = 60 * 1000) {
  return (req, res, next) => {
    // Never trust a client-supplied X-Forwarded-For unless this deployment is
    // explicitly behind one trusted reverse proxy.
    const ip = (TRUST_PROXY ? req.ip : req.socket.remoteAddress) || 'unknown';
    const now = Date.now();
    let record = rateLimitMap.get(ip);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      rateLimitMap.set(ip, record);
    } else {
      record.count++;
    }

    // تنظيف السجلات المنتهية بشكل دوري لتجنب تسريب الذاكرة
    if (rateLimitMap.size > 5000) {
      for (const [key, val] of rateLimitMap.entries()) {
        if (now > val.resetTime) rateLimitMap.delete(key);
      }
    }

    if (record.count > limit) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        ok: false,
        reason: 'rate_limit_exceeded',
        message: 'تم تجاوز الحد المسموح للطلبات، يرجى المحاولة لاحقاً',
        retryAfter
      });
    }
    next();
  };
}

// Mandatory bearer token protection for client endpoints (/activate, /verify)
function authCheck(req, res, next) {
  const header = req.headers.authorization || '';
  if (safeTokenEquals(header, `Bearer ${ACTIVATION_TOKEN}`)) return next();
  return res.status(401).json({ ok: false, reason: 'unauthorized' });
}

// Mandatory admin bearer token protection for admin endpoints (/revoke, /release, /key/:id)
function adminCheck(req, res, next) {
  const header = req.headers.authorization || '';
  if (safeTokenEquals(header, `Bearer ${ADMIN_TOKEN}`)) return next();
  return res.status(401).json({ ok: false, reason: 'unauthorized_admin' });
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'mobpos-activation', version: 2, time: new Date().toISOString() });
});

// ===== التفعيل (عميل — محمي بـ rate limiter + authCheck) =====
app.post('/activate', rateLimiter(30, 60000), authCheck, (req, res) => {
  const { keyId, deviceId } = req.body || {};

  if (!validKeyIds(keyId)) return res.status(400).json({ ok: false, reason: 'bad_key_id' });
  if (!validDeviceId(deviceId)) return res.status(400).json({ ok: false, reason: 'bad_device_id' });

  const existing = db[keyId];
  const now = new Date().toISOString();

  if (!existing) {
    // First activation ever — consume the key permanently + issue machine token
    const machineToken = newMachineToken();
    db[keyId] = { deviceId, machineToken, activatedAt: now, lastSeen: now, hits: 1 };
    persist();
    console.log(`[ACTIVATE] new key ${keyId} → device ${deviceId}`);
    return res.json({ ok: true, firstActivation: true, machineToken });
  }

  if (existing.revoked) {
    console.warn(`[REJECT] revoked key ${keyId} tried to activate from device ${deviceId}`);
    return res.status(403).json({ ok: false, reason: 'revoked', revokedAt: existing.revokedAt });
  }

  if (existing.deviceId === deviceId) {
    // Same device re-activating (reinstall, cleared browser data...) — allowed
    existing.lastSeen = now;
    existing.hits = (existing.hits || 0) + 1;
    // ترقية سجلات v1 القديمة: أصدر توكن إذا لم يكن موجوداً
    if (!existing.machineToken) {
      existing.machineToken = newMachineToken();
      console.log(`[MIGRATE] key ${keyId} upgraded to v2 (machine token issued)`);
    }
    persist();
    return res.json({ ok: true, firstActivation: false, machineToken: existing.machineToken });
  }

  // Different device — the key is already dead
  console.warn(`[REJECT] key ${keyId} tried from device ${deviceId} (bound to ${existing.deviceId})`);
  return res.status(409).json({
    ok: false,
    reason: 'used_on_other_device',
    activatedAt: existing.activatedAt,
  });
});

// ===== إعادة التحقق الدوري (Re-verification) (عميل — محمي بـ rate limiter + authCheck) =====
app.post('/verify', rateLimiter(30, 60000), authCheck, (req, res) => {
  const { keyId, deviceId, machineToken } = req.body || {};

  if (!validKeyIds(keyId)) return res.status(400).json({ ok: false, reason: 'bad_key_id' });
  if (!validDeviceId(deviceId)) return res.status(400).json({ ok: false, reason: 'bad_device_id' });

  const rec = db[keyId];
  if (!rec) return res.status(404).json({ ok: false, reason: 'unknown_key' });

  if (rec.revoked) {
    console.warn(`[VERIFY-REJECT] revoked key ${keyId} from device ${deviceId}`);
    return res.status(403).json({ ok: false, reason: 'revoked', revokedAt: rec.revokedAt });
  }

  if (rec.deviceId !== deviceId) {
    console.warn(`[VERIFY-REJECT] key ${keyId} from device ${deviceId} (bound to ${rec.deviceId})`);
    return res.status(409).json({ ok: false, reason: 'used_on_other_device' });
  }

  const now = new Date().toISOString();

  // A legacy v1 row has no token to check, so migrate it once. Once a v2
  // token exists, an omitted token must not be treated as a reinstall: that
  // would let anyone who can spoof the public deviceId obtain a valid token.
  if (!rec.machineToken) {
    rec.machineToken = newMachineToken();
    rec.lastSeen = now;
    rec.hits = Math.min(Number.MAX_SAFE_INTEGER, (rec.hits || 0) + 1);
    persist();
    console.log(`[MIGRATE] key ${keyId} upgraded to v2 during verify`);
    return res.json({ ok: true, machineToken: rec.machineToken, migrated: true });
  }

  if (typeof machineToken !== 'string' || !safeTokenEquals(machineToken, rec.machineToken)) {
    console.warn(`[VERIFY-REJECT] bad or missing machine token for key ${keyId}`);
    return res.status(403).json({ ok: false, reason: 'bad_token' });
  }

  rec.lastSeen = now;
  rec.hits = (rec.hits || 0) + 1;
  persist();
  return res.json({ ok: true, verifiedAt: now });
});

// ===== إدارة: إلغاء مفتاح نهائياً (إداري — محمي بـ adminCheck + rate limiter) =====
app.post('/revoke', rateLimiter(30, 60000), adminCheck, (req, res) => {
  const { keyId } = req.body || {};
  if (!validKeyIds(keyId)) return res.status(400).json({ ok: false, reason: 'bad_key_id' });

  const rec = db[keyId];
  if (!rec) return res.status(404).json({ ok: false, reason: 'unknown_key' });

  rec.revoked = true;
  rec.revokedAt = new Date().toISOString();
  persist();
  console.log(`[REVOKE] key ${keyId} revoked (was bound to ${rec.deviceId})`);
  return res.json({ ok: true, revokedAt: rec.revokedAt });
});

// ===== دعم فني: فك ارتباط مفتاح بجهازه (إداري — محمي بـ adminCheck + rate limiter) =====
app.post('/release', rateLimiter(30, 60000), adminCheck, (req, res) => {
  const { keyId } = req.body || {};
  if (!validKeyIds(keyId)) return res.status(400).json({ ok: false, reason: 'bad_key_id' });

  const rec = db[keyId];
  if (!rec) return res.status(404).json({ ok: false, reason: 'unknown_key' });

  const oldDevice = rec.deviceId;
  // حذف السجل كاملاً = تفعيل جديد كأنه أول مرة (بتوكن جديد)
  delete db[keyId];
  persist();
  console.log(`[RELEASE] key ${keyId} unbound from device ${oldDevice}`);
  return res.json({ ok: true, releasedDevice: oldDevice });
});

// ===== استعلام حالة مفتاح (إداري — محمي بـ adminCheck + rate limiter) =====
app.get('/key/:id', rateLimiter(60, 60000), adminCheck, (req, res) => {
  const id = req.params.id;
  if (!validKeyIds(id)) return res.status(400).json({ ok: false, reason: 'bad_key_id' });
  const rec = db[id];
  if (!rec) return res.json({ status: 'not_activated' });
  res.json({
    status: rec.revoked ? 'revoked' : 'activated',
    deviceIdMasked: maskDevice(rec.deviceId),
    activatedAt: rec.activatedAt,
    lastSeen: rec.lastSeen,
    hits: rec.hits || 1,
    hasMachineToken: Boolean(rec.machineToken),
    revokedAt: rec.revokedAt || undefined,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MOBPOS activation server v2 running on http://0.0.0.0:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
  console.log(`ADMIN_TOKEN is active (mandatory for /revoke, /release, /key/:id).`);
  console.log('ACTIVATION_TOKEN is active for client endpoints (/activate, /verify).');
  console.log(`TRUST_PROXY is ${TRUST_PROXY ? 'enabled (one trusted reverse proxy)' : 'disabled'}.`);
});
