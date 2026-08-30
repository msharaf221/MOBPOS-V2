# 📸 صور الدعاية والإعلان — MOBPOS

لقطات شاشة حقيقية من داخل التطبيق (نقطة البيع، لوحة التحكم، المخزون، IMEI، الصيانة،
المالية، ...) بالوضعين **الفاتح** و**الداكن**، مولّدة آلياً ببيانات تجريبية واقعية
لسوق الموبايلات المصري — جاهزة للاستخدام في الإعلانات ومنشورات السوشيال ميديا.

الصور موجودة في [`screenshots/`](./screenshots/) وبجانبها
[`manifest.json`](./screenshots/manifest.json) فيه وصف كل صورة وتاريخ توليدها.

## إعادة توليد الصور

```bash
npm install            # مرة واحدة
npm run dev            # شغّل التطبيق في terminal منفصل
npm run screens:setup  # مرة واحدة — بينزّل Chromium بلا واجهة
npm run screens:capture
```

اختيارات مفيدة لسكربت الالتقاط:

```bash
# الثيمات: light | dark | midnight (الذهبي)
node scripts/capture-marketing.cjs --themes light,dark,midnight

# لقطات محددة فقط
node scripts/capture-marketing.cjs --pages dashboard,pos,finance

# اسم المحل الظاهر في الصور + مقاس مختلف
node scripts/capture-marketing.cjs --shop "اسم محلك" --width 1920 --height 1080
```

## إزاي بتشتغل من غير ما تلمس التطبيق؟

- السكربت بيستخدم **اعتراض طلبات** (request interception) عشان يستبدل وحدة
  `src/license/keys.ts` في الذاكرة فقط بمفتاح عام مؤقت مولّد محلياً، ويعطّل سيرفر
  التفعيل لنفس الجلسة — فيقدر يعدي شاشة الترخيص ويسجّل دخول **من غير ما يغيّر أي
  سطر في الكود على الديسك**.
- البيانات التجريبية (فواتير، مخزون، أجهزة IMEI، صيانة، عملاء، خزائن) بتتولد من
  `scripts/marketing/demo-data.cjs` وبتتحقن في IndexedDB مؤقتاً — **مش جزء من
  التطبيق** ومش بتأثر على بيانات أي مستخدم حقيقي.
- التوليد deterministic (بذرة ثابتة) عشان الصور تطلع نفسها في كل مرة، والتواريخ
  نسبية لتاريخ التشغيل فدايماً بتبان "طازة".

## الملفات

| الملف | الوصف |
|---|---|
| `scripts/install-headless-chrome.cjs` | تنزيل Chromium بلا واجهة من npm (بيشتغل حتى مع حجب Google storage) |
| `scripts/capture-marketing.cjs` | سكربت الالتقاط الرئيسي (Puppeteer) |
| `scripts/marketing/demo-data.cjs` | مولّد البيانات التجريبية المتسقة حسابياً |
