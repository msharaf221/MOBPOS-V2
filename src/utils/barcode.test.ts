/**
 * اختبارات توليد الباركود وفهرس الكميات — الدوال اللي كانت سبب بطء/مشاكل
 * إضافة المنتجات من شاشة المخزون.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { IMEIUnit, InventoryItem } from '../types';
import { calculateEAN13Checksum, generateBarcode } from './barcode.ts';
import { buildImeiStockIndex, groupCountsBy } from './stockCounts.ts';

/** التحقق من خانة المراجعة (check digit) بطريقة EAN-13 القياسية. */
function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

test('generated barcodes are always valid EAN-13 with the 622 prefix', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateBarcode([]);
    assert.equal(code.length, 13, 'length must be 13');
    assert.ok(code.startsWith('622'), 'egypt prefix');
    assert.ok(isValidEan13(code), `${code} failed EAN-13 checksum`);
  }
});

test('generated barcodes never reuse a barcode that already exists', () => {
  // 500 باركود متتالي على قائمة ممتلئة جزئيًا — مفيش تكرار خالص
  const taken: string[] = [];
  for (let i = 0; i < 500; i++) {
    const code = generateBarcode(taken);
    assert.ok(!taken.includes(code), `duplicate barcode generated: ${code}`);
    taken.push(code);
  }
  assert.equal(new Set(taken).size, 500);
});

test('existing barcodes are compared after trimming and empty values are ignored', () => {
  // القائمة القديمة ممكن تكون فيها مسافات أو قيم فاضية/undefined
  const code = generateBarcode(['  ', undefined, null, '', ' 6221234567890 ']);
  assert.ok(isValidEan13(code));
  assert.notEqual(code, '6221234567890');
});

test('calculateEAN13Checksum matches the published EAN-13 check digits', () => {
  // أمثلة معروفة من مواصفة GS1
  assert.equal(calculateEAN13Checksum('400638133393'), '1'); // 4006381333931
  assert.equal(calculateEAN13Checksum('590123412345'), '7'); // 5901234123457
  assert.equal(calculateEAN13Checksum('622123456789'), '1'); // 6221234567891
});

// ────────────────────────── stock indexes ──────────────────────────

const makeUnit = (id: string, inventoryId: string, status: IMEIUnit['status']): IMEIUnit =>
  ({ id, inventoryId, status } as unknown as IMEIUnit);

const units: IMEIUnit[] = [
  makeUnit('u1', 'a', 'available'),
  makeUnit('u2', 'a', 'available'),
  makeUnit('u3', 'a', 'sold'),
  makeUnit('u4', 'b', 'sold'),
  makeUnit('u5', 'b', 'available')
];

test('buildImeiStockIndex counts only available units and keeps unit order', () => {
  const index = buildImeiStockIndex(units);
  assert.equal(index.availableCounts.get('a'), 2);
  assert.equal(index.availableCounts.get('b'), 1);
  assert.equal(index.availableCounts.get('missing'), undefined);
  assert.deepEqual(index.availableUnits.get('a')?.map(u => u.id), ['u1', 'u2']);
});

test('availableStockOf mirrors the old per-item filter for both item kinds', () => {
  const index = buildImeiStockIndex(units);
  const legacy = (item: InventoryItem) =>
    item.hasIMEI
      ? units.filter(u => u.inventoryId === item.id && u.status === 'available').length
      : item.quantity;

  const items = [
    { id: 'a', hasIMEI: true, quantity: 0 },
    { id: 'b', hasIMEI: true, quantity: 0 },
    { id: 'c', hasIMEI: true, quantity: 0 },
    { id: 'd', hasIMEI: false, quantity: 12 }
  ] as unknown as InventoryItem[];
  for (const item of items) {
    assert.equal(index.availableStockOf(item), legacy(item), `mismatch for ${item.id}`);
  }
});

test('groupCountsBy replaces per-row list.filter for counter chips', () => {
  const inventory = [{ categoryId: 'x' }, { categoryId: 'x' }, { categoryId: 'y' }];
  const counts = groupCountsBy(inventory, item => item.categoryId);
  assert.equal(counts.get('x'), 2);
  assert.equal(counts.get('y'), 1);
  assert.equal(counts.get('z') || 0, 0);
});
