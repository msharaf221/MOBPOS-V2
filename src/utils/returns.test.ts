import test from 'node:test';
import assert from 'node:assert/strict';
import { returnedQuantityOf, saleNetTotals, summarizeReturns } from './returns.ts';
import type { Sale, SaleReturn } from '../types';

const baseSale = {
  id: 'sale1',
  invoiceNumber: 'INV-2026-0001',
  customerId: 'cust1',
  items: [],
  subtotal: 1000,
  discount: 0,
  total: 1000,
  paid: 600,
  remaining: 400,
  profit: 300,
  paymentMethod: 'installment',
  cashierId: 'u1',
  safeId: 'safe1',
  notes: '',
  createdAt: '2026-08-01T10:00:00.000Z',
} as unknown as Sale;

const modernReturn = (over: Partial<SaleReturn> = {}): SaleReturn => ({
  id: 'ret1', saleId: 'sale1', saleItemId: 'item1', inventoryId: 'inv1',
  quantity: 1, refundAmount: 120, reason: '', createdAt: '2026-08-05T10:00:00.000Z',
  processedBy: 'u1',
  netValue: 200, debtForgiven: 80, costValue: 150, profitImpact: 50,
  ...over,
});

/** سجل قديم اتعمل قبل الإصلاح: الفاتورة نفسها كانت اتخصمت وقتها. */
const legacyReturn = (over: Partial<SaleReturn> = {}): SaleReturn => ({
  id: 'old1', saleId: 'sale1', saleItemId: 'item1', inventoryId: 'inv1',
  quantity: 1, refundAmount: 90, reason: '', createdAt: '2026-07-01T10:00:00.000Z',
  processedBy: 'u1',
  ...over,
});

test('تجميع المرتجعات الجديدة بيجمع كل الأثر المالي', () => {
  const summary = summarizeReturns([modernReturn(), modernReturn({ id: 'ret2' })]);
  assert.equal(summary.count, 2);
  assert.equal(summary.cashRefunded, 240);
  assert.equal(summary.revenueReversed, 400);
  assert.equal(summary.costReturned, 300);
  assert.equal(summary.profitReversed, 100);
  assert.equal(summary.debtForgiven, 160);
});

test('المرتجعات القديمة: الكاش بيتحسب والإيراد لأ (الفاتورة اتخصمت وقتها)', () => {
  const summary = summarizeReturns([legacyReturn()]);
  assert.equal(summary.cashRefunded, 90, 'حركة الخزنة حقيقية ومستقلة');
  assert.equal(summary.revenueReversed, 0, 'عشان الخصم ما يتكررش مرتين');
  assert.equal(summary.profitReversed, 0);
});

test('صافي الفاتورة بعد المرتجعات من غير ما نلمس الفاتورة', () => {
  const net = saleNetTotals(baseSale, [modernReturn()]);
  assert.equal(net.returnedValue, 200);
  assert.equal(net.netTotal, 800);
  assert.equal(net.netProfit, 250);
  assert.equal(net.netRemaining, 320, 'الدين المتشال بيتخصم من المتبقي');
  assert.equal(net.cashRefunded, 120);
  assert.equal(net.hasReturns, true);
});

test('فاتورة من غير مرتجعات بترجع أرقامها زي ما هي', () => {
  const net = saleNetTotals(baseSale, []);
  assert.equal(net.netTotal, 1000);
  assert.equal(net.netProfit, 300);
  assert.equal(net.netRemaining, 400);
  assert.equal(net.hasReturns, false);
});

test('مرتجعات فواتير تانية مابتأثرش على الفاتورة دي', () => {
  const other = modernReturn({ id: 'x', saleId: 'sale-other', netValue: 999 });
  const net = saleNetTotals(baseSale, [other]);
  assert.equal(net.netTotal, 1000);
});

test('الكمية المرتجعة بتتقرا من السجلات مع احترام القيمة القديمة على البند', () => {
  const records = [modernReturn({ quantity: 2 })];
  assert.equal(returnedQuantityOf(records, 'sale1', 'item1'), 2);
  assert.equal(returnedQuantityOf(records, 'sale1', 'item1', 3), 3, 'الأعلى هو الآمن');
  assert.equal(returnedQuantityOf(records, 'sale1', 'item2'), 0);
});
