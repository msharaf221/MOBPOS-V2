/**
 * اختبارات وحدة لمنطق كارت «المبيعات حسب الفئة»:
 *   • فلترة مبيعات الشهر الحالي (من أول الشهر لآخره).
 *   • تجميع الفئات وترتيبها تنازليًا.
 *   • أعلى 5 فئات + شريحة «أخرى» + صفوف «عرض المزيد».
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Category, InventoryItem, Sale } from '../types';

import {
  aggregateSalesByCategory,
  buildCategoryBreakdown,
  categoryPercent,
  getCurrentMonthRange,
  isWithinCurrentMonth,
  isWithinRange,
  parseStoredDate,
  OTHER_GROUP_KEY,
  UNCATEGORIZED_LABEL,
  DEFAULT_TOP_CATEGORY_COUNT
} from './salesByCategory.ts';

// ============================================================
//  بيانات تجهيز (Fixtures) — كلها بتوقيت محلي محلي (Local) عشان
//  الاختبارات متتأثرش بمنطقة الـ CI الزمنية.
// ============================================================

/** لحظة ثابتة داخل الشهر المستهدف: 31 أغسطس 2026، 6:45 مساءً. */
const NOW = new Date(2026, 7, 31, 18, 45, 12, 345);

const category = (id: string, name: string): Category => ({
  id,
  name,
  type: 'accessory'
});

const inventoryItem = (id: string, categoryId: string): InventoryItem => ({
  id,
  name: `منتج ${id}`,
  code: id,
  barcode: id,
  categoryId,
  costPrice: 0,
  sellPrice: 0,
  quantity: 10,
  minQuantity: 1,
  hasIMEI: false,
  createdAt: '2026-01-01T00:00:00.000Z'
});

const sale = (
  id: string,
  createdAt: string,
  lines: Array<{ inventoryId: string; total: number }>
): Sale => {
  const total = lines.reduce((sum, l) => sum + l.total, 0);
  return {
    id,
    invoiceNumber: id,
    customerId: '',
    items: lines.map((l, index) => ({
      id: `${id}-${index}`,
      inventoryId: l.inventoryId,
      quantity: 1,
      unitPrice: l.total,
      costPrice: 0,
      total: l.total,
      returnedQuantity: 0
    })),
    subtotal: total,
    discount: 0,
    total,
    paid: total,
    remaining: 0,
    profit: 0,
    paymentMethod: 'cash',
    cashierId: '',
    safeId: '',
    notes: '',
    createdAt
  };
};

// ============================================================
//  1) نطاق الشهر الحالي
// ============================================================

test('getCurrentMonthRange spans from the 1st of the month to the 1st of the next one', () => {
  const range = getCurrentMonthRange(NOW);

  assert.equal(range.start, new Date(2026, 7, 1, 0, 0, 0, 0).getTime());
  assert.equal(range.end, new Date(2026, 8, 1, 0, 0, 0, 0).getTime());
  assert.equal(range.key, '2026-08');
});

test('getCurrentMonthRange rolls over to a new key when the month changes', () => {
  assert.equal(getCurrentMonthRange(new Date(2026, 0, 1)).key, '2026-01');
  assert.equal(getCurrentMonthRange(new Date(2026, 11, 31, 23, 59)).key, '2026-12');
  // ديسمبر → يناير: السنة كمان تتقدّم
  const january = getCurrentMonthRange(new Date(2027, 0, 5));
  assert.equal(january.key, '2027-01');
  assert.equal(january.start, new Date(2027, 0, 1).getTime());
});

