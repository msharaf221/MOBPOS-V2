# الأمان — MOBPOS Security

هذا الملف بيوثّق إزاي النظام بيتعامل مع نتائج فحص الأمان (URL scan) وإيه اللي
اتصلّح في الكود وإيه اللي محتاج إجراء من لوحة التحكم.

---

## 1. رؤوس الحماية (Security Headers)

الرؤوس بتتظبط في **٣ أماكن** عشان تغطي كل طريقة تشغيل للنظام:

| مكان التشغيل | الملف | الطريقة |
|---|---|---|
| النسخة الويب (Vercel) | `vercel.json` | `headers` على `/(.*)` |
| تطبيق سطح المكتب (Electron) | `electron/main.cjs` + `electron/local-server.cjs` | `onHeadersReceived` + رؤوس السيرفر المحلي |
| خادم التفعيل | `activation-server/server.js` | middleware قبل أي راوت |

### الرؤوس المُرسَلة

| الرأس | القيمة | الثغرة اللي بيقفلها |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'` + `frame-ancestors 'none'` + مصادر جوجل/Supabase الموثوقة فقط | XSS / حقن سكربتات |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | تسريب الروابط الكاملة لأطراف ثالثة |
| `Permissions-Policy` | كاميرا/مايك/موقع/USB… كلها `()` | وصول سكربتات خارجية لصلاحيات المتصفح |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | هبوط الاتصال لـ HTTP |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | XS-Leaks (مع إبقاء نافذة Google OAuth شغالة) |
| `Cross-Origin-Resource-Policy` | `same-origin` | سحب الموارد من مواقع تانية |
| `X-Permitted-Cross-Domain-Policies` | `none` | سياسات Flash/PDF القديمة |
| `Origin-Agent-Cluster` | `?1` | عزل الأصل على مستوى العملية |

> **مهم عن CSP:** `'unsafe-inline'` لسه موجود في `style-src` لأن Tailwind والتصميم
> بيستخدموا inline styles، و`script-src` فيه `'unsafe-inline'` لأن البناء
> single-file (`vite-plugin-singlefile`) بيضمّن السكربت جوه الـ HTML.
> ده مقبول لأن مفيش أي محتوى من المستخدم بيتحقن في الصفحة كـ HTML خام.

### التحقق

فيه أداتين مختلفتين، كل واحدة ليها وقتها:

| الأمر | بيفحص إيه | امتى |
|---|---|---|
| `npm run verify:security:config` | **الكود نفسه** — الرؤوس في `vercel.json`، وجود robots/sitemap/privacy، إعدادات إلكترون وخادم التفعيل وSupabase | قبل الدمج (بيشتغل تلقائي في CI) |
| `npm run verify:security` | **الموقع المنشور** — بيطلب الصفحة فعلاً ويتأكد إن الرؤوس وصلت للمتصفح | بعد كل deploy |

```bash
npm run verify:security:config                # أوفلاين، مش محتاج إنترنت
npm run verify:security                       # الدومين الافتراضي
npm run verify:security -- https://your.com   # دومين تاني
```

الاتنين بيرجّعوا exit code `1` لو أي حاجة ناقصة.

### CI

> **⚠️ محتاج تفعيل مرة واحدة منك:** ملف الـ workflow محفوظ في `ci/ci.yml` مش في
> `.github/workflows/` لأن توكن GitHub في جلسات Arena ملوش صلاحية `workflows`.
> فعّله بأمر واحد من جهازك:
>
> ```bash
> npm run setup:ci     # بينسخ ci/ci.yml و ci/release.yml لمكانهم
> git add .github/workflows/
> git commit -m "ci: enable workflows"
> git push
> ```

`ci/ci.yml` بيشتغل على **كل Pull Request** وكل دفعة على `main`:

1. `npm run typecheck`
2. `npm test`
3. `npm run verify:security:config` — 34 فحص
4. `npm run build`
5. التأكد إن `robots.txt` و `sitemap.xml` و `privacy.html` وصلوا `dist/`
6. التأكد إن مفيش بيانات تواصل وهمية في `public/`

يعني لو حد شال رأس حماية أو ملف بالغلط، الـ CI هيقع قبل الدمج بدل ما الفينيدنج
ترجع في فحص الأمان الجاي.

> `release.yml` منفصل وبيشتغل على tags بس (بناء ونشر نسخة الويندوز).

---

## 2. سياسة الخصوصية (PDPL — قانون 151 لسنة 2020)

- الصفحة: `public/privacy.html` → منشورة على `/privacy.html`
- مربوطة من: شاشة الدخول، الإعدادات ← عن النظام، شاشة البداية في `index.html`،
  وسم `<link rel="privacy-policy">`، و`<noscript>`.
