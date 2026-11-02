# MOBPOS Companion (تطبيق الموبايل)

تطبيق React + TypeScript + Vite لإدارة فروع محلات الموبايلات، ويعمل كتطبيق أندرويد/iOS عبر Capacitor أو كتطبيق ويب مثبّت (PWA).

## التشغيل المحلي

```bash
cd mobile
npm install
npm run dev
```

## بناء نسخة الويب

```bash
npm run build
```

## نسخة الآيفون والويب (PWA)

الآيفون لا يسمح بتثبيت ملف IPA غير موقّع بحساب Apple Developer. لذلك نوفر نسخة PWA مجانية تعمل من المتصفح:

**الرابط:** https://msharaf221.github.io/MOBPOS-V2/

### خطوات التثبيت على الآيفون
1. افتح الرابط في **Safari** (وليس تطبيق آخر).
2. اضغط زر المشاركة (المربع الذي يخرج منه سهم).
3. اختر **إضافة إلى الشاشة الرئيسية / Add to Home Screen**.
4. افتح التطبيق من الأيقونة، وسجّل بيانات الربط من إعدادات الديسكتوب.

> ملاحظة: سفاري لا يدعم `BarcodeDetector`، لذلك قارئ الباركود يستخدم ZXing تلقائياً. الكاميرا تحتاج HTTPS (الرابط أعلاه آمن).

### التحديث والنشر
- أي دفع يمس `mobile/**` أو `shared/**` يشغّل workflow **Deploy Mobile PWA** وينشر النسخة الجديدة تلقائياً على GitHub Pages.
- يمكن التشغيل اليدوي من: Actions → Deploy Mobile PWA → Run workflow.
- الـService Worker (`public/sw.js`) يخزن هيكل التطبيق بعد أول فتح، ويعمل التطبيق بدون إنترنت مع الاعتماد على الكاش المحلي لبيانات الفروع.

## بناء APK / IPA

```bash
cd mobile
npm run build
npx cap sync android
npx cap sync ios
```

- الأندرويد: ملف APK يُبنى تلقائياً عبر `Build Android APK` ويُرفع على صفحة الإصدارات.
- iOS: ملف IPA يُبنى unsigned (بدون توقيع) عبر `Build iOS`، ويصلح للتوقيع لاحقاً عبر Sideloadly/AltStore أو بحساب Apple Developer. للتثبيت المباشر بدون توقيع استخدم نسخة PWA.
