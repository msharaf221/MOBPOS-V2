# خطة إعادة الهيكلة والمراجعة الشاملة — MOBPOS-V2

> **البرانش:** `refactor/full-audit-restructure`  
> **التاريخ:** 2026-10-17  
> **الترتيب المتفق عليه:** هيكلة → أمان → أداء → موبايل

---

## 1. الوضع الحالي (ملخص سريع)

### ما تم بالفعل (إيجابي)
- تقسيم الـ store إلى **slices** (`src/hooks/store/use*Slice.ts`)
- استخراج منطق الأعمال إلى **Services** (`SalesService`, `PurchasesService`, `MaintenanceService`, ...)
- وجود `StoreUpdates` + `useStoreDispatcher` مع دعم `increment` / `upsert` / `delete` / `replace`
- وجود دوال ذرّية جاهزة: `persistMultiStoreDeltas` و `runAtomicTransaction` في `useIndexedDB.ts`
- إصلاحات كثيرة من تقرير `docs/AUDIT-2026-09.md` (مرتجعات غير قابلة للتعديل على الفاتورة الأصلية، كلمات السر الفارغة، إلخ)

### المشاكل الهيكلية المتبقية

| # | المشكلة | الخطورة | الملف / المنطقة |
|---|---------|---------|------------------|
| H1 | المكوّنات ما زالت عملاقة (POS ~95KB، Settings ~115KB، MaintenanceBoard ~52KB) | عالية | `src/components/*` |
| H2 | `App.tsx` يحمل منطق LAN sync + license + routing | عالية | `src/App.tsx` |
| H3 | الذرّية موجودة لكن **غير موصّلة** في `useStoreDispatcher` — كل مخزن يُكتب لوحده | حرجة | `useStoreDispatcher.ts` + `useIndexedDB.ts` |
| H4 | تكرار منطق تطبيق الـ deltas بين `App.tsx` و `useStoreDispatcher` | متوسطة | App + dispatcher |
| H5 | بعض الـ slices ما زالت رفيعة والـ Services غير مكتملة لكل المجالات | متوسطة | inventory / safes / side accounts |
| H6 | صلاحيات الواجهة فقط (إخفاء القائمة) بدون بوابة في `renderPage` | متوسطة (أمان) | `App.tsx` / `Layout.tsx` |

---

## 2. مرحلة الهيكلة (الأولوية الحالية)

### 2.1 توصيل الذرّية (Atomic Multi-Store Writes) — **أولوية قصوى**

**الهدف:** أي عملية مالية/مخزنية (`createSale`, `processSaleReturn`, `createPurchase`, `deliverMaintenance`, ...) تكتب كل المخازن في **معاملة IndexedDB واحدة**.

**الخطة التقنية:**
1. توسيع `useStoreDispatcher` ليحسب `previous` و `next` لكل مخزن من الـ deltas ثم يستدعي `persistMultiStoreDeltas`.
2. الإبقاء على تحديث React state محلياً بعد نجاح الكتابة الذرّية (أو بشكل متفائل مع تراجع عند الفشل).
3. إبقاء `pushDelta` للـ LAN بعد نجاح الكتابة.

### 2.2 استخراج منطق LAN / Sync من `App.tsx`

- إنشاء `src/hooks/useLanSync.ts` (أو `src/services/LanSyncBridge.ts`)
- نقل: `fetchCentralData`، `pushCentralData`، `connectLanStream`، تطبيق الـ deltas
- `App.tsx` يبقى مسؤولاً عن الشاشات والترخيص فقط

### 2.3 تقسيم المكوّنات العملاقة (تدريجي)

| المكوّن | التقسيم المقترح |
|---------|------------------|
| `POS.tsx` | `POSCart`, `POSCheckout`, `POSParkedSales`, `POSProductGrid`, hooks للسلة |
| `Settings.tsx` | تبويبات منفصلة: `GeneralTab`, `BackupTab`, `LANTab`, `UsersTab`, `PrintTab` |
| `MaintenanceBoard.tsx` | `TicketList`, `TicketDetail`, `DeliverModal`, `AddPartModal` |
| `Inventory.tsx` | `InventoryTable`, `InventoryForm`, `StockAdjust` |

### 2.4 توحيد تطبيق الـ Deltas

- دالة مشتركة `applyStoreDeltas(setters, deltas)` تُستخدم من:
  - `useStoreDispatcher`
  - جسر الـ LAN في `App` / `useLanSync`
  - `SyncEngine`

---

## 3. مرحلة الأمان (بعد الهيكلة)

من تقرير التدقيق + فحص إضافي:

| # | البند | الحالة |
|---|------|--------|
| S1 | كلمة سر فارغة | ✅ تم إصلاحه سابقاً |
| S2 | حدود الباقة (`maxUsers` / `maxProducts` / ...) غير مطبّقة | مفتوح |
| S3 | الصلاحيات في الواجهة فقط | مفتوح — إضافة بوابة في `renderPage` |
| S4 | `updateMaintenance` يسمح بتعديل `collectedAmount` مباشرة | مفتوح |
| S5 | الحساب الجانبي ينزل الخزنة تحت الصفر | مفتوح |
| S6 | مراجعة `activation-server` و مسارات الترخيص | مطلوب |

---

## 4. مرحلة الأداء

- تفعيل فهارس IndexedDB v5+ في الاستعلامات الفعلية (بحث IMEI / باركود)
- `React.memo` + تقسيم قوائم طويلة مع `usePagination` الموجود
- تقليل إعادة التصيير من `useStore` (selectors أو context منفصل للبيانات الثقيلة)
- مراجعة `SyncEngine` وحجم الـ payload على الشبكة

---

## 5. مرحلة الموبايل

- مراجعة `mobile/` (Capacitor)
- توحيد الـ API مع الـ LAN Hub
- اختبار تدفق العميل على الشبكة المحلية
- بناء APK / iOS workflows الموجودة في `.github/workflows`

---

## 6. ترتيب التنفيذ على هذا البرانش

1. ✅ إنشاء البرانش + هذه الوثيقة
2. 🔄 توصيل الذرّية في الـ dispatcher
3. استخراج `useLanSync` من `App.tsx`
4. دالة مشتركة لتطبيق الـ deltas
5. إصلاحات أمان متبقية من التدقيق
6. تقسيم تدريجي لـ POS / Settings (حسب الحجم)
7. أداء + موبايل

---

## 7. ملاحظات

- كل التغييرات على البرانش `refactor/full-audit-restructure` فقط.
- يُفضّل PR واحد كبير أو عدة PRs متسلسلة حسب اكتمال كل مرحلة.
- الرجوع لتقرير `docs/AUDIT-2026-09.md` كمرجع للبنود المفتوحة.