test('isWithinCurrentMonth keeps only sales of the current month', () => {
  assert.equal(isWithinCurrentMonth('2026-08-01T00:00:00.000Z', NOW), true);
  assert.equal(isWithinCurrentMonth('2026-08-31T23:59:59.999', NOW), true);
  assert.equal(isWithinCurrentMonth(new Date(2026, 7, 15), NOW), true);

  // آخر لحظة في يوليو = بره الشهر
  assert.equal(isWithinCurrentMonth(new Date(2026, 6, 31, 23, 59, 59, 999), NOW), false);
  // أول لحظة في سبتمبر = بره الشهر
  assert.equal(isWithinCurrentMonth(new Date(2026, 8, 1, 0, 0, 0, 0), NOW), false);
  // شهر من سنة تانية بنفس الرقم = بره الشهر
  assert.equal(isWithinCurrentMonth(new Date(2025, 7, 15), NOW), false);
});

test('isWithinRange is inclusive at the start and exclusive at the end', () => {
  const range = getCurrentMonthRange(NOW);
  assert.equal(isWithinRange(new Date(range.start), range), true);
  assert.equal(isWithinRange(new Date(range.end - 1), range), true);
  assert.equal(isWithinRange(new Date(range.end), range), false);
  assert.equal(isWithinRange(new Date(range.start - 1), range), false);
});

test('isWithinCurrentMonth ignores invalid or empty dates', () => {
  assert.equal(isWithinCurrentMonth('', NOW), false);
  assert.equal(isWithinCurrentMonth('not-a-date', NOW), false);
  assert.equal(isWithinCurrentMonth(undefined, NOW), false);
  assert.equal(isWithinCurrentMonth(null, NOW), false);
  assert.equal(isWithinCurrentMonth(new Date('غير صالح'), NOW), false);
});

// ============================================================
//  2) صيغ التواريخ المخزنة
// ============================================================

test('parseStoredDate reads date-only strings as LOCAL dates, not UTC midnight', () => {
  // `new Date('2026-08-01')` بيُفسَّر كـ UTC midnight — في منطقة زمنية سالبة
  // (زي UTC-5) ده يبقى 31 يوليو محليًا، أي شهر غلط. هنا لازم يفضل 1 أغسطس.
  assert.equal(parseStoredDate('2026-08-01'), new Date(2026, 7, 1).getTime());
  assert.equal(parseStoredDate('2026-01-01'), new Date(2026, 0, 1).getTime());

  const range = getCurrentMonthRange(NOW);
  assert.equal(isWithinRange('2026-08-01', range), true);
  assert.equal(isWithinRange('2026-08-31', range), true);
  // بره النطاق، ومفيش انزلاق لشهر مجاور
  assert.equal(isWithinRange('2026-07-31', range), false);
  assert.equal(isWithinRange('2026-09-01', range), false);
});

test('parseStoredDate handles ISO strings, timestamps, Date objects and garbage', () => {
  assert.equal(parseStoredDate('2026-08-15T12:00:00.000Z'), Date.parse('2026-08-15T12:00:00.000Z'));
  assert.equal(parseStoredDate(NOW.getTime()), NOW.getTime());
  assert.equal(parseStoredDate(NOW), NOW.getTime());
  assert.equal(parseStoredDate(''), null);
  assert.equal(parseStoredDate('  '), null);
  assert.equal(parseStoredDate(Number.NaN), null);
  assert.equal(parseStoredDate(new Date('x')), null);
});

// ============================================================
//  3) تجميع مبيعات الشهر حسب الفئة
// ============================================================

const categories = [category('c1', 'هواتف'), category('c2', 'إكسسوارات'), category('c3', 'قطع غيار')];
const inventory = [inventoryItem('i1', 'c1'), inventoryItem('i2', 'c2'), inventoryItem('i3', 'c3')];

test('aggregateSalesByCategory ignores sales from previous months', () => {
  const sales = [
    sale('s-old', new Date(2026, 6, 31, 23, 59, 59).toISOString(), [{ inventoryId: 'i1', total: 9999 }]),
    sale('s-old-2', new Date(2026, 6, 2).toISOString(), [{ inventoryId: 'i1', total: 555 }]),
    sale('s-new', new Date(2026, 7, 3).toISOString(), [{ inventoryId: 'i1', total: 1000 }])
  ];

  const result = aggregateSalesByCategory({ sales, inventory, categories, now: NOW });

  assert.deepEqual(result, [{ name: 'هواتف', value: 1000 }]);
});

