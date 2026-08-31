// ============================================================
//  مبيعات الفئات — دوال نقية (Pure helpers)
// ------------------------------------------------------------
//  منطق كارت «المبيعات حسب الفئة» في لوحة التحكم كان محبوس جوه
//  المكوّن (inline useMemo) فمش قابل للاختبار. اتنقل هنا كدوال نقية:
//
//   • تحديد نطاق الشهر الحالي (من أول يوم في الشهر لأول يوم في الشهر الجاي).
//   • تجميع مبيعات الشهر الحالي حسب الفئة وترتيبها تنازليًا.
//   • تجهيز صفوف الرسم والقائمة (أعلى N + شريحة «أخرى»).
//
//  الدوال هنا لا تلمس React ولا IndexedDB — عشان تتختبر بسهولة.
// ============================================================

import type { Category, InventoryItem, Sale } from '../types';

/** شريحة واحدة: اسم الفئة + قيمة مبيعاتها. */
export interface CategorySalesSlice {
  name: string;
  value: number;
}

/** نطاق زمني مغلق من البداية ومفتوح من النهاية: [start, end). */
export interface DateRange {
  /** أول لحظة في النطاق (بالميلي ثانية، بالتوقيت المحلي). */
  start: number;
  /** أول لحظة **بعد** النطاق ( exclusive ) — أول يوم في الشهر التالي. */
  end: number;
  /** مفتاح ثابت للشهر (مثل "2026-08") يُستخدم كمُعامل اعتمادية لـ useMemo. */
  key: string;
}

/** الاسم الافتراضي للمنتجات اللي فئتها مش معرفة أو ممسوحة. */
export const UNCATEGORIZED_LABEL = 'أخرى';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * تحويل أي صيغة تاريخ متخزنة إلى طابع زمني (ms).
 *
 * ليه دالة مخصصة بدل `new Date(x)`؟
 *   • `'2026-08-01'` (تاريخ بدون وقت) بيُفسَّر كـ **UTC midnight**، ففي أي
 *     منطقة زمنية سالبة (مثل الأمريكتين) يرجع يوم 31 يوليو محليًا — أي شهر
 *     غلط. بنبنيه يدويًا بالتوقيت المحلي لتطابق حدود اليوم/الشهر ما يراه
 *     المستخدم في الشاشة.
 *   • القيم الفاسدة ترجع `null` بدل `NaN` اللي بيفلت من كل المقارنات.
 */
export function parseStoredDate(value: string | number | Date | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  const dateOnly = DATE_ONLY_PATTERN.exec(raw);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]) - 1;
    const day = Number(dateOnly[3]);
    const local = new Date(year, month, day);
    return Number.isNaN(local.getTime()) ? null : local.getTime();
  }

  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * نطاق الشهر الحالي بالتوقيت **المحلي**: من أول لحظة في أول يوم للشهر
 * إلى أول لحظة في أول يوم من الشهر التالي.
 *
 * النهاية مفتوحة (exclusive) عشان أي مبيعة مسجّلة في آخر لحظات الشهر
 * (23:59:59.999) متتقصّش بالغلط، وفي نفس الوقت أي مبيعة في الشهر الجاي
 * متتعدّش. الكارت يتصفّر تلقائيًا مع بداية كل شهر جديد لأن النطاق يتحسب
 * من `now` في كل مرة.
 */
export function getCurrentMonthRange(now: Date | number = new Date()): DateRange {
  const base = now instanceof Date ? now : new Date(now);
  const year = base.getFullYear();
  const month = base.getMonth();

  return {
    start: new Date(year, month, 1).getTime(),
    end: new Date(year, month + 1, 1).getTime(),
    key: `${year}-${String(month + 1).padStart(2, '0')}`
  };
}

/** هل التاريخ المخزّن يقع داخل نطاق الشهر الحالي؟ */
export function isWithinCurrentMonth(
  value: string | number | Date | undefined | null,
  now: Date | number = new Date()
): boolean {
  return isWithinRange(value, getCurrentMonthRange(now));
}

