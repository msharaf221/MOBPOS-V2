# سيرفر تفعيل MOBPOS 🔐 (v2)

سيرفر صغير يفرض قاعدة: **كل مفتاح ترخيص يعمل مرة واحدة فقط، على جهاز واحد فقط.**

## ما الجديد في v2؟

| الميزة | الوصف |
|---|---|
| **فصل الصلاحيات** | `ADMIN_TOKEN` إلزامي لحماية العمليات الإدارية (`/revoke` و `/release` و `/key/:id`)، و`ACTIVATION_TOKEN` للعميل |
| **Rate Limiting مدمج** | حماية تلقائية من الإغراق والتخمين على `/activate` و `/verify` (30 طلب/دقيقة لكل IP) |
| **Fail-Closed Startup** | يرفض السيرفر البدء تماماً إذا لم يتم ضبط `ADMIN_TOKEN` لحماية السيرفر من العمل بدون أمان |
| **Machine Token** | عند أول تفعيل يُصدر السيرفر سراً عشوائياً مرتبطاً بالمفتاح + الجهاز، يحتفظ به العميل محلياً ويقدّمه عند كل إعادة تحقق |
| **Re-verification** | العميل يعيد التحقق مع السيرفر دورياً (مرة كل 24 ساعة) عبر `POST /verify` — أي إلغاء أو نقل للمفتاح يُفرَض تلقائياً على جهاز العميل |
| **`/revoke`** | إلغاء مفتاح نهائياً (لو سُرِّب مثلاً) — أول تحقق بعده يمسح الترخيص من جهاز العميل |
| **`/release`** | فك ارتباط مفتاح بجهازه (دعم فني / انتقال لجهاز جديد) — يعود المفتاح حراً كأنه لم يُفعَّل |
| **ترقية تلقائية** | سجلات v1 القديمة تحصل على Machine Token تلقائياً عند أول تفعيل/تحقق من نفس الجهاز |

## كيف يعمل؟

1. العميل يفعّل النظام بمفتاح → التطبيق يبصم الجهاز (بصمة عتادية قوية: Canvas + WebGL + Audio) ويرسل `keyId + deviceId` للسيرفر.
2. السيرفر يسجّل المفتاح باسم الجهاز **نهائياً** ويُصدر **Machine Token** يعيده للعميل ليحفظه مع الترخيص.
3. أي محاولة لتفعيل نفس المفتاح من جهاز آخر → **رفض دائم** (`used_on_other_device`).
4. إعادة التفعيل على نفس الجهاز (بعد فورمات أو مسح بيانات المتصفح) → مسموحة، ويُعاد إرسال نفس الـ Token.
5. عند كل إقلاع للتطبيق (بحد أقصى مرة/24 ساعة) يستدعي العميل `POST /verify` بـ `keyId + deviceId + machineToken`:
   - ✅ مطابقة → يستمر العمل طبيعياً.
   - ⛔ مرفوض (ملغى/توكن خاطئ/جهاز آخر) → يُمسح الترخيص محلياً فوراً.
   - 📴 السيرفر unreachable → يستمر العمل (سماحية أوفلاين) ويُعاد المحاولة لاحقاً.

> بدون هذا السيرفر، التطبيق يربط المفتاح بالجهاز محلياً فقط (حماية أضعف) ولا توجد إعادة تحقق دورية.

## التشغيل

```bash
cd activation-server
npm install
ADMIN_TOKEN=your-strong-admin-secret npm start   # يشتغل على المنفذ 8787
```

### متغيرات البيئة:

| المتغير | الوظيفة | الحالة | الافتراضي |
|---|---|---|---|
| `ADMIN_TOKEN` | توكن الإدارة السري لحماية `/revoke` و `/release` و `/key/:id` | **إلزامي** (السيرفر لن يبدأ بدونه) | لا يوجد |
| `ACTIVATION_TOKEN` | توكن حماية اختياري لنقاط العميل (`/activate` و `/verify`) | اختياري | فارغ |
| `PORT` | منفذ السيرفر | اختياري | `8787` |
| `DATA_FILE` | مسار ملف التخزين | اختياري | `data/activations.json` |

⚠️ **تنبيه:** إذا لم يتم تعيين `ADMIN_TOKEN` في متغيرات البيئة، سيرفض السيرفر العمل ويغلق فوراً (`Fail-Closed`).

## ربطه بالتطبيق

في ملف `src/license/keys.ts`:

