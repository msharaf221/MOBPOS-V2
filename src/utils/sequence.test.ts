import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDocumentNumber, parseSequence } from './sequence.ts';

test('parseSequence بيقرأ الصيغة الصحيحة بس', () => {
  assert.equal(parseSequence('INV-2026-0007', 'INV', 2026), 7);
  assert.equal(parseSequence('inv-2026-0007', 'INV', 2026), 7);
  assert.equal(parseSequence('INV-2025-0007', 'INV', 2026), null, 'سنة مختلفة');
  assert.equal(parseSequence('PUR-2026-0007', 'INV', 2026), null, 'بادئة مختلفة');
  assert.equal(parseSequence('INV-2026', 'INV', 2026), null);
  assert.equal(parseSequence(undefined, 'INV', 2026), null);
});

test('الرقم التالي = أعلى تسلسل + 1 (مش عدد السجلات + 1)', () => {
  const numbers = ['INV-2026-0001', 'INV-2026-0002', 'INV-2026-0003'];
  assert.equal(nextDocumentNumber(numbers, 'INV', 4, 2026), 'INV-2026-0004');
});

test('حذف فاتورة من النص مايكررش رقم — ده كان بالظبط الباج', () => {
  // 3 فواتير اتصرفوا، الفاتورة رقم 2 اتشالت (استعادة نسخة ناقصة مثلاً)
  const afterDeletion = ['INV-2026-0001', 'INV-2026-0003'];
  // الطريقة القديمة: length + 1 = 3 → INV-2026-0003 مكرر!
  assert.equal(nextDocumentNumber(afterDeletion, 'INV', 4, 2026), 'INV-2026-0004');
});

test('أرقام السنين القديمة مابتأثرش على تسلسل السنة الحالية', () => {
  const numbers = ['INV-2025-0500', 'INV-2026-0002'];
  assert.equal(nextDocumentNumber(numbers, 'INV', 4, 2026), 'INV-2026-0003');
});

test('أول مستند في السنة', () => {
  assert.equal(nextDocumentNumber([], 'MNT', 3, 2026), 'MNT-2026-001');
  assert.equal(nextDocumentNumber(['MNT-2025-099'], 'MNT', 3, 2026), 'MNT-2026-001');
});

test('أرقام مشوّهة أو مكررة مابتكسرش الحساب', () => {
  const numbers = ['INV-2026-0004', 'INV-2026-0004', 'رقم يدوي', '', null, 'INV-2026-00x'];
  assert.equal(nextDocumentNumber(numbers, 'INV', 4, 2026), 'INV-2026-0005');
});