test('aggregateSalesByCategory sums the whole current month, including its last second', () => {
  const sales = [
    sale('s-first', new Date(2026, 7, 1, 0, 0, 0, 0).toISOString(), [{ inventoryId: 'i1', total: 200 }]),
    sale('s-mid', new Date(2026, 7, 15).toISOString(), [{ inventoryId: 'i1', total: 300 }]),
    sale('s-last', new Date(2026, 7, 31, 23, 59, 59, 999).toISOString(), [{ inventoryId: 'i2', total: 400 }]),
    // سبتمبر — بعد انتهاء النطاق
    sale('s-next', new Date(2026, 8, 1, 0, 0, 0, 0).toISOString(), [{ inventoryId: 'i2', total: 7000 }])
  ];

  const result = aggregateSalesByCategory({ sales, inventory, categories, now: NOW });

  assert.deepEqual(result, [
    { name: 'هواتف', value: 500 },
    { name: 'إكسسوارات', value: 400 }
  ]);
});

test('aggregateSalesByCategory sorts categories descending by value', () => {
  const sales = [
    sale('s1', new Date(2026, 7, 5).toISOString(), [
      { inventoryId: 'i2', total: 150 },
      { inventoryId: 'i3', total: 900 },
      { inventoryId: 'i1', total: 400 }
    ])
  ];

  const result = aggregateSalesByCategory({ sales, inventory, categories, now: NOW });

  assert.deepEqual(
    result.map(r => r.name),
    ['قطع غيار', 'هواتف', 'إكسسوارات']
  );
  assert.deepEqual(
    result.map(r => r.value),
    [900, 400, 150]
  );
});

test('aggregateSalesByCategory falls back to «أخرى» and skips unknown products', () => {
  const orphanCategoryItem = inventoryItem('i9', 'category-deleted');
  const sales = [
    sale('s1', new Date(2026, 7, 5).toISOString(), [
      { inventoryId: 'i9', total: 250 },
      { inventoryId: 'ghost', total: 1000 } // منتج غير موجود في المخزون
    ])
  ];

  const result = aggregateSalesByCategory({
    sales,
    inventory: [...inventory, orphanCategoryItem],
    categories,
    now: NOW
  });

  assert.deepEqual(result, [{ name: UNCATEGORIZED_LABEL, value: 250 }]);
});

test('aggregateSalesByCategory returns an empty list when there are no sales this month', () => {
  const sales = [sale('s-old', new Date(2026, 6, 10).toISOString(), [{ inventoryId: 'i1', total: 50 }])];

  assert.deepEqual(aggregateSalesByCategory({ sales, inventory, categories, now: NOW }), []);
  assert.deepEqual(aggregateSalesByCategory({ sales: [], inventory, categories, now: NOW }), []);
});

test('aggregateSalesByCategory accepts an explicit range (reusable for other periods)', () => {
  const sales = [
    sale('s-july', new Date(2026, 6, 10).toISOString(), [{ inventoryId: 'i1', total: 120 }]),
    sale('s-aug', new Date(2026, 7, 10).toISOString(), [{ inventoryId: 'i1', total: 30 }])
  ];

  const july: { start: number; end: number; key: string } = {
    start: new Date(2026, 6, 1).getTime(),
    end: new Date(2026, 7, 1).getTime(),
    key: '2026-07'
  };

  assert.deepEqual(aggregateSalesByCategory({ sales, inventory, categories, range: july }), [
    { name: 'هواتف', value: 120 }
  ]);
});

// ============================================================
//  4) أعلى 5 فئات + «أخرى» + «عرض المزيد»
// ============================================================

const slice = (name: string, value: number) => ({ name, value });

