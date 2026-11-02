// ============================================================
//  Mobile Sync Record Adapters
// ------------------------------------------------------------
//  تحويل السجلات القانونية (سكيما الديسكتوب) إلى أنواع تطبيق
//  الموبايل للعرض، مع حساب الأرباح وعدد وحدات IMEI المتاحة.
//  مستخرجة من MultiBranchManager عشان المنطق يبقى قابل للاختبار.
// ============================================================

import {
  asNumber,
  asString,
  normalizeImeiStatus,
  normalizePaymentMethod,
  normalizeRecord,
  type NormalizeContext,
} from '../../../../shared/sync/index.ts';
import type {
  BranchConfig,
  Customer,
  ImeiUnit,
  InventoryItem,
  MaintenanceOrder,
  SaleItem,
  SaleRecord,
  Safe,
  Transaction,
} from '../../types';

type AnyRecord = Record<string, unknown>;

export interface BranchLike {
  id: string;
  name: string;
  color: string;
}

export interface SaleLookups {
  inventory: Map<string, AnyRecord>;
  imei: Map<string, AnyRecord>;
  customers: Map<string, AnyRecord>;
  users: Map<string, AnyRecord>;
  safes: Map<string, AnyRecord>;
}

export function normalizeIncoming(
  store: string,
  data: unknown,
  ctx: NormalizeContext = {}
): AnyRecord {
  return normalizeRecord(store, data, ctx);
}

export function toMap(records: unknown[]): Map<string, AnyRecord> {
  const map = new Map<string, AnyRecord>();
  for (const record of records) {
    if (record && typeof record === 'object') {
      const id = asString((record as AnyRecord).id);
      if (id) map.set(id, record as AnyRecord);
    }
  }
  return map;
}

function paymentLabel(raw: unknown): string {
  const method = normalizePaymentMethod(raw);
  if (method === 'card') return 'بطاقة / فيزا';
  if (method === 'installment') return 'آجل / تقسيط';
  return 'نقدي (كاش)';
}

export function adaptSale(raw: unknown, lookups: SaleLookups, branch: BranchLike): SaleRecord {
  const source = (raw && typeof raw === 'object' ? raw : {}) as AnyRecord;
  const customer = source.customerId ? lookups.customers.get(asString(source.customerId)) : undefined;
  const cashier = source.cashierId ? lookups.users.get(asString(source.cashierId)) : undefined;
  const safe = source.safeId ? lookups.safes.get(asString(source.safeId)) : undefined;

  const finalTotal = asNumber(source.total ?? source.finalTotal, 0);
  const discount = asNumber(source.discount, 0);
  const subtotal = asNumber(
    source.subtotal,
    finalTotal + discount
  );
  const paidAmount = asNumber(source.paid ?? source.paidAmount, finalTotal);
  const remainingAmount = asNumber(
    source.remaining ?? source.remainingAmount,
    Math.max(0, finalTotal - paidAmount)
  );
  const rawDate = asString(source.createdAt || source.date) || new Date().toISOString();
  const rawItems = Array.isArray(source.items) ? (source.items as AnyRecord[]) : [];

  let totalItemsCost = 0;
  let hasKnownCost = false;

  const items: SaleItem[] = rawItems.map((item, index) => {
    const inventoryId = asString(item.inventoryId || item.id);
    const inventory = inventoryId ? lookups.inventory.get(inventoryId) : undefined;
    const imeiUnit = item.imeiUnitId ? lookups.imei.get(asString(item.imeiUnitId)) : undefined;
    const unitPrice = asNumber(item.unitPrice ?? item.price ?? inventory?.sellPrice, 0);
    const costPrice = asNumber(item.costPrice ?? item.cost ?? inventory?.costPrice, 0);
    const quantity = asNumber(item.quantity, 1) || 1;
    const lineTotal = asNumber(item.total, unitPrice * quantity);
    const imei = asString(item.imei || imeiUnit?.imei1 || imeiUnit?.imei2);

    if (costPrice > 0) {
      totalItemsCost += costPrice * quantity;
      hasKnownCost = true;
    }

    return {
      id: asString(item.id) || inventoryId || `item_${index}`,
      inventoryId,
      imeiUnitId: asString(item.imeiUnitId) || undefined,
      name: asString(item.name || inventory?.name) || 'صنف مبيعات',
      quantity,
      price: unitPrice,
      unitPrice,
      cost: costPrice,
      costPrice,
      total: lineTotal,
      returnedQuantity: asNumber(item.returnedQuantity, 0),
      imei: imei || undefined,
    };
  });

  // حساب ربح محاسبي: لو التكلفة معروفة نستخدمها، وإلا لا نعتبر الإيراد ربحاً.
  let verifiedProfit = asNumber(source.profit, 0);
  if (hasKnownCost && totalItemsCost > 0) {
    verifiedProfit = Math.max(0, finalTotal - totalItemsCost);
  } else if (verifiedProfit >= finalTotal && finalTotal > 0) {
    verifiedProfit = 0;
  }

  return {
    id: asString(source.id),
    invoiceNumber: asString(source.invoiceNumber) || asString(source.id).slice(0, 8),
    date: rawDate,
    createdAt: rawDate,
    subtotal,
    total: subtotal,
    discount,
    finalTotal,
    paidAmount,
    remainingAmount,
    profit: verifiedProfit,
    paymentMethod: paymentLabel(source.paymentMethod),
    safeId: asString(source.safeId) || undefined,
    safeName: asString(safe?.name || source.safeName) || 'الخزينة الرئيسية',
    cashierName: asString(cashier?.name || source.cashierName) || 'كاشير المحل',
    customerName: asString(customer?.name || source.customerName)
      || (source.customerId ? 'عميل مسجل' : 'عميل نقدي'),
    customerPhone: asString(customer?.phone || source.customerPhone),
    customerId: asString(source.customerId) || undefined,
    items,
    notes: asString(source.notes) || undefined,
    branchId: branch.id,
    branchName: branch.name,
    branchColor: branch.color,
  };
}

