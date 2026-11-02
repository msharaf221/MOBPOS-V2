import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTransaction,
  normalizeTransactionType,
  normalizeInventoryItem,
  normalizeSale,
  normalizeSafe,
  normalizeRecord,
} from '../../shared/sync/normalize.ts';

test('normalizeTransactionType: maps mobile & legacy types to canonical forms', () => {
  // Capital / deposit mappings
  assert.equal(normalizeTransactionType('deposit'), 'capital');
  assert.equal(normalizeTransactionType('cash_in'), 'capital');
  assert.equal(normalizeTransactionType('إيداع نقدي'), 'capital');
  assert.equal(normalizeTransactionType('رأس مال'), 'capital');

  // Withdrawal mappings
  assert.equal(normalizeTransactionType('withdrawal'), 'withdrawal');
  assert.equal(normalizeTransactionType('سحب نقدي'), 'withdrawal');
  assert.equal(normalizeTransactionType('مسحوبات'), 'withdrawal');

  // Operational expenses & income
  assert.equal(normalizeTransactionType('expense'), 'expense');
  assert.equal(normalizeTransactionType('مصروف'), 'expense');
  assert.equal(normalizeTransactionType('income'), 'income');
  assert.equal(normalizeTransactionType('دخل'), 'income');
});

test('normalizeTransaction: ensures date, safeId, and canonical type', () => {
  const rawMobile = {
    id: 'tx_mobile_1',
    type: 'إيداع نقدي',
    amount: '5000',
    description: 'إيداع خزينة تجريبي',
    safe_id: 'safe_main',
  };

  const norm = normalizeTransaction(rawMobile);
  assert.equal(norm.id, 'tx_mobile_1');
  assert.equal(norm.type, 'capital');
  assert.equal(norm.amount, 5000);
  assert.equal(norm.safeId, 'safe_main');
  assert.ok(typeof norm.createdAt === 'string');
});

test('normalizeInventoryItem: unifies snake_case Supabase fields and camelCase local fields', () => {
  const rawRemote = {
    id: 'prod_99',
    name: 'شاشة سامسونج A52',
    category_id: 'cat13',
    cost_price: '450.50',
    sell_price: '700',
    stock_quantity: 15,
    min_quantity: 3,
    barcode: '622000000001',
  };

  const norm = normalizeInventoryItem(rawRemote);
  assert.equal(norm.id, 'prod_99');
  assert.equal(norm.name, 'شاشة سامسونج A52');
  assert.equal(norm.categoryId, 'cat13');
  assert.equal(norm.costPrice, 450.5);
  assert.equal(norm.sellPrice, 700);
  assert.equal(norm.quantity, 15);
  assert.equal(norm.minQuantity, 3);
  assert.equal(norm.barcode, '622000000001');
});

test('normalizeSale: preserves items, payments, and calculates totals idempotently', () => {
  const rawSale = {
    id: 'sale_101',
    invoice_number: 'INV-2026-0001',
    customer_id: 'cust_5',
    subtotal: 1000,
    discount: 50,
    total: 950,
    paid: 950,
    items: [
      {
        product_id: 'prod_99',
        name: 'جراب ايفون',
        quantity: 2,
        price: 500,
        cost_price: 300,
      },
    ],
  };

  const norm = normalizeSale(rawSale);
  assert.equal(norm.id, 'sale_101');
  assert.equal(norm.invoiceNumber, 'INV-2026-0001');
  assert.equal(norm.customerId, 'cust_5');
  assert.equal(norm.finalTotal, 950);
  assert.equal(norm.paidAmount, 950);
  assert.equal(norm.remainingAmount, 0);

  const items = norm.items as any[];
  assert.equal(items.length, 1);
  assert.equal(items[0].productId, 'prod_99');
  assert.equal(items[0].costPrice, 300);
});

test('normalizeSafe: defaults balance to number and keeps isDefault flag', () => {
  const rawSafe = {
    id: 'safe_1',
    name: 'الخزنة الرئيسية',
    balance: '12500.75',
    is_default: true,
  };

  const norm = normalizeSafe(rawSafe);
  assert.equal(norm.id, 'safe_1');
  assert.equal(norm.name, 'الخزنة الرئيسية');
  assert.equal(norm.balance, 12500.75);
  assert.equal(norm.isDefault, true);
});

test('normalizeRecord: generic dispatcher matches canonical store name', () => {
  const res = normalizeRecord('inventory', {
    id: 'item_1',
    name: 'كابل شحن Type-C',
    purchase_price: 25,
    selling_price: 60,
    quantity_in_stock: 40,
  });

  assert.equal(res.id, 'item_1');
  assert.equal(res.costPrice, 25);
  assert.equal(res.sellPrice, 60);
  assert.equal(res.quantity, 40);
});