- بتغطي: البيانات المجمّعة، الأساس القانوني، المشاركة مع الغير، مدد الاحتفاظ،
  الأمن، حقوق صاحب البيانات، نقل البيانات خارج مصر، وبيانات التواصل.

**قناة التواصل:** `muhamedhussein89@gmail.com` — ده الإيميل الرسمي لطلبات
الخصوصية (وصول/تصحيح/محو) والإبلاغ عن الثغرات. لو غيّرته يوم، لازم تحدّثه في
`public/privacy.html` و `public/brochure.html` وهنا في نفس الوقت.

---

## 3. robots.txt و sitemap.xml

- `public/robots.txt` — بيمنع فهرسة `/api`, `/admin`, `/master`, `/settings`,
  `/users`, `/license`, `/backup`, `/reports` وأي URL فيه query string،
  وبيرفض روبوتات تجميع بيانات التدريب، وفيه سطر `Sitemap:`.
- `public/sitemap.xml` — الصفحات العامة الثلاثة فقط.

**بعد النشر:** لو غيّرت الدومين، حدّث الروابط في الملفين + `verify-security-headers.cjs`،
وقدّم الـ sitemap في Google Search Console.

---

## 4. Public Storage Bucket Listing

الفحص لقى `https://storage.googleapis.com/vercel` مفتوح للقراءة.

**ده بكت تبع منصة Vercel نفسها، مش بتاعك** — بيستضيف أصول البناء العامة للمنصة،
وإحنا ملناش صلاحية عليه. مفيش حاجة تتصلّح في الريبو ده بخصوصه، والمفروض
يتقفل كـ *false positive / vendor-owned asset* في تقرير الفحص.

اللي بيخصك فعلاً هو تخزين Supabase لو استخدمته يوم:

- `supabase/schema.sql` فيه دلوقتي بلوك **Supabase Storage hardening**:
  بيقفل أي bucket عام، بيفعّل RLS، وبيمسح أي policy متساهلة للـ `anon`.
- استعلام التحقق (لازم يرجّع صفر صفوف):

  ```sql
  select id, name, public from storage.buckets where public;
  ```

بيانات المزامنة نفسها معزولة بالفعل بـ Row Level Security على `owner_id = auth.uid()`.

---

## 5. DNSSEC

الفحص بيقول إن `vercel.app` مش موقّع بـ DNSSEC. **الزون دي مملوكة لـ Vercel**،
فمش ممكن تفعّل DNSSEC عليها من ناحيتك.

**الحل الصح:** استخدم دومين خاص بيك (مثلاً `mobpos.example.com`)، وبعدين:

1. فعّل DNSSEC من مزوّد الـ DNS بتاعك.
2. انشر سجل `DS` عند المُسجِّل (Registrar) لإكمال سلسلة الثقة.
3. اتحقق:
   ```bash
   dig +dnssec DS your-domain.com @1.1.1.1
   dig +dnssec your-domain.com @1.1.1.1   # لازم تشوف RRSIG
   ```

لحد ما ده يحصل، الفينيدنج دي **خارج نطاق الكود** ولازم تتسجّل كـ
*accepted risk / vendor-managed*.

---

## 6. أمان خادم التفعيل

- `ADMIN_TOKEN` و `ACTIVATION_TOKEN` إلزاميان (fail-closed عند الإقلاع).
- Rate limiting: 30 طلب/دقيقة لكل IP.
- مقارنة التوكنات بـ `timingSafeEqual` (ضد Timing Attacks).
- CORS: افتراضياً مفتوح؛ اضبط `ALLOWED_ORIGINS` بقائمة مفصولة بفواصل
  لقفله على أصولك بس — أي أصل تاني بيترفض بـ 403.

  ```bash
  ALLOWED_ORIGINS="https://mob-pos-v2.vercel.app,http://127.0.0.1:8420"
  ```

- `Cache-Control: no-store` على كل الردود (ردود التفعيل شخصية).

---

## 7. أمان تطبيق سطح المكتب

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- منع التنقل خارج الأصل المحلي، والروابط الخارجية بتتفتح في المتصفح.
- Google OAuth بس هو اللي مسموح له يفتح نافذة داخلية (بمطابقة دومين دقيقة).
- صلاحيات المتصفح (كاميرا/مايك/موقع/إشعارات) **مرفوضة كلها** عبر
  `setPermissionRequestHandler` — الحافظة بس مسموحة.
- السيرفر المحلي بيمنع الخروج من مجلد `dist` (path traversal + symlinks).

---

## الإبلاغ عن ثغرة

لو لقيت ثغرة أمنية، ابعت على **muhamedhussein89@gmail.com** ومتنشرهاش علناً قبل
الإصلاح. متفتحش GitHub Issue بثغرة أمنية — التذاكر علنية.