```ts
export const ACTIVATION_SERVER_URL: string = 'https://your-server.example.com';
export const ACTIVATION_SERVER_TOKEN: string = 'نفس-قيمة-ACTIVATION_TOKEN-لو-مضبوطة';
```

ثم أعد بناء التطبيق (`npm run build`) ووزّع النسخة الجديدة.

> **ملاحظة أمنية:** لا تضع `ADMIN_TOKEN` في كود العميل (`src/license/keys.ts`) أبداً! توكن الإدارة للإدارة فقط عبر سطر الأوامر (curl/scripts).

## نقاط النهاية (API)

| Method | Path | الحماية | الوظيفة |
|---|---|---|---|
| `POST` | `/activate` | Rate Limit + `ACTIVATION_TOKEN` (اختياري) | تفعيل مفتاح: `{ keyId, deviceId }` → يعيد `machineToken` |
| `POST` | `/verify` | Rate Limit + `ACTIVATION_TOKEN` (اختياري) | إعادة تحقق دوري: `{ keyId, deviceId, machineToken }` |
| `POST` | `/revoke` | **`ADMIN_TOKEN` (إلزامي)** | إلغاء مفتاح نهائياً (إدارة): `{ keyId }` |
| `POST` | `/release` | **`ADMIN_TOKEN` (إلزامي)** | فك ارتباط مفتاح بجهازه (دعم فني): `{ keyId }` |
| `GET` | `/key/:id` | **`ADMIN_TOKEN` (إلزامي)** | استعلام حالة مفتاح (مفعّل / غير مفعّل / ملغى) |
| `GET` | `/health` | عام (مفتوح) | فحص عمل السيرفر (يعيد `version: 2`) |

### أمثلة الاستخدام

```bash
# 1. تفعيل (عميل)
curl -X POST https://your-server/activate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer CLIENT_TOKEN' \
  -d '{"keyId":"abc123","deviceId":"DEV-3fa9c1b2e8d04a71"}'

# 2. إعادة التحقق (ما يستدعيه التطبيق تلقائياً)
curl -X POST https://your-server/verify \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer CLIENT_TOKEN' \
  -d '{"keyId":"abc123","deviceId":"DEV-3fa9c1b2e8d04a71","machineToken":"..."}'

# 3. إلغاء مفتاح مسرَّب (إداري - يتطلب ADMIN_TOKEN)
curl -X POST https://your-server/revoke \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"keyId":"abc123"}'

# 4. فك ارتباط مفتاح لينتقل لجهاز جديد (إداري - يتطلب ADMIN_TOKEN)
curl -X POST https://your-server/release \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"keyId":"abc123"}'

# 5. استعلام حالة مفتاح (إداري - يتطلب ADMIN_TOKEN)
curl -X GET https://your-server/key/abc123 \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

## ⚠️ ملاحظات الترقية من v1

- **البصمة المحسّنة (Canvas + WebGL + Audio) قد تُنتج `deviceId` مختلفاً** عن النسخ القديمة على نفس الجهاز.
  أي جهاز مُفعَّل بنسخة قديمة سيظهر بعد الترقية كأنه جهاز آخر (`device_mismatch`).
  **الحل:** استخدم `POST /release` بـ `ADMIN_TOKEN` لفك ارتباط المفتاح، ثم يُفعّله المستخدم من جديد على نفس الجهاز.
- سجلات v1 على السيرفر لا تحتاج أي تعديل يدوي — تُرقّى تلقائياً بأول تفعيل/تحقق من الجهاز المرتبط.

## النشر

السيرفر Express بسيط ويعمل على أي منصة:

- **Render.com** (مجاني): New → Web Service → اربط الريبو → أمر البدء `cd activation-server && npm install && npm start` → أضف في Environment:
  - `ADMIN_TOKEN`: سر إداري قوي وعشوائي (إلزامي).
  - `ACTIVATION_TOKEN`: توكن عميل اختياري (إن رغبت).
- **Railway / Fly.io**: نفس الطريقة.
- **خاص (VPS)**:
  ```bash
  ADMIN_TOKEN=سر-إداري-قوي ACTIVATION_TOKEN=توكن-العميل PORT=8787 pm2 start activation-server/server.js --name mobpos-activation
  ```

⚠️ **توصيات هامة:**
- انسخ ملف `data/activations.json` بانتظام — هو سجل كل التفعيلات والـ Machine Tokens.
- استخدم HTTPS دائماً.
- غيّر `ADMIN_TOKEN` بشكل دوري ولا تشاركه مع أي شخص.