export function adaptInventoryItem(
  raw: unknown,
  branch: BranchLike,
  categories: Map<string, AnyRecord>,
  availableImeiCount = 0
): InventoryItem {
  const source = (raw && typeof raw === 'object' ? raw : {}) as AnyRecord;
  const categoryId = asString(source.categoryId || source.category_id);
  const category = categoryId ? categories.get(categoryId) : undefined;
  const hasImei = Boolean(source.hasIMEI ?? source.hasImei ?? source.has_imei);

  const rawQty = source.quantity ?? source.stock_quantity ?? source.quantity_in_stock ?? source.stockQuantity ?? source.qty ?? source.stock ?? source.count;
  const rawCost = source.costPrice ?? source.cost_price ?? source.purchasePrice ?? source.purchase_price ?? source.cost ?? source.buyPrice ?? source.buy_price;
  const rawSell = source.sellPrice ?? source.sell_price ?? source.sellingPrice ?? source.selling_price ?? source.price ?? source.unitPrice ?? source.unit_price ?? source.sale_price;

  return {
    id: asString(source.id),
    name: asString(source.name || source.productName || source.title) || 'منتج غير مسمى',
    category: asString(category?.name || source.category || source.categoryName) || (hasImei ? 'موبايلات' : 'عام'),
    categoryId: categoryId || undefined,
    quantity: Math.max(0, asNumber(rawQty, 0)),
    minQuantity: Math.max(0, asNumber(source.minQuantity ?? source.min, 2)),
    costPrice: asNumber(rawCost, 0),
    sellPrice: asNumber(rawSell, 0),
    code: asString(source.code) || undefined,
    barcode: asString(source.barcode || source.code || source.sku) || undefined,
    hasImei,
    hasIMEI: hasImei,
    createdAt: asString(source.createdAt || source.date) || undefined,
    updatedAt: asString(source.updated_at || source.updatedAt) || undefined,
    branchId: branch.id,
    branchName: branch.name,
    availableImeiCount: hasImei ? availableImeiCount : undefined,
  };
}

export function adaptImeiUnit(raw: unknown, branch: BranchLike): ImeiUnit {
  const source = (raw && typeof raw === 'object' ? raw : {}) as AnyRecord;
  const imei1 = asString(source.imei1 || source.imei || source.serialNumber || source.serial);
  const rawCost = source.purchasePrice ?? source.purchase_price ?? source.costPrice ?? source.cost_price ?? source.cost;
  const rawSell = source.sellPrice ?? source.sell_price ?? source.sellingPrice ?? source.selling_price ?? source.price;

  return {
    id: asString(source.id),
    productId: asString(source.inventoryId || source.inventory_id || source.productId || source.product_id),
    inventoryId: asString(source.inventoryId || source.inventory_id || source.productId || source.product_id) || undefined,
    productName: asString(source.productName || source.name) || undefined,
    imei: imei1,
    imei1,
    imei2: asString(source.imei2 || source.secondImei) || undefined,
    serialNumber: asString(source.serialNumber || source.serial) || undefined,
    status: normalizeImeiStatus(source.status),
    saleId: asString(source.saleId || source.sale_id) || undefined,
    customerId: asString(source.customerId || source.customer_id) || undefined,
    costPrice: asNumber(rawCost, 0),
    sellPrice: asNumber(rawSell, 0),
    color: asString(source.color) || undefined,
    storage: asString(source.storage || source.capacity) || undefined,
    createdAt: asString(source.createdAt || source.date) || undefined,
    branchId: branch.id,
    branchName: branch.name,
  };
}

