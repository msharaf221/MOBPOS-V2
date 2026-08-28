/**
 * Tests for the live alerts engine + the merge that keeps the bell badge honest.
 *
 * Runs on plain Node (type stripping), no test framework needed:
 *   npm test          → node --test src/utils/alerts.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAutoNotifications, mergeAutoNotifications, selectVisibleNotifications, countUnreadNotifications } from './alerts.ts';
import type { Customer, IMEIUnit, InventoryItem, Maintenance, Notification } from '../types';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function product(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'p1',
    name: 'شاحن سريع',
    code: 'C-1',
    barcode: '123',
    categoryId: 'cat1',
    costPrice: 50,
    sellPrice: 100,
    quantity: 10,
    minQuantity: 5,
    hasIMEI: false,
    createdAt: iso(now - 30 * DAY),
    ...overrides,
  };
}

function imei(overrides: Partial<IMEIUnit> = {}): IMEIUnit {
  return {
    id: 'u1',
    inventoryId: 'p1',
    imei1: '356789012345678',
    imei2: '',
    color: 'أسود',
    storage: '128',
    ram: '8',
    condition: 'new',
    warrantyEndDate: iso(now + 60 * DAY),
    status: 'available',
    saleId: '',
    customerId: '',
    purchasePrice: 5000,
    notes: '',
    createdAt: iso(now - 30 * DAY),
    ...overrides,
  };
}

function ticket(overrides: Partial<Maintenance> = {}): Maintenance {
  return {
    id: 'm1',
    ticketNumber: 'T-100',
    customerName: 'أحمد',
    customerPhone: '01000000000',
    deviceType: 'موبايل',
    deviceModel: 'iPhone 12',
    imeiLink: '',
    problem: 'شاشة',
    diagnosis: '',
    status: 'received',
    estimatedCost: 500,
    finalCost: 0,
    collectedAmount: 0,
    parts: [],
    additionalExpenses: 0,
    profit: 0,
    technicianId: '',
    safeId: '',
    receivedAt: iso(now - 10 * DAY),
    completedAt: '',
    deliveredAt: '',
    notes: '',
    ...overrides,
  };
}

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'محمود',
    phone: '01111111111',
    address: '',
    balance: 0,
    createdAt: iso(now - 30 * DAY),
    ...overrides,
  };
}

test('no alerts when the shop is healthy', () => {
  const alerts = buildAutoNotifications({
    inventory: [product()],
    imeiUnits: [],
    maintenance: [],
    customers: [customer()],
  });
  assert.deepEqual(alerts, []);
});

test('low stock alert uses the real quantity, not the template field', () => {
  // IMEI products keep quantity = 0 on the template; the stock is the
  // number of available units.
  const alerts = buildAutoNotifications({
    inventory: [product({ id: 'dev', name: 'iPhone 15', hasIMEI: true, quantity: 0, minQuantity: 2 })],
    imeiUnits: [imei({ id: 'u1', inventoryId: 'dev', status: 'available' })],
    maintenance: [],
    customers: [],
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, 'auto:low_stock:dev');
  assert.equal(alerts[0].type, 'low_stock');
  assert.equal(alerts[0].link, 'inventory');
  assert.match(alerts[0].message, /المتاح 1 فقط/);
  assert.equal(alerts[0].source, 'auto');
  assert.equal(alerts[0].isRead, false);
});

test('healthy stock produces no low stock alert', () => {
  const alerts = buildAutoNotifications({
    inventory: [product({ quantity: 50, minQuantity: 5 })],
    imeiUnits: [],
    maintenance: [],
    customers: [],
  });
  assert.deepEqual(alerts, []);
});

test('warranty alert only fires inside the 30 day window for sold units', () => {
  const inside = buildAutoNotifications({
    inventory: [],
    imeiUnits: [imei({ id: 'u-in', status: 'sold', warrantyEndDate: iso(now + 5 * DAY) })],
    maintenance: [],
    customers: [],
  });
  assert.equal(inside.length, 1);
  assert.equal(inside[0].id, 'auto:warranty_expiring:u-in');
  assert.equal(inside[0].type, 'warranty_expiring');

  const outside = buildAutoNotifications({
    inventory: [],
    imeiUnits: [
      imei({ id: 'u-far', status: 'sold', warrantyEndDate: iso(now + 90 * DAY) }),
      imei({ id: 'u-shelf', status: 'available', warrantyEndDate: iso(now + 5 * DAY) }),
      imei({ id: 'u-expired', status: 'sold', warrantyEndDate: iso(now - 5 * DAY) }),
    ],
    maintenance: [],
    customers: [],
  });
  assert.deepEqual(outside, []);
});

test('delayed maintenance alert needs an open ticket older than 7 days', () => {
  const delayed = buildAutoNotifications({
    inventory: [],
    imeiUnits: [],
    maintenance: [ticket({ id: 'm-late', receivedAt: iso(now - 9 * DAY) })],
    customers: [],
  });
  assert.equal(delayed.length, 1);
  assert.equal(delayed[0].id, 'auto:maintenance_delayed:m-late');
  assert.equal(delayed[0].link, 'maintenance');

  const freshOrClosed = buildAutoNotifications({
    inventory: [],
    imeiUnits: [],
    maintenance: [
      ticket({ id: 'm-fresh', receivedAt: iso(now - 1 * DAY) }),
      ticket({ id: 'm-done', receivedAt: iso(now - 20 * DAY), status: 'delivered' }),
    ],
    customers: [],
  });
  assert.deepEqual(freshOrClosed, []);
});

test('customer debt alert only for a positive balance', () => {
  const alerts = buildAutoNotifications({
    inventory: [],
    imeiUnits: [],
    maintenance: [],
    customers: [customer({ id: 'c-debtor', balance: 1500 }), customer({ id: 'c-clear', balance: 0 })],
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, 'auto:customer_debt:c-debtor');
  assert.equal(alerts[0].type, 'customer_debt');
});

test('long lists collapse into a summary row instead of flooding the badge', () => {
  const inventory = Array.from({ length: 12 }, (_, i) =>
    product({ id: `p${i}`, name: `منتج ${i}`, quantity: 0, minQuantity: 5 })
  );
  const alerts = buildAutoNotifications({ inventory, imeiUnits: [], maintenance: [], customers: [] });
  assert.equal(alerts.length, 6); // 5 individual + 1 summary
  assert.equal(alerts[5].id, 'auto:low_stock:_summary');
  assert.match(alerts[5].title, /7 منتج آخر/);
});

// ── mergeAutoNotifications ──────────────────────────────────────────────────

function live(id: string, title = 'عنوان', message = 'رسالة'): Notification {
  return {
    id,
    type: 'low_stock',
    title,
    message,
    isRead: false,
    createdAt: iso(now),
    source: 'auto',
    link: 'inventory',
  };
}

test('merge returns the same reference when nothing changed (no render loop)', () => {
  const stored = [live('auto:low_stock:p1')];
  const next = mergeAutoNotifications(stored, [live('auto:low_stock:p1')]);
  assert.equal(next, stored);
});

test('merge adds new alerts and refreshes the text of existing ones', () => {
  const stored = [{ ...live('auto:low_stock:p1'), isRead: true }];
  const next = mergeAutoNotifications(stored, [
    live('auto:low_stock:p1', 'عنوان', 'المتاح 2 فقط'),
    live('auto:low_stock:p2'),
  ]);
  assert.notEqual(next, stored);
  assert.equal(next.length, 2);
  assert.equal(next[0].message, 'المتاح 2 فقط');
  assert.equal(next[0].isRead, true, 'read state must survive a text refresh');
  assert.equal(next[1].id, 'auto:low_stock:p2');
});

test('merge drops an auto alert once its condition is resolved', () => {
  const stored = [live('auto:low_stock:p1'), live('auto:low_stock:p2')];
  const next = mergeAutoNotifications(stored, [live('auto:low_stock:p2')]);
  assert.deepEqual(next.map(n => n.id), ['auto:low_stock:p2']);
});

test('a dismissed alert is never resurrected while its condition holds', () => {
  const stored = [{ ...live('auto:low_stock:p1'), isRead: true, dismissed: true }];
  const next = mergeAutoNotifications(stored, [live('auto:low_stock:p1')]);
  assert.equal(next, stored, 'nothing to change');
  assert.equal(next[0].dismissed, true);
});

test('legacy imported rows (no source) get hidden — the stuck badge fix', () => {
  const legacy: Notification[] = [
    { id: 'old-1', type: 'info', title: 'تنبيه قديم', message: '', isRead: false, createdAt: iso(now - 400 * DAY) },
    { id: 'old-2', type: 'info', title: 'تنبيه قديم', message: '', isRead: false, createdAt: iso(now - 400 * DAY) },
    { id: 'old-3', type: 'info', title: 'تنبيه قديم', message: '', isRead: false, createdAt: iso(now - 400 * DAY) },
  ];
  const next = mergeAutoNotifications(legacy, []);
  assert.equal(next.length, 3, 'legacy rows are hidden, never deleted');
  assert.ok(next.every(n => n.dismissed === true));
  assert.equal(next.filter(n => !n.dismissed).length, 0, 'badge count drops to zero');

  // Idempotent: a second pass changes nothing.
  assert.equal(mergeAutoNotifications(next, []), next);
});

test('system notifications survive the merge untouched', () => {
  const system: Notification = {
    id: 'sys-1',
    type: 'info',
    title: 'تم إنشاء نسخة احتياطية',
    message: '',
    isRead: false,
    createdAt: iso(now),
    source: 'system',
  };
  const next = mergeAutoNotifications([system], []);
  assert.equal(next.length, 1);
  assert.deepEqual(next[0], system);
  assert.equal(next[0].dismissed, undefined);
});

// ── the bell badge ──────────────────────────────────────────────────────────

test('dismissed alerts are invisible and never counted in the badge', () => {
  const list: Notification[] = [
    { ...live('auto:low_stock:p1'), isRead: false },
    { ...live('auto:low_stock:p2'), isRead: false, dismissed: true },
    { ...live('auto:low_stock:p3'), isRead: true },
  ];
  const visible = selectVisibleNotifications(list);
  assert.deepEqual(visible.map(n => n.id), ['auto:low_stock:p1', 'auto:low_stock:p3']);
  assert.equal(countUnreadNotifications(list), 1);
});

test('clearing every alert takes the badge back to zero', () => {
  // Exactly what store.clearAllNotifications() does: auto alerts get flagged
  // dismissed, anything else (imported/legacy rows) is removed for good.
  const clearAll = (prev: Notification[]) =>
    prev.flatMap(n => (n.source === 'auto' ? [{ ...n, isRead: true, dismissed: true }] : []));

  const stored: Notification[] = [
    live('auto:low_stock:p1'),
    live('auto:customer_debt:c1'),
    { id: 'legacy-1', type: 'info', title: 'قديم', message: '', isRead: false, createdAt: iso(now - 300 * DAY) },
  ];

  const afterClear = clearAll(stored);
  assert.equal(afterClear.length, 2, 'the legacy row is gone');
  assert.equal(countUnreadNotifications(afterClear), 0);

  // The engine re-runs on the next data change while the conditions still hold:
  // it must not resurrect the alerts the user just cleared.
  const afterEngine = mergeAutoNotifications(afterClear, [live('auto:low_stock:p1'), live('auto:customer_debt:c1')]);
  assert.equal(selectVisibleNotifications(afterEngine).length, 0);
  assert.equal(countUnreadNotifications(afterEngine), 0);
});

test('the badge shows newest first', () => {
  const list: Notification[] = [
    { ...live('old'), createdAt: iso(now - 3 * DAY) },
    { ...live('new'), createdAt: iso(now - 1 * DAY) },
  ];
  assert.deepEqual(selectVisibleNotifications(list).map(n => n.id), ['new', 'old']);
});
