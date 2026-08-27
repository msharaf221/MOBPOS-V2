# 📋 مهام وتحسينات مؤجلة — المجموعة B (TODO_LATER)

تم توثيق هذه النقاط بناءً على المراجعة الشاملة للنظام، ليتم دراستها واتخاذ قرار بشأن تنفيذها في مراحل لاحقة.

---

## 🔍 فهرس المهام المؤجلة

1. [B1 — هشاشة بصمة الجهاز (Device Fingerprint Fragility)](#b1--هشاشة-بصمة-الجهاز-device-fingerprint-fragility)
2. [B2 — سباق التحديث في `useLocalStorage` (Race Condition)](#b2--سباق-التحديث-في-uselocalstorage-race-condition)
3. [B3 — تتبع `dist/index.html` في Git](#b3--تتبع-distindexhtml-في-git)
4. [B4 — غياب HMR أثناء تطوير تطبيق Electron](#b4--غياب-hmr-أثناء-تطوير-تطبيق-electron)
5. [B5 — إضافة ترويسة سياسة أمان المحتوى (Content Security Policy - CSP)](#b5--إضافة-ترويسة-سياسة-أمان-المحتوى-content-security-policy---csp)
6. [B6 — ترقية تشفير كلمات السر من SHA-256 إلى PBKDF2](#b6--ترقية-تشفير-كلمات-السر-من-sha-256-إلى-pbkdf2)

---

### B1 — هشاشة بصمة الجهاز (Device Fingerprint Fragility)

* **الملف المعني:** `src/license/device.ts`
* **المشكلة:**
  تعتمد الدالة `getDeviceId()` على دمج عدة إشارات في هاش واحد (Canvas rendering, WebGL renderer/vendor, Web Audio API, User Agent, Screen resolution, Timezone, Hardware concurrency).
  * عند تحديث كرت الشاشة (Graphics driver update)، تتغير بصمة WebGL/Canvas.
  * عند تحديث المتصفح أو Electron، يتغير User Agent.
  * عند تغيير دقة الشاشة أو توصيل شاشة خارجية، يتغير `screen.width/height`.
  * **النتيجة:** يتغير الهاش الناتج فجأة، ويظهر للعميل خطأ `device_mismatch` ويُقفل النظام في وجهه دون ارتكاب أي خطأ، مما يتطلب تدخل الدعم الفني لإجراء `POST /release` يدوياً.
* **الحل المقترح:**
  1. تخفيف الإشارات شديدة التقلب (مثل أبعاد الشاشة المتغيرة بدقة العرض).
  2. اعتماد أسلوب **المطابقة بالأغلبية (Fuzzy / Majority Matching)**: حفظ مجموعة من الإشارات المستقلة (مثلاً 6 إشارات)، واعتبار الجهاز متطابقاً إذا تطابقت 4 أو 5 إشارات على الأقل، بدلاً من هاش واحد صارم ينهار بتغير بت واحد.
  3. في بيئة Electron، يمكن الاعتماد على معرّفات نظام التشغيل الأكثر استقراراً (مثل machine-id أو UUID للجهاز).

---

### B2 — سباق التحديث في `useLocalStorage` (Race Condition)

* **الملف المعني:** `src/hooks/useLocalStorage.ts`
* **المشكلة:**
  تعتمد دالة `setValue` على القيمة المغلقة `storedValue` داخل الـ closure في وقت إنشاء الدالة. في حال حدوث استدعاءين متتاليين وسريعين لـ `setValue` في نفس دورة المعالجة (Event loop tick)، فإن التحديث الثاني قد يقرأ القيمة القديمة من الـ closure ويكتبها فوق التحديث الأول، مما يؤدي إلى فقدان بيانات.
* **الحل المقترح:**
  1. استخدام النمط الدالي (Functional updater) في React `setStoredValue(prev => ...)`.
  2. قراءة القيمة الحالية من `localStorage` مباشرة أو تمرير دالة التحويل واستخدام نتيجتها في الحفظ المتزامن لـ `localStorage` و React State معاً.

---

### B3 — تتبع `dist/index.html` في Git

* **الملف المعني:** `dist/index.html`
* **المشكلة:**
  يتم تجميع التطبيق بالكامل كملف Single File HTML بحجم يقارب ~1.4 ميجابايت متتبع في مستودع Git. مع كل عملية بناء (`npm run build`) يتغير الهاش والمحتوى بالكامل، مما يسبب:
  * تعارضات دمج (Merge conflicts) شبه دائمة في الـ Pull Requests.
  * تضخم حجم مستودع Git وتاريخ الالتزامات (Git history bloat).
* **الحل المقترح:**
  1. إزالة مجلد `dist/` من التتبع وإضافته لملف `.gitignore`.
  2. بناء الحزمة تلقائياً عبر GitHub Actions CI/CD عند إطلاق Release جديد أو النشر للاستضافة.
  3. *(ملاحظة: إذا كانت منصة الاستضافة الحالية تعتمد على سحب ملف HTML مبني مسبقاً، يُراعى توفير Build step في الاستضافة قبل إزالته).*

---

### B4 — غياب HMR أثناء تطوير تطبيق Electron

* **الملف المعني:** `package.json` (`npm run electron:dev`) و `electron/main.cjs`
* **المشكلة:**
  أمر التطوير `electron:dev` يقوم بعمل `npm run build && electron .`، مما يعني إعادة بناء كاملة للواجهة في كل مرة وتجربة تطوير بطيئة تفتقر للـ Hot Module Replacement (HMR).
* **اعتبارات حرجة عند التنفيذ:**
  * تطبيق Electron مصمم عمداً ليعمل على سيرفر محلي بمنفذ وأصل ثابت `http://127.0.0.1:8420`.
  * تغيير الـ Origin أثناء التطوير إلى منفذ Vite الافتراضي (مثل `5173`) يؤدي إلى:
    1. كسر توثيق Google OAuth (لأن Authorized JavaScript Origins مسجلة للمنفذ 8420).
    2. عزل قاعدة بيانات IndexedDB (لأن المتصفح يعزل IndexedDB لكل Origin).
* **الحل المقترح:**
  * تهيئة Vite dev server ليعمل على المنفذ `8420` أثناء وضع التطوير مع Electron، أو استخدام Vite Proxy، مع الحفاظ على مسار preload و IPC handlers متوافقة.

---

### B5 — إضافة ترويسة سياسة أمان المحتوى (Content Security Policy - CSP)

* **الملف المعني:** `index.html` و `electron/main.cjs`
* **المشكلة:**
  لا توجد ترويسة CSP صريحة (`<meta http-equiv="Content-Security-Policy" ...>`)، وتظهر تحذيرات في وحدة تحكم المطور في Electron.
  *(الأولوية منخفضة لأن أمان Electron مطبق بالفعل عبر `contextIsolation: true` و `sandbox: true` و `nodeIntegration: false`).*
* **شروط إلزامية للـ CSP عند إضافتها:**
  يجب أن تسمح السياسة بالاتصال بالنطاقات الحيوية التالية لضمان استمرار عمل النظام دون انقطاع:
  * `https://mobpos.onrender.com` (سيرفر التفعيل)
  * `https://accounts.google.com` و `https://www.googleapis.com` (النسخ الاحتياطي Google Drive)
  * نطاق مشروع Supabase الخاص بالمستخدم (للمزامنة)
  * `data:` و `blob:` للصور وتصدير الفواتير والتقارير.

---

### B6 — ترقية تشفير كلمات السر من SHA-256 إلى PBKDF2

* **الملفات المعنية:** `src/utils/passwords.ts` و `src/license/crypto.ts`
* **المشكلة:**
  تستخدم الدوال الحالية SHA-256 بجولة واحدة (Single-round SHA-256). رغم استخدام Salt مع كلمة سر الماستر، فإن كلمات سر موظفي المحل تُجزأ بدون Salt فريد لكل مستخدم. ونظراً لسرعة معالجة SHA-256 العالية، فإنها تكون عرضة لهجمات القوة الغاشمة (Brute-force) وجداول Rainbow في حال تسريب قاعدة البيانات.
* **الحل المقترح:**
  1. الترقية إلى **PBKDF2** مع `HMAC-SHA-256` بعدد دورات لا يقل عن 100,000 جولة (100k iterations) باستخدام واجهة Web Crypto API المدمجة في المتصفح (`crypto.subtle.deriveBits` / `crypto.subtle.importKey`) بدون أي مكتبات خارجية.
  2. توليد ملح عشوائي فريد (Salt لا يقل عن 16 بايت) لكل مستخدم وتخزينه بصيغة قياسية (مثل `pbkdf2:100000:salt:hash`).
  3. الحفاظ على التوافق الرجعي والترقية التلقائية للهاشات القديمة عند تسجيل الدخول القادم.
