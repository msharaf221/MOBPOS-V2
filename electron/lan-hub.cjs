// ============================================================
//  MOBPOS LAN Hub — محرك مشاركة البيانات عبر الشبكة المحلية
//  يسمح للأجهزة المتصلة بنفس شبكة الـ Wi-Fi بالوصول للنظام
//  والمزامنة اللحظية (Real-Time) عبر Server-Sent Events (SSE)
// ============================================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================
// طابور المهام (Mutex) لمعالجة التحديثات بالتسلسل وتجنب تعارض الكتابة
// ============================================================
class AsyncMutex {
  constructor() {
    this.queue = [];
    this.locked = false;
  }
  async acquire() {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise(resolve => {
      this.queue.push(resolve);
    }).then(() => () => this.release());
  }
  release() {
    if (this.queue.length > 0) {
      const nextResolve = this.queue.shift();
      nextResolve();
    } else {
      this.locked = false;
    }
  }
}
const dbMutex = new AsyncMutex();


// مسار حفظ بيانات الشبكة المركزية
const DATA_DIR = path.join(os.homedir(), '.mobpos');
const DATA_FILE = path.join(DATA_DIR, 'lan-store.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[lan-hub] Could not create data directory:', e.message);
}

// تخزين مركزي في الذاكرة
let centralStore = {};
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    centralStore = JSON.parse(raw);
  }
} catch (e) {
  centralStore = {};
}

function persistStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(centralStore), 'utf8');
  } catch (e) {
    // تجاهل خطأ الكتابة المؤقت
  }
}

// قائمة عملاء SSE المتصلين حالياً
const sseClients = new Map(); // id -> { res, ip, connectedAt, userAgent }

// الحصول على كافة عناوين IP المحلية للجهاز
function getLanIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name] || [];
    for (const net of netList) {
      // نريد فقط IPv4 غير الداخلي (ليس 127.0.0.1)
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({
          interface: name,
          ip: net.address,
        });
      }
    }
  }

  // ترتيب: نفضل شبكات Wi-Fi و Ethernet المعتادة (192.168.x أو 10.x)
  addresses.sort((a, b) => {
    if (a.ip.startsWith('192.168.')) return -1;
    if (b.ip.startsWith('192.168.')) return 1;
    return 0;
  });

  return addresses.map((a) => a.ip);
}

// بث رسالة لكل الأجهزة المتصلة
function broadcast(event, data, excludeId = null) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [id, client] of sseClients.entries()) {
    if (id === excludeId) continue;
    try {
      client.res.write(payload);
    } catch {
      sseClients.delete(id);
    }
  }
}

// نبض الحفاظ على الاتصال (Heartbeat) كل 15 ثانية
const pingTimer = setInterval(() => {
  broadcast('ping', { time: Date.now() });
}, 15000);
if (pingTimer && typeof pingTimer.unref === 'function') {
  pingTimer.unref();
}

// قراءة جسم الطلب (JSON Body)
function readJsonBody(req, limit = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Id');
}

/**
 * التحقق من كلمة المرور بدعم كامل لصيغة PBKDF2 والهاش القديم والنص العادي
 */
function verifyPassword(plain, stored) {
  if (typeof plain !== 'string' || typeof stored !== 'string') return false;
  if (!plain || !stored) return false;

  // صيغة PBKDF2 القياسية: pbkdf2$<iterations>$<salt>$<hash>
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    if (parts.length !== 4) return false;
    const iters = Number(parts[1]);
    const salt = parts[2];
    const hash = parts[3];
    if (!Number.isInteger(iters) || iters < 1000 || !salt || !hash) return false;
    try {
      const computed = crypto.pbkdf2Sync(plain, Buffer.from(salt, 'base64url'), iters, 32, 'sha256').toString('hex');
      const bufA = Buffer.from(computed);
      const bufB = Buffer.from(hash);
      return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  // صيغة SHA-256 القديمة (64 خانة)
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    const legacy = crypto.createHash('sha256').update('mobpos-pw::' + plain).digest('hex');
    return legacy.toLowerCase() === stored.toLowerCase();
  }

  // كلمة المرور الافتراضية أو غير المشفرة (مثل الحساب الافتراضي admin123)
  return plain === stored;
}

/**
 * معالج طلبات الـ LAN API
 * يرجع true إذا تم التعامل مع الطلب، أو false إن لم يكن تابعاً للـ API
 */
