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
const PORT = process.env.PORT || 8787;

// توكن الإدارة (إلزامي لحماية /revoke و /release و /key/:id)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// توكن العميل (اختياري، لحماية /activate و /verify)
const ACTIVATION_TOKEN = process.env.ACTIVATION_TOKEN || '';

// التحقق الإلزامي من وجود ADMIN_TOKEN عند بدء السيرفر (Fail-Closed)
if (!ADMIN_TOKEN || ADMIN_TOKEN.trim() === '') {
  console.error('================================================================');
  console.error('⛔ خطأ فادح: متغير البيئة ADMIN_TOKEN إلزامي لبدء السيرفر!');
  console.error('FATAL ERROR: ADMIN_TOKEN environment variable is required.');
  console.error('يرجى ضبط ADMIN_TOKEN بقيمة سرية قوية لحماية العمليات الإدارية.');
  console.error('مثال: ADMIN_TOKEN=your-strong-secret-token');
  console.error('================================================================');
  process.exit(1);
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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

let writeTimer = null;
let dirty = false;
function writeNow() {
  clearTimeout(writeTimer);
  writeTimer = null;
  if (!dirty) return;
  const tmp = DATA_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DATA_FILE);
    dirty = false;
  } catch (err) {
    console.error('persist failed:', err.message);
  }
}
function persist() {
  // debounce + atomic replace
  dirty = true;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeNow, 100);
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
function rateLimiter(limit = 30, windowMs = 60 * 1000) {
  return (req, res, next) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) ||
               req.socket.remoteAddress ||
               'unknown';
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

// Optional bearer token protection for client endpoints (/activate, /verify)
function authCheck(req, res, next) {
  if (!ACTIVATION_TOKEN) return next();
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

  // ترقية سجل v1 قديم (لا يوجد توكن بعد) — نفس الجهاز المرتبط يستلم توكنه
  if (!rec.machineToken) {
    rec.machineToken = newMachineToken();
    rec.lastSeen = now;
    rec.hits = (rec.hits || 0) + 1;
    persist();
    console.log(`[MIGRATE] key ${keyId} upgraded to v2 during verify`);
    return res.json({ ok: true, machineToken: rec.machineToken, migrated: true });
  }

  // عميل v1 (قبل الترقية) لا يملك توكناً بعد — نسلّمه إياه (هو الجهاز المرتبط أصلاً)
  if (!machineToken) {
    rec.lastSeen = now;
    rec.hits = (rec.hits || 0) + 1;
    persist();
    return res.json({ ok: true, machineToken: rec.machineToken, migrated: true });
  }

  if (machineToken !== rec.machineToken) {
    console.warn(`[VERIFY-REJECT] bad machine token for key ${keyId}`);
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
  if (ACTIVATION_TOKEN) {
    console.log('ACTIVATION_TOKEN is active for client endpoints (/activate, /verify).');
  } else {
    console.log('ACTIVATION_TOKEN is not set — client endpoints (/activate, /verify) are open (rate-limited).');
  }
});