test('buildCategoryBreakdown keeps small lists ungrouped', () => {
  const input = [slice('أ', 50), slice('ب', 30), slice('ج', 20)];
  const breakdown = buildCategoryBreakdown(input, { topCount: 5 });

  assert.equal(breakdown.total, 100);
  assert.equal(breakdown.hasMore, false);
  assert.equal(breakdown.slices.length, 3);
  assert.deepEqual(breakdown.slices.map(s => s.key), ['أ', 'ب', 'ج']);
  assert.deepEqual(breakdown.slices.map(s => s.colorIndex), [0, 1, 2]);
  assert.deepEqual(breakdown.collapsed, breakdown.slices);
  assert.deepEqual(breakdown.expanded, breakdown.slices);
});

test('buildCategoryBreakdown shows the top 5 and merges the tail into «أخرى»', () => {
  const input = [
    slice('الأول', 500),
    slice('الثاني', 400),
    slice('الثالث', 300),
    slice('الرابع', 200),
    slice('الخامس', 100),
    slice('السادس', 40),
    slice('السابع', 30),
    slice('الثامن', 20),
    slice('التاسع', 10)
  ];

  const breakdown = buildCategoryBreakdown(input, { topCount: DEFAULT_TOP_CATEGORY_COUNT });

  // الرسم: أعلى 5 + شريحة مجمّعة
  assert.deepEqual(breakdown.slices.map(s => s.key), [
    'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', OTHER_GROUP_KEY
  ]);
  assert.deepEqual(breakdown.slices.map(s => s.colorIndex), [0, 1, 2, 3, 4, -1]);
  assert.equal(breakdown.slices[5].name, UNCATEGORIZED_LABEL);
  assert.equal(breakdown.slices[5].isOtherGroup, true);
  assert.equal(breakdown.slices[5].value, 100); // 40 + 30 + 20 + 10
  assert.equal(breakdown.total, 1600);

  // القائمة المطوية = صفوف الرسم بالظبط
  assert.deepEqual(breakdown.collapsed, breakdown.slices);
  assert.equal(breakdown.hasMore, true);

  // «عرض المزيد» يفرد شريحة «أخرى» لفئاتها الأصلية — بنفس المجموع
  assert.deepEqual(breakdown.expanded.map(s => s.name), [
    'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع'
  ]);
  assert.equal(breakdown.expanded.length, input.length);
  assert.equal(breakdown.expanded[5].groupedIntoOther, true);
  assert.deepEqual(breakdown.expanded.map(s => s.key).includes(OTHER_GROUP_KEY), false);
  const expandedTailSum = breakdown.expanded
    .filter(s => s.groupedIntoOther)
    .reduce((sum, s) => sum + s.value, 0);
  assert.equal(expandedTailSum, 100);
});

test('buildCategoryBreakdown sorts its input descending before slicing', () => {
  const input = [slice('صغير', 10), slice('كبير', 900), slice('متوسط', 90)];
  const breakdown = buildCategoryBreakdown(input, { topCount: 5 });

  assert.deepEqual(breakdown.slices.map(s => s.name), ['كبير', 'متوسط', 'صغير']);
});

test('buildCategoryBreakdown handles an empty month gracefully', () => {
  const breakdown = buildCategoryBreakdown([], { topCount: 5 });

  assert.equal(breakdown.total, 0);
  assert.equal(breakdown.hasMore, false);
  assert.deepEqual(breakdown.slices, []);
  assert.deepEqual(breakdown.expanded, []);
});

// ============================================================
//  5) النِسب المئوية
// ============================================================

test('categoryPercent rounds percentages and flags values below 1%', () => {
  assert.deepEqual(categoryPercent(250, 1000), { percent: 25, isRoundedToZero: false });
  assert.deepEqual(categoryPercent(3, 1000), { percent: 0, isRoundedToZero: true });
  assert.deepEqual(categoryPercent(0, 1000), { percent: 0, isRoundedToZero: false });
  // إجمالي صفر (شهر لسه بلا مبيعات) — بدون قسمة على صفر
  assert.deepEqual(categoryPercent(0, 0), { percent: 0, isRoundedToZero: false });
  assert.deepEqual(categoryPercent(50, Number.NaN), { percent: 0, isRoundedToZero: false });
});