/** هل التاريخ المخزّن يقع داخل نطاق زمني معطى [start, end)؟ */
export function isWithinRange(
  value: string | number | Date | undefined | null,
  range: DateRange
): boolean {
  const time = parseStoredDate(value);
  if (time === null) return false;
  return time >= range.start && time < range.end;
}

export interface AggregateSalesByCategoryInput {
  sales: Sale[];
  inventory: InventoryItem[];
  categories: Category[];
  /** لحظة «الآن» (قابلة للتحديد في الاختبارات). الافتراضي: وقت الاستدعاء. */
  now?: Date | number;
  /** نطاق صريح بدل الشهر الحالي (مفيد للاختبارات وإعادة الاستخدام). */
  range?: DateRange;
}

/**
 * تجميع مبيعات **الشهر الحالي فقط** حسب الفئة، مرتبة تنازليًا حسب القيمة.
 *
 * - يتجاهل المبيعات خارج نطاق الشهر، والمبيعات ذات التاريخ الفاسد.
 * - يتجاهل بنود الفواتير اللي منتجها مش موجود في المخزون (نفس سلوك الكارت
 *   القديم — لو المنتج اتمسح من المخزون ما نقدرش نحدد فئته).
 * - المنتج بدون فئة معروفة يتجمّع تحت «أخرى».
 */
export function aggregateSalesByCategory({
  sales,
  inventory,
  categories,
  now,
  range
}: AggregateSalesByCategoryInput): CategorySalesSlice[] {
  const monthRange = range ?? getCurrentMonthRange(now);

  const categoryNameById = new Map(categories.map(c => [c.id, c.name]));
  const inventoryById = new Map(inventory.map(i => [i.id, i]));

  const totals = new Map<string, number>();

  for (const sale of sales) {
    if (!isWithinRange(sale.createdAt, monthRange)) continue;

    for (const item of sale.items) {
      const invItem = inventoryById.get(item.inventoryId);
      if (!invItem) continue;

      const name = categoryNameById.get(invItem.categoryId) || UNCATEGORIZED_LABEL;
      totals.set(name, (totals.get(name) ?? 0) + (item.total || 0));
    }
  }

  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    // الأعلى مبيعًا أولًا، والاسم كفاصل ثابت عند تساوي القيم (ترتيب حتمي).
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'ar'));
}

/** عدد الفئات الظاهرة افتراضيًا في كارت «المبيعات حسب الفئة». */
export const DEFAULT_TOP_CATEGORY_COUNT = 5;

/** مفتاح ثابت لصف/شريحة «أخرى» المجمّعة (مختلف عن أي اسم فئة حقيقي). */
export const OTHER_GROUP_KEY = '__other__';

export interface CategoryBreakdownRow extends CategorySalesSlice {
  /** مفتاح ثابت للتفريعة (اسم الفئة، أو OTHER_GROUP_KEY للشريحة المجمّعة). */
  key: string;
  /** ترتيب الفئة بين الأعلى مبيعًا — يُستخدم لاختيار اللون. (-1 للمجمّعة) */
  colorIndex: number;
  /** true للشريحة المجمّعة «أخرى» نفسها. */
  isOtherGroup: boolean;
  /** true للفئات الصغيرة اللي اندمجت جوه شريحة «أخرى». */
  groupedIntoOther: boolean;
}

export interface CategoryBreakdown {
  /** صفوف الرسم الدائري: أعلى الفئات (+ شريحة «أخرى» لو العدد كبير). */
  slices: CategoryBreakdownRow[];
  /** صفوف القائمة وهي مطوية: نفس صفوف الرسم (أعلى N فقط). */
  collapsed: CategoryBreakdownRow[];
  /** صفوف القائمة بعد «عرض المزيد»: كل الفئات بترتيب تنازلي. */
  expanded: CategoryBreakdownRow[];
  /** إجمالي مبيعات الشهر (أساس النِسب المئوية). */
  total: number;
  /** هل في فئات إضافية مخفية خلف «عرض المزيد»؟ */
  hasMore: boolean;
}