async function handleLanRequest(req, res, currentPort = 8420) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (!pathname.startsWith('/api/lan/')) {
    return false;
  }

  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  const clientIp = req.socket?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

  // 1. معلومات السيرفر والأجهزة المتصلة
  if (pathname === '/api/lan/info' && req.method === 'GET') {
    const ipAddresses = getLanIpAddresses();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        status: 'online',
        hostName: os.hostname(),
        ipAddresses,
        port: currentPort,
        activeClients: sseClients.size,
        connectedDevices: Array.from(sseClients.values()).map((c) => ({
          ip: c.ip,
          connectedAt: c.connectedAt,
          userAgent: c.userAgent,
        })),
      })
    );
    return true;
  }

  // 2. قناة البث المباشر (SSE Stream)
  if (pathname === '/api/lan/stream' && req.method === 'GET') {
    const clientId = `${clientIp}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userAgent = req.headers['user-agent'] || 'unknown';

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, hostName: os.hostname() })}\n\n`);

    sseClients.set(clientId, {
      res,
      ip: clientIp,
      connectedAt: new Date().toISOString(),
      userAgent,
    });

    req.on('close', () => {
      sseClients.delete(clientId);
    });

    return true;
  }

  // 3. جلب أو تحديث قاعدة البيانات المركزية كاملة
  if (pathname === '/api/lan/data') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(centralStore));
      return true;
    }

    if (req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        if (body && typeof body === 'object') {
          const release = await dbMutex.acquire();
          try {
            centralStore = { ...centralStore, ...body };
            persistStore();
          } finally {
            release();
          }
          const senderId = req.headers['x-client-id'] || null;
          broadcast('data-replaced', { stores: Object.keys(body) }, senderId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, storesCount: Object.keys(centralStore).length }));
          return true;
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
        return true;
      }
    }
  }

  // 4. مزامنة جزئية ذرية (Delta Sync)
  if (pathname === '/api/lan/sync' && req.method === 'POST') {
    try {
      const payload = await readJsonBody(req);
      const { storeName, items, deltaType } = payload; // deltaType: 'upsert' | 'delete' | 'replace'

      if (storeName && Array.isArray(items)) {
        const release = await dbMutex.acquire();
        try {
          if (!centralStore[storeName]) {
          centralStore[storeName] = [];
        }

        if (deltaType === 'replace') {
          centralStore[storeName] = items;
        } else if (deltaType === 'delete') {
          const deleteIds = new Set(items.map((it) => it.id));
          centralStore[storeName] = centralStore[storeName].filter((it) => !deleteIds.has(it.id));
        } else {
          // Upsert / Merge
          const itemMap = new Map(centralStore[storeName].map((it) => [it.id, it]));
          for (const it of items) {
            itemMap.set(it.id, it);
          }
          centralStore[storeName] = Array.from(itemMap.values());
        }

        persistStore();
        } finally {
          release();
        }
        const senderId = req.headers['x-client-id'] || null;
        broadcast('sync', { storeName, items, deltaType }, senderId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return true;
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
      return true;
    }
  }

  // 5. التحقق من صحة تسجيل الدخول من أجهزة الشبكة (LAN Client Authentication)
  if (pathname === '/api/lan/auth' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const username = (body.username || '').trim().toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';

      // أعد تحميل البيانات من القرص عشان ناخد أي تعديلات يدوية
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, 'utf8');
          const diskData = JSON.parse(raw);
          if (diskData && Array.isArray(diskData.users) && diskData.users.length > 0) {
            centralStore.users = diskData.users;
          }
        }
      } catch { /* استمر بالبيانات الحالية في الذاكرة */ }

      // الحساب الاحتياطي دايماً متاح (admin / admin123) حتى لو مش موجود في القائمة
      const defaultAdmin = {
        id: 'u1',
        username: 'admin',
        password: 'admin123',
        name: 'مدير المحل',
        role: 'admin',
        createdAt: new Date().toISOString(),
        mustChangePassword: true,
      };

      if (!Array.isArray(centralStore.users) || centralStore.users.length === 0) {
        centralStore.users = [defaultAdmin];
        persistStore();
      }

      // ابحث في المستخدمين — لو مش لاقي، جرب الحساب الاحتياطي
      let user = centralStore.users.find(
        (u) => (u.username || '').trim().toLowerCase() === username
      );
      if (!user && username === 'admin') {
        user = defaultAdmin;
      }

      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }));
        return true;
      }

      const isValid = verifyPassword(password, user.password);
      if (!isValid) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }));
        return true;
      }


      const sessionUser = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        mustChangePassword: !!(user.mustChangePassword || user.password === 'admin123'),
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          user: sessionUser,
          users: centralStore.users,
        })
      );
      return true;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
      return true;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
  return true;
}

module.exports = {
  handleLanRequest,
  getLanIpAddresses,
  broadcast,
  /** يُستخدم فقط في الاختبارات — يعيد ضبط الـ centralStore لحالة فارغة */
  resetStoreForTesting() {
    centralStore = {};
  },
};

