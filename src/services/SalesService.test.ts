import test from 'node:test';
import assert from 'node:assert/strict';
import { SalesService } from './SalesService.ts';
import type { StoreState } from '../hooks/store/types.ts';
import type { InventoryItem, Safe, Customer, User, IMEIUnit } from '../types/index.ts';

function createMockState(overrides: Partial<StoreState> = {}): StoreState {
  const dummyUser: User = {
    id: 'user1',
    name: 'كاشير المحل',
    username: 'cashier',
    password: 'hash',
    role: 'staff',
    createdAt: '2026-01-01T00:00:00.000Z'
  };

  const dummySafe: Safe = {
    id: 'safe1',
    name: 'الدرج الرئيسي',
    balance: 5000,
    isDefault: true,
    type: 'cash'
  };

  const dummyCustomer: Customer = {
    id: 'cust1',
    name: 'عميل آجل',
    phone: '01012345678',
    address: 'القاهرة',
    balance: 0,
    createdAt: '2026-01-01T00:00:00.000Z'
  };

  const dummyInventory: InventoryItem[] = [
    {
      id: 'inv1',
      name: 'كابل شاحن Type-C',
      code: 'ACC-01',
      barcode: '6221111111111',
      categoryId: 'cat1',
      costPrice: 50,
      sellPrice: 100,
      quantity: 10,
      minQuantity: 2,
      hasIMEI: false,
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'inv2',
      name: 'هاتف Samsung A55',
      code: 'DEV-01',
      barcode: '6222222222222',
      categoryId: 'cat2',
      costPrice: 12000,
      sellPrice: 15000,
      quantity: 1,
      minQuantity: 1,
      hasIMEI: true,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ];

  const dummyImei: IMEIUnit[] = [
    {
      id: 'imei1',
      inventoryId: 'inv2',
      imei1: '123456789012345',
      imei2: '',
      color: 'أسود',
      storage: '128GB',
      ram: '8GB',
      condition: 'new',
      warrantyEndDate: '',
      status: 'available',
      saleId: '',
      customerId: '',
      notes: '',
      purchasePrice: 12000,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ];

  return {
    users: [dummyUser],
    setUsers: () => {},
    customers: [dummyCustomer],
    setCustomers: () => {},
    categories: [],
    setCategories: () => {},
    inventory: dummyInventory,
    setInventory: () => {},
    imeiUnits: dummyImei,
    setImeiUnits: () => {},
    sales: [],
    setSales: () => {},
    saleReturns: [],
    setSaleReturns: () => {},
    maintenance: [],
    setMaintenance: () => {},
    safes: [dummySafe],
    setSafes: () => {},
    transactions: [],
    setTransactions: () => {},
    suppliers: [],
    setSuppliers: () => {},
    purchases: [],
    setPurchases: () => {},
    stockWastes: [],
    setStockWastes: () => {},
    inventoryAudits: [],
    setInventoryAudits: () => {},
    sideAccountEntries: [],
    setSideAccountEntries: () => {},
    notifications: [],
    setNotifications: () => {},
    auditLogs: [],
    setAuditLogs: () => {},
    currentUser: dummyUser,
    setCurrentUser: () => {},
    isDarkMode: false,
    setIsDarkMode: () => {},
    appSettings: {} as any,
    setAppSettings: () => {},
    addAuditLog: () => {},
    ...overrides
  };
}

test('negative testing: zero or negative pricing is rejected by SalesService', () => {
  const state = createMockState();
  const currentUser = state.currentUser;

  // Negative unit price
  const resNegativePrice = SalesService.createSale(
    state,
    '',
    [{ inventoryId: 'inv1', quantity: 1, unitPrice: -50, costPrice: 50, total: -50 }],
    0,
    0,
    'cash',
    'safe1',
    '',
    currentUser
  );
  assert.equal(resNegativePrice.sale, null, 'Negative unit price must be rejected');

  // Non-finite unit price (NaN)
  const resNaNPrice = SalesService.createSale(
    state,
    '',
    [{ inventoryId: 'inv1', quantity: 1, unitPrice: NaN, costPrice: 50, total: 50 }],
    0,
    0,
    'cash',
    'safe1',
    '',
    currentUser
  );
  assert.equal(resNaNPrice.sale, null, 'NaN unit price must be rejected');
});

test('negative testing: invalid barcodes or nonexistent inventory items are rejected', () => {
  const state = createMockState();
  const currentUser = state.currentUser;

  // Item with non-existent inventory ID
  const resInvalidItem = SalesService.createSale(
    state,
    '',
    [{ inventoryId: 'non-existent-id', quantity: 1, unitPrice: 100, costPrice: 50, total: 100 }],
    0,
    100,
    'cash',
    'safe1',
    '',
    currentUser
  );
  assert.equal(resInvalidItem.sale, null, 'Nonexistent item ID must be rejected');

  // Empty items list
  const resEmptyItems = SalesService.createSale(
    state,
    '',
    [],
    0,
    0,
    'cash',
    'safe1',
    '',
    currentUser
  );
  assert.equal(resEmptyItems.sale, null, 'Empty items list must be rejected');
});

test('negative testing: overselling inventory beyond available stock is strictly blocked', () => {
  const state = createMockState();
  const currentUser = state.currentUser;

  // inv1 has 10 units in stock; attempting to sell 11 must fail
  const resOversell = SalesService.createSale(
    state,
    '',
    [{ inventoryId: 'inv1', quantity: 11, unitPrice: 100, costPrice: 50, total: 1100 }],
    0,
    1100,
    'cash',
    'safe1',
    '',
    currentUser
  );
  assert.equal(resOversell.sale, null, 'Attempting to oversell stock must be rejected');

  // Zero quantity must also fail
  const resZeroQty = SalesService.createSale(
    state,
    '',
    [{ inventoryId: 'inv1', quantity: 0, unitPrice: 100, costPrice: 50, total: 0 }],
    0,
    0,
    'cash',
    'safe1',
    '',
    currentUser
  );
  assert.equal(resZeroQty.sale, null, 'Zero quantity must be rejected');

  // Selling exact available stock (10 units) succeeds
  const resExact = SalesService.createSale(
    state,
    '',
    [{ inventoryId: 'inv1', quantity: 10, unitPrice: 100, costPrice: 50, total: 1000 }],
    0,
    1000,
    'cash',
    'safe1',
    '',
    currentUser
  );
  assert.ok(resExact.sale !== null, 'Exact stock sale must succeed');
  assert.equal(resExact.sale?.items[0].quantity, 10);
  assert.equal(resExact.sale?.total, 1000);
});

test('negative testing: discounts exceeding subtotal or negative discounts are rejected', () => {
  const state = createMockState();
  const currentUser = state.currentUser;

  // Negative discount
  const resNegDiscount = SalesService.createSale(
    state,
    '',
    [{ inventoryId: 'inv1', quantity: 1, unitPrice: 100, costPrice: 50, total: 100 }],
    -10,
    90,
    'cash',
    'safe1',
    '',
    currentUser
  );
  assert.equal(resNegDiscount.sale, null, 'Negative discount must be rejected');

  // Discount exceeding subtotal
  const resExcessDiscount = SalesService.createSale(
    state,
    '',
    [{ inventoryId: 'inv1', quantity: 1, unitPrice: 100, costPrice: 50, total: 100 }],
    150,
    0,
    'cash',
    'safe1',
    '',
    currentUser
  );
  assert.equal(resExcessDiscount.sale, null, 'Discount exceeding subtotal must be rejected');
});

test('negative testing: partial returns exceeding invoice quantities are rejected', () => {
  const baseState = createMockState();
  const currentUser = baseState.currentUser;

  // Create a successful sale of 3 units
  const { sale } = SalesService.createSale(
    baseState,
    '',
    [{ inventoryId: 'inv1', quantity: 3, unitPrice: 100, costPrice: 50, total: 300 }],
    0,
    300,
    'cash',
    'safe1',
    '',
    currentUser
  );
  assert.ok(sale !== null);
  const saleItem = sale.items[0];

  const stateWithSale: StoreState = {
    ...baseState,
    sales: [sale]
  };

  // 1. Returning 4 units when only 3 were purchased must be rejected
  const resExcessReturn = SalesService.processSaleReturn(
    stateWithSale,
    sale.id,
    saleItem.id,
    4,
    'تالف',
    currentUser
  );
  assert.equal(resExcessReturn.returnRecord, null, 'Return quantity exceeding invoice item quantity must be rejected');

  // 2. Returning 0 or negative quantity must be rejected
  const resZeroReturn = SalesService.processSaleReturn(
    stateWithSale,
    sale.id,
    saleItem.id,
    0,
    'تالف',
    currentUser
  );
  assert.equal(resZeroReturn.returnRecord, null, 'Zero return quantity must be rejected');

  const resNegativeReturn = SalesService.processSaleReturn(
    stateWithSale,
    sale.id,
    saleItem.id,
    -1,
    'تالف',
    currentUser
  );
  assert.equal(resNegativeReturn.returnRecord, null, 'Negative return quantity must be rejected');

  // 3. First return of 2 units succeeds
  const resFirstReturn = SalesService.processSaleReturn(
    stateWithSale,
    sale.id,
    saleItem.id,
    2,
    'استرجاع جزئي',
    currentUser
  );
  assert.ok(resFirstReturn.returnRecord !== null);
  assert.equal(resFirstReturn.returnRecord?.quantity, 2);
  assert.equal(resFirstReturn.returnRecord?.refundAmount, 200);

  // 4. Second return: only 1 unit remaining. Attempting to return 2 more must be rejected
  const stateWithFirstReturn: StoreState = {
    ...stateWithSale,
    saleReturns: [resFirstReturn.returnRecord!]
  };

  const resSecondExcessReturn = SalesService.processSaleReturn(
    stateWithFirstReturn,
    sale.id,
    saleItem.id,
    2,
    'استرجاع إضافي',
    currentUser
  );
  assert.equal(resSecondExcessReturn.returnRecord, null, 'Cumulative return exceeding original quantity must be rejected');

  // 5. Returning the final 1 unit succeeds
  const resFinalReturn = SalesService.processSaleReturn(
    stateWithFirstReturn,
    sale.id,
    saleItem.id,
    1,
    'استرجاع آخر قطعة',
    currentUser
  );
  assert.ok(resFinalReturn.returnRecord !== null);
  assert.equal(resFinalReturn.returnRecord?.quantity, 1);
  assert.equal(resFinalReturn.returnRecord?.refundAmount, 100);
});

test('full POS sale cycle creates atomic inventory, cash, and audit deltas with stock restored on return', () => {
  const state = createMockState();
  const currentUser = state.currentUser;

  // 1. Create sale: 2 items of inv1 @ 100 with 20 discount = total 180 paid cash
  const { sale, updates } = SalesService.createSale(
    state,
    '',
    [{ inventoryId: 'inv1', quantity: 2, unitPrice: 100, costPrice: 50, total: 200 }],
    20,
    180,
    'cash',
    'safe1',
    'بيع نقدي',
    currentUser
  );

  assert.ok(sale !== null);
  assert.equal(sale.subtotal, 200);
  assert.equal(sale.discount, 20);
  assert.equal(sale.total, 180);
  assert.equal(sale.paid, 180);
  assert.equal(sale.remaining, 0);

  // Check deltas
  const invDelta = updates.deltas.find(d => d.storeName === 'inventory');
  assert.ok(invDelta);
  assert.equal(invDelta.type, 'increment');
  assert.deepEqual(invDelta.items, [{ id: 'inv1', quantity: -2 }]);

  const safeDelta = updates.deltas.find(d => d.storeName === 'safes');
  assert.ok(safeDelta);
  assert.equal(safeDelta.type, 'increment');
  assert.deepEqual(safeDelta.items, [{ id: 'safe1', balance: 180 }]);

  // 2. Return 1 item: should restore 1 stock to inventory and refund 90 cash from safe
  const stateAfterSale: StoreState = {
    ...state,
    sales: [sale]
  };

  const returnRes = SalesService.processSaleReturn(
    stateAfterSale,
    sale.id,
    sale.items[0].id,
    1,
    'زبون غير راضٍ',
    currentUser
  );

  assert.ok(returnRes.returnRecord !== null);
  assert.equal(returnRes.returnRecord?.quantity, 1);
  assert.equal(returnRes.returnRecord?.refundAmount, 90); // 100 - (20 * 100/200) = 90

  // Verify stock restoration delta
  const returnInvDelta = returnRes.updates.deltas.find(d => d.storeName === 'inventory');
  assert.ok(returnInvDelta);
  assert.equal(returnInvDelta.type, 'increment');
  assert.deepEqual(returnInvDelta.items, [{ id: 'inv1', quantity: 1 }]);

  // Verify cash refund delta
  const returnSafeDelta = returnRes.updates.deltas.find(d => d.storeName === 'safes');
  assert.ok(returnSafeDelta);
  assert.equal(returnSafeDelta.type, 'increment');
  assert.deepEqual(returnSafeDelta.items, [{ id: 'safe1', balance: -90 }]);
});
