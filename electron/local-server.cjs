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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function createServer() {
  return http.createServer((req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';

      const filePath = path.normalize(path.join(DIST_DIR, urlPath));
      // منع الخروج من مجلد dist
      if (!filePath.startsWith(DIST_DIR + path.sep) && filePath !== DIST_DIR) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        // SPA fallback
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        fs.createReadStream(path.join(DIST_DIR, 'index.html')).pipe(res);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500);
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

module.exports = { startServer, createServer, PREFERRED_PORT };