export function adaptSafe(raw: unknown, branch: BranchLike): Safe {
  const source = (raw && typeof raw === 'object' ? raw : {}) as AnyRecord;
  const rawType = asString(source.type, 'cash').toLowerCase();
  let type: 'cash' | 'bank' | 'wallet' | 'card' = 'cash';
  if (rawType === 'ewallet' || rawType === 'wallet') type = 'wallet';
  else if (rawType === 'bank') type = 'bank';
  else if (rawType === 'card') type = 'card';

  return {
    id: asString(source.id),
    name: asString(source.name) || 'خزينة',
    type,
    balance: asNumber(source.balance, 0),
    isDefault: Boolean(source.isDefault),
    branchId: branch.id,
    branchName: branch.name,
  };
}

export function adaptTransaction(
  raw: unknown,
  branch: BranchLike,
  lookups: { safes: Map<string, AnyRecord>; users: Map<string, AnyRecord> }
): Transaction {
  const source = (raw && typeof raw === 'object' ? raw : {}) as AnyRecord;
  const safe = source.safeId ? lookups.safes.get(asString(source.safeId)) : undefined;
  const user = source.userId ? lookups.users.get(asString(source.userId)) : undefined;
  const rawDate = asString(source.createdAt || source.date) || new Date().toISOString();

  return {
    id: asString(source.id),
    date: rawDate,
    type: asString(source.type, 'expense') as Transaction['type'],
    amount: Math.abs(asNumber(source.amount, 0)),
    safeId: asString(source.safeId),
    safeName: asString(safe?.name || source.safeName),
    description: asString(source.description) || 'حركة نقدية',
    category: asString(source.category),
    userName: asString(user?.name || source.userName),
    referenceId: asString(source.referenceId) || undefined,
    branchId: branch.id,
    branchName: branch.name,
    branchColor: branch.color,
  };
}

export function adaptMaintenance(raw: unknown, branch: BranchLike): MaintenanceOrder {
  const source = (raw && typeof raw === 'object' ? raw : {}) as AnyRecord;
  const statusMap: Record<string, MaintenanceOrder['status']> = {
    received: 'received',
    in_progress: 'repairing',
    completed: 'ready',
    delivered: 'delivered',
    cancelled: 'cancelled',
  };
  const status = statusMap[asString(source.status, 'received')] || 'received';
  const rawDate = asString(source.receivedAt || source.receivedDate || source.createdAt)
    || new Date().toISOString();
  const parts = Array.isArray(source.parts) ? (source.parts as AnyRecord[]) : [];
  const partsCost = parts.reduce((sum, part) => sum + asNumber(part.total, 0), 0);

  return {
    id: asString(source.id),
    ticketNumber: asString(source.ticketNumber) || asString(source.id).slice(0, 6),
    customerName: asString(source.customerName) || 'عميل صيانة',
    customerPhone: asString(source.customerPhone),
    deviceType: asString(source.deviceType || source.deviceModel) || 'جهاز صيانة',
    deviceModel: asString(source.deviceModel || source.deviceType) || 'جهاز صيانة',
    problem: asString(source.problem || source.diagnosis) || 'فحص وإصلاح',
    diagnosis: asString(source.diagnosis || source.problem) || 'فحص وإصلاح',
    status,
    costPrice: asNumber(source.costPrice, partsCost),
    expectedPrice: asNumber(source.estimatedCost ?? source.expectedPrice, 0),
    finalPrice: asNumber(source.finalCost ?? source.finalPrice ?? source.collectedAmount, 0),
    collectedAmount: asNumber(source.collectedAmount ?? source.finalCost, 0),
    profit: asNumber(source.profit, 0),
    receivedDate: rawDate,
    receivedAt: rawDate,
    deliveryDate: asString(source.deliveredAt || source.deliveryDate) || undefined,
    deliveredAt: asString(source.deliveredAt || source.deliveryDate) || undefined,
    safeId: asString(source.safeId) || undefined,
    branchId: branch.id,
    branchName: branch.name,
  };
}

export function adaptCustomer(raw: unknown, branch: BranchLike): Customer {
  const source = (raw && typeof raw === 'object' ? raw : {}) as AnyRecord;
  return {
    id: asString(source.id),
    name: asString(source.name) || 'عميل',
    phone: asString(source.phone),
    balance: asNumber(source.balance, 0),
    branchId: branch.id,
    branchName: branch.name,
  };
}

export function countAvailableImeiByInventory(units: ImeiUnit[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const unit of units) {
    if (unit.status !== 'available') continue;
    const key = unit.inventoryId || unit.productId;
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
