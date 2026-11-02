/* ============================================================
   MOBPOS Companion — Service Worker (PWA)
   الهدف: تشغيل التطبيق المثبت على الآيفون/الأندرويد بدون إنترنت
   لقدر الإمكان، مع عدم تخزين أي طلبات خاصة بـ Supabase.
   ============================================================ */

const CACHE = 'mobpos-pwa-v1';
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // لا نتدخل في غير طلبات GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // الطلبات الخارجية (Supabase / الخطوط / أي API) لا تُخزَّن أبداً
  if (url.origin !== self.location.origin) return;

  // طلبات المدى (فيديو/صوت) لا تصلح للتخزين المؤقت
  if (request.headers.has('range')) return;

  // صفحات التنقل: الشبكة أولاً ثم الكاش عند انقطاع النت
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match('./index.html')) ||
            (await caches.match('./')) ||
            Response.error()
          );
        })
    );
    return;
  }

  // الملفات الثابتة: الكاش أولاً ثم الشبكة (مع تحديث الكاش)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached || Response.error());
    })
  );
});