export interface CategoryBreakdownOptions {
  /** عدد الفئات الظاهرة افتراضيًا (والمرسومة كشرائح مستقلة). الافتراضي 5. */
  topCount?: number;
  /** أقصى عدد شرائح في الرسم قبل تجميع الباقي في «أخرى». الافتراضي topCount + 1. */
  maxSlices?: number;
  /** اسم الشريحة المجمّعة. الافتراضي «أخرى». */
  otherLabel?: string;
}

/**
 * تجهيز صفوف الرسم والقائمة من نتيجة `aggregateSalesByCategory`.
 *
 * - الرسم يرسم أعلى `topCount` فئة، ولو عدد الفئات أكبر من `maxSlices`
 *   تتجمّع الباقي في شريحة واحدة «أخرى» — فالرسم يفضل مقروء مهما كترت الفئات.
 * - القائمة المطوية = صفوف الرسم بالظبط (الألوان متطابقة).
 * - القائمة المفتوحة = نفس الصفوف، لكن شريحة «أخرى» تتفرد لفئاتها الأصلية
 *   بنفس اللون الرمادي، فمجموعها يفضل مساويًا للشريحة اللي حلّت محلها.
 */
export function buildCategoryBreakdown(
  slices: CategorySalesSlice[],
  options: CategoryBreakdownOptions = {}
): CategoryBreakdown {
  const topCount = Math.max(1, options.topCount ?? DEFAULT_TOP_CATEGORY_COUNT);
  const maxSlices = Math.max(topCount + 1, options.maxSlices ?? topCount + 1);
  const otherLabel = options.otherLabel ?? UNCATEGORIZED_LABEL;

  const sorted = [...slices].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'ar'));
  const total = sorted.reduce((sum, s) => sum + (s.value || 0), 0);

  // التجميع يفيد فقط لو العدد فعلاً أكبر من الحد — غير كده كل فئة تاخد شريحة
  // ولون خاص بها (تجميع فئة واحدة تحت «أخرى» هيبقى مريب).
  const groupTail = sorted.length > maxSlices;
  const top = groupTail ? sorted.slice(0, topCount) : sorted;
  const tail = groupTail ? sorted.slice(topCount) : [];

  const topRows: CategoryBreakdownRow[] = top.map((slice, index) => ({
    ...slice,
    key: slice.name,
    colorIndex: index,
    isOtherGroup: false,
    groupedIntoOther: false
  }));

  const tailRows: CategoryBreakdownRow[] = tail.map(slice => ({
    ...slice,
    key: slice.name,
    colorIndex: -1,
    isOtherGroup: false,
    groupedIntoOther: true
  }));

  const otherValue = tailRows.reduce((sum, row) => sum + (row.value || 0), 0);
  const otherRow: CategoryBreakdownRow | null = tailRows.length
    ? {
        name: otherLabel,
        value: otherValue,
        key: OTHER_GROUP_KEY,
        colorIndex: -1,
        isOtherGroup: true,
        groupedIntoOther: false
      }
    : null;

  const donutRows: CategoryBreakdownRow[] = otherRow ? [...topRows, otherRow] : topRows;

  return {
    slices: donutRows,
    collapsed: donutRows,
    expanded: [...topRows, ...tailRows],
    total,
    hasMore: tailRows.length > 0
  };
}

/**
 * النسبة المئوية من الإجمالي — مع حماية الحالات الحدية:
 * - إجمالي صفر → 0.
 * - فئة صغيرة جدًا (أقل من 0.5%) → 0 مع إشارة `isRoundedToZero` عشان الواجهة
 *   تعرض «<1%» بدل صفر مضلّل.
 */
export function categoryPercent(value: number, total: number): { percent: number; isRoundedToZero: boolean } {
  if (!total || !Number.isFinite(total)) return { percent: 0, isRoundedToZero: false };
  const safeValue = Number.isFinite(value) ? value : 0;
  const percent = Math.round((safeValue / total) * 100);
  return { percent, isRoundedToZero: percent === 0 && safeValue > 0 };
}
