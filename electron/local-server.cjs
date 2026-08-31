// ============================================================
//  سيرفر محلي خفيف لتوزيع ملفات dist داخل تطبيق سطح المكتب
//  بدون أي اعتماد على إلكترون — قابل للاختبار بـ node مباشرة
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const PREFERRED_PORT = 8420;   // سجّله في Google OAuth origins: http://127.0.0.1:8420
const PORT_RANGE = 20;         // يجرّب 8420..8439 لو المنفذ مشغول
const REAL_DIST_DIR = fs.existsSync(DIST_DIR)
  ? fs.realpathSync.native(DIST_DIR)
  : DIST_DIR;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

// رؤوس الحماية — تُرسل مع كل رد (حتى صفحات الخطأ) عشان المتصفح المدمج
// في إلكترون يتصرف زي ما الويب بيتصرف بالظبط:
//  - nosniff       يمنع تخمين نوع الملف وتنفيذه كسكربت
//  - DENY          يمنع تضمين التطبيق داخل iframe (Clickjacking)
//  - Referrer      يمنع تسريب الروابط الكاملة لأي طرف خارجي
//  - Permissions   يقفل الكاميرا/المايك/الموقع افتراضياً
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), ' +
    'fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), ' +
    'midi=(), payment=(), picture-in-picture=(), screen-wake-lock=(), serial=(), usb=(), ' +
    'xr-spatial-tracking=()',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
};

/** يدمج رؤوس الحماية مع أي رؤوس خاصة بالرد. */
function withSecurityHeaders(headers = {}) {
  return { ...SECURITY_HEADERS, ...headers };
}

function createServer() {
  return http.createServer((req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, withSecurityHeaders({ Allow: 'GET, HEAD' }));
        res.end('Method Not Allowed');
        return;
      }
      let urlPath;
      try {
        urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      } catch {
        res.writeHead(400, withSecurityHeaders());
        res.end('Bad Request');
        return;
      }
      if (urlPath === '/') urlPath = '/index.html';

      const filePath = path.normalize(path.join(DIST_DIR, urlPath));
      // منع الخروج من مجلد dist
      if (!filePath.startsWith(DIST_DIR + path.sep) && filePath !== DIST_DIR) {
        res.writeHead(403, withSecurityHeaders());
        res.end('Forbidden');
        return;
      }

      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        stat = null;
      }
      let servedPath = stat?.isFile() ? filePath : path.join(DIST_DIR, 'index.html');
      // Resolve symlinks as well as .. segments; packaged assets must never
      // expose a file outside the distribution directory.
      const realServedPath = fs.existsSync(servedPath) ? fs.realpathSync.native(servedPath) : '';
      if (!realServedPath || !realServedPath.startsWith(REAL_DIST_DIR + path.sep)) {
        res.writeHead(404, withSecurityHeaders());
        res.end('Not Found');
        return;
      }
      const ext = path.extname(realServedPath).toLowerCase();
      const headers = withSecurityHeaders({
        'Content-Type': MIME[ext] || 'application/octet-stream',
      });
      if (req.method === 'HEAD') {
        res.writeHead(200, headers);
        res.end();
        return;
      }
      res.writeHead(200, headers);
      fs.createReadStream(realServedPath).pipe(res);
    } catch (err) {
      res.writeHead(500, withSecurityHeaders());
      res.end('Server error');
    }
  });
}

function startServer(preferredPort = PREFERRED_PORT) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    let port = preferredPort;

    const tryListen = () => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < preferredPort + PORT_RANGE) {
          server.removeAllListeners('error');
          port++;
          tryListen();
        } else {
          reject(err);
        }
      });
      server.listen(port, '127.0.0.1', () => resolve({ server, port }));
    };

    tryListen();
  });
}

module.exports = { startServer, createServer, PREFERRED_PORT, SECURITY_HEADERS };
