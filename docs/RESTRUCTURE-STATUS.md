# حالة إعادة الهيكلة — MOBPOS-V2

**البرانش:** `refactor/full-audit-restructure`

## مكتمل (مرحلة الهيكلة)

| البند | الحالة |
|------|--------|
| `applyDeltas.ts` مصدر واحد للـ deltas | ✅ |
| `storeRegistry.ts` تسجيل مخازن IndexedDB | ✅ |
| `useStoreDispatcher` + `persistMultiStoreDeltas` | ✅ |
| `useIndexedDB` + `applyPersisted` | ✅ |
| `useLanSync` مستخرج من App | ✅ |
| App props صحيحة للمكوّنات | ✅ |
| `components/pos/types.ts` | ✅ |
| Services + store slices | ✅ (سابق) |

## متبقي (تحسين تدريجي)
- تقسيم UI لـ POS / Settings / Maintenance إلى ملفات فرعية
- مرحلة الأمان ثم الأداء ثم الموبايل
