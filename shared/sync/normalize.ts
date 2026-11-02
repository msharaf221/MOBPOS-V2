// ============================================================
//  MOBPOS Sync Normalizers — تطبيع موحّد لكل السجلات
// ------------------------------------------------------------
//  الهدف: أي سجل جاي من الموبايل (حتى النسخ القديمة) يتحول لشكل
//  الديسكتوب القانوني قبل ما يتخزن أو يظهر في الواجهة.
//  - الحركات المالية: createdAt + type صحيح (deposit → capital)
//  - المنتجات: categoryId + code + hasIMEI + createdAt
//  - المبيعات: total/paid/remaining + imeiUnitId + paymentMethod
//  - الصيانة: الحالات والأجزاء والتواريخ
// ============================================================

import { canonicalStoreName, type SyncableStore } from './contract.ts';

export interface NormalizeContext {
  /** معرّف السجل القادم من صف المزامنة. */
  id?: string;
  /** وقت التحديث القادم من السحابة. */
  updatedAt?: string;
  /** الوقت الحالي (قابل للحقن في الاختبارات). */
  now?: string;
  branchId?: string;
  branchName?: string;
}

type AnyRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'نعم';
  }
  return false;
}

function asArray(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const str = asString(value).trim();
    if (str) return str;
  }
  return '';
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const parsed = asNumber(value, Number.NaN);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function nowIso(ctx: NormalizeContext): string {
  return ctx.now || new Date().toISOString();
}

function resolveId(input: AnyRecord, ctx: NormalizeContext, prefix: string): string {
  return firstString(input.id, ctx.id) || `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ------------------------------------------------------------
//  الحركات المالية (Transactions)
// ------------------------------------------------------------

const TRANSACTION_TYPE_ALIASES: Record<string, string> = {
  deposit: 'capital',
  cash_in: 'capital',
  cashin: 'capital',
  capital_in: 'capital',
  withdrawal: 'withdrawal',
  withdraw: 'withdrawal',
  cash_out: 'expense',
  cashout: 'expense',
  'wallet-deposit': 'wallet_deposit',
  walletdeposit: 'wallet_deposit',
  'wallet-withdrawal': 'wallet_withdrawal',
  walletwithdrawal: 'wallet_withdrawal',
  customerpayment: 'customer_payment',
  'customer-payment': 'customer_payment',
  customer_payment: 'customer_payment',
  sideaccount: 'side_account',
  'side-account': 'side_account',
  maintenancecost: 'maintenance_cost',
  'maintenance-cost': 'maintenance_cost',
  inventoryadjustment: 'inventory_adjustment',
  'inventory-adjustment': 'inventory_adjustment',
  سحب: 'withdrawal',
  'سحب نقدي': 'withdrawal',
  'سحب_نقدي': 'withdrawal',
  مسحوبات: 'withdrawal',
  ايداع: 'capital',
  إيداع: 'capital',
  'إيداع نقدي': 'capital',
  'إيداع_نقدي': 'capital',
  'رأس مال': 'capital',
  'رأس_مال': 'capital',
  مصروف: 'expense',
  دخل: 'income',
  مبيعات: 'sale',
  صيانة: 'maintenance',
  مرتجع: 'return',
  تحويل: 'transfer',
};

const VALID_TRANSACTION_TYPES = new Set([
  'sale', 'purchase', 'maintenance', 'maintenance_cost', 'expense', 'income',
  'transfer', 'return', 'waste', 'inventory_adjustment', 'customer_payment',
  'wallet_deposit', 'wallet_withdrawal', 'capital', 'withdrawal', 'side_account',
]);

export function normalizeTransactionType(raw: unknown): string {
  const value = asString(raw, 'expense').trim();
  const lower = value.toLowerCase();
  if (VALID_TRANSACTION_TYPES.has(lower)) return lower;
  return TRANSACTION_TYPE_ALIASES[lower] || TRANSACTION_TYPE_ALIASES[value] || 'expense';
}

/**
 * يطبّع أي حركة مالية لشكل الديسكتوب.
 * `date` بتتحول لـ`createdAt` لأن كل تقارير الديسكتوب بتفلتر بـ`createdAt`.
 */
export function normalizeTransaction(input: unknown, ctx: NormalizeContext = {}): AnyRecord {
  const src = isRecord(input) ? input : {};
  const id = resolveId(src, ctx, 'tx');
  const createdAt = firstString(src.createdAt, src.date, src.updated_at, ctx.updatedAt) || nowIso(ctx);
  const type = normalizeTransactionType(src.type);
  
  // 🔴 FIX: في دفتر أستاذ الديسكتوب، حركات الصرف (expense / waste / إلخ) تُسجَّل
  // بقيمة سالبة (-amount)، بينما التوريدات والمبيعات بقيمة موجبة (+amount).
  // كان Math.abs يقلب المصروف لقيمة موجبة، فيعتبره الديسكتوب إيراداً ويختفي من تبويب المصروفات!
  const isOutflow =
    type === 'expense' ||
    type === 'maintenance_cost' ||
    type === 'waste' ||
    type === 'withdrawal' ||
    type === 'wallet_withdrawal';
  const rawAmount = asNumber(firstNumber(src.amount, src.value, src.total), 0);
  const amount = isOutflow ? -Math.abs(rawAmount) : Math.abs(rawAmount);

  return {
    ...src,
    id,
    type,
    amount,
    description: firstString(src.description, src.notes, src.details) || (type === 'expense' ? 'مصروف' : 'حركة مالية'),
    referenceId: firstString(src.referenceId, src.reference, src.saleId, src.maintenanceId, src.purchaseId),
    safeId: firstString(src.safeId, src.safe_id),
    userId: firstString(src.userId, src.user_id, src.cashierId),
    createdAt,
    // حقول إضافية للعرض فقط — الديسكتوب بيحتفظ بيها من غير ما يعتمد عليها
    date: createdAt,
    category: firstString(src.category, src.expenseCategory, type === 'expense' ? 'مصروفات عامة' : ''),
    safeName: firstString(src.safeName, src.safe_name),
    userName: firstString(src.userName, src.user_name, src.createdByName),
    branchId: firstString(src.branchId, ctx.branchId),
    branchName: firstString(src.branchName, ctx.branchName),
    updated_at: firstString(ctx.updatedAt, src.updated_at, createdAt),
  };
}

// ------------------------------------------------------------
//  الأقسام (Categories)
// ------------------------------------------------------------

export function normalizeCategoryType(raw: unknown): 'device' | 'accessory' | 'spare_part' {
  const value = asString(raw, '').trim().toLowerCase();
  if (value === 'device' || value.includes('موبايل') || value.includes('هاتف') || value.includes('جهاز')) return 'device';
  if (value === 'spare_part' || value.includes('قطع') || value.includes('غيار')) return 'spare_part';
  return 'accessory';
}

export function normalizeCategory(input: unknown, ctx: NormalizeContext = {}): AnyRecord {
  const src = isRecord(input) ? input : {};
  return {
    ...src,
    id: resolveId(src, ctx, 'cat'),
    name: firstString(src.name, src.category, src.title) || 'عام',
    type: normalizeCategoryType(src.type),
  };
}

// ------------------------------------------------------------
//  المنتجات (Inventory)
// ------------------------------------------------------------

export function normalizeInventoryItem(input: unknown, ctx: NormalizeContext = {}): AnyRecord {
  const src = isRecord(input) ? input : {};
  const id = resolveId(src, ctx, 'inv');
  const hasIMEI = asBoolean(src.hasIMEI ?? src.hasImei ?? src.has_imei);
  const barcode = firstString(src.barcode, src.code, src.sku);
  const code = firstString(src.code, src.barcode, src.sku, id);
  
  const rawQty = firstNumber(
    src.quantity,
    src.stock_quantity,
    src.quantity_in_stock,
    src.stockQuantity,
    src.qty,
    src.stock_qty,
    src.stock,
    src.count
  );
  const quantity = Math.max(0, asNumber(rawQty, 0));

  const rawCost = firstNumber(
    src.costPrice,
    src.cost_price,
    src.purchasePrice,
    src.purchase_price,
    src.cost,
    src.buyPrice,
    src.buy_price
  );
  const costPrice = asNumber(rawCost, 0);

  const rawSell = firstNumber(
    src.sellPrice,
    src.sell_price,
    src.sellingPrice,
    src.selling_price,
    src.price,
    src.unitPrice,
    src.unit_price,
    src.sale_price
  );
  const sellPrice = asNumber(rawSell, 0);

  return {
    ...src,
    id,
    name: firstString(src.name, src.productName, src.title) || 'منتج غير مسمى',
    code,
    barcode,
    categoryId: firstString(src.categoryId, src.category_id),
    costPrice,
    cost_price: costPrice,
    purchasePrice: costPrice,
    purchase_price: costPrice,
    sellPrice,
    sell_price: sellPrice,
    selling_price: sellPrice,
    price: sellPrice,
    quantity,
    stock_quantity: quantity,
    minQuantity: Math.max(0, asNumber(firstNumber(src.minQuantity, src.min_quantity, src.min, src.lowStockLimit), 2)),
    hasIMEI,
    createdAt: firstString(src.createdAt, src.date, ctx.updatedAt) || nowIso(ctx),
    // الحقول المساعدة اللي الموبايل بيقرأها
    category: firstString(src.category, src.categoryName),
    branchId: firstString(src.branchId, ctx.branchId),
    branchName: firstString(src.branchName, ctx.branchName),
    updated_at: firstString(ctx.updatedAt, src.updated_at, src.createdAt, nowIso(ctx)),
  };
}

// ------------------------------------------------------------
//  وحدات IMEI (IMEI Units)
// ------------------------------------------------------------

const IMEI_STATUS_ALIASES: Record<string, string> = {
  available: 'available',
  'in_stock': 'available',
  instock: 'available',
  متاح: 'available',
  sold: 'sold',
  مبيع: 'sold',
  مباع: 'sold',
  returned: 'returned',
  مرتجع: 'returned',
  maintenance: 'maintenance',
  صيانة: 'maintenance',
  wasted: 'wasted',
  تالف: 'wasted',
};

export function normalizeImeiStatus(raw: unknown): 'available' | 'sold' | 'returned' | 'maintenance' | 'wasted' {
  const value = asString(raw, 'available').trim().toLowerCase();
  const mapped = IMEI_STATUS_ALIASES[value] || IMEI_STATUS_ALIASES[asString(raw, '')] || 'available';
  return mapped as 'available' | 'sold' | 'returned' | 'maintenance' | 'wasted';
}

export function normalizeImeiUnit(input: unknown, ctx: NormalizeContext = {}): AnyRecord {
  const src = isRecord(input) ? input : {};
  const id = resolveId(src, ctx, 'imei');
  const imei1 = firstString(src.imei1, src.imei, src.serialNumber, src.serial);
  const conditionRaw = asString(src.condition, 'new').toLowerCase();

  return {
    ...src,
    id,
    inventoryId: firstString(src.inventoryId, src.inventory_id, src.productId, src.product_id),
    imei1,
    imei2: firstString(src.imei2, src.secondImei),
    color: firstString(src.color),
    storage: firstString(src.storage, src.capacity),
    ram: firstString(src.ram),
    condition: (conditionRaw === 'used' || conditionRaw === 'refurbished' ? conditionRaw : 'new'),
    warrantyEndDate: firstString(src.warrantyEndDate, src.warranty_end_date),
    status: normalizeImeiStatus(src.status),
    saleId: firstString(src.saleId, src.sale_id),
    customerId: firstString(src.customerId, src.customer_id),
    purchasePrice: asNumber(firstNumber(src.purchasePrice, src.purchase_price, src.costPrice, src.cost), 0),
    notes: firstString(src.notes),
    createdAt: firstString(src.createdAt, src.date, ctx.updatedAt) || nowIso(ctx),
    // حقول العرض في الموبايل
    productId: firstString(src.productId, src.inventoryId, src.inventory_id),
    imei: imei1,
    costPrice: asNumber(firstNumber(src.costPrice, src.purchasePrice, src.purchase_price), 0),
    sellPrice: asNumber(firstNumber(src.sellPrice, src.sellingPrice, src.price), 0),
    branchId: firstString(src.branchId, ctx.branchId),
    branchName: firstString(src.branchName, ctx.branchName),
    updated_at: firstString(ctx.updatedAt, src.updated_at, src.createdAt, nowIso(ctx)),
  };
}

// ------------------------------------------------------------
//  المبيعات (Sales)
// ------------------------------------------------------------

export function normalizePaymentMethod(raw: unknown): 'cash' | 'card' | 'installment' {
  const value = asString(raw, '').trim().toLowerCase();
  if (value === 'card' || value === 'installment') return value;
  if (value === 'cash') return 'cash';
  if (value.includes('فيزا') || value.includes('بطاق') || value.includes('card') || value.includes('visa') || value.includes('instapay') || value.includes('إنستاباي') || value.includes('محفظ')) return 'card';
  if (value.includes('آجل') || value.includes('اجل') || value.includes('تقسيط') || value.includes('debt') || value.includes('installment') || value.includes('credit')) return 'installment';
  return 'cash';
}

export function normalizeSaleItem(input: unknown, index = 0, ctx: NormalizeContext = {}): AnyRecord {
  const src = isRecord(input) ? input : {};
  const quantity = Math.max(0, asNumber(firstNumber(src.quantity, src.qty), 1));
  const unitPrice = asNumber(firstNumber(src.unitPrice, src.unit_price, src.price, src.sellPrice, src.sell_price), 0);
  const costPrice = asNumber(firstNumber(src.costPrice, src.cost_price, src.cost, src.purchasePrice, src.purchase_price), 0);
  const total = asNumber(firstNumber(src.total, src.lineTotal), unitPrice * quantity);

  return {
    ...src,
    id: firstString(src.id) || `${ctx.id || 'sale'}_item_${index}`,
    inventoryId: firstString(src.inventoryId, src.inventory_id, src.productId, src.product_id, src.itemId),
    productId: firstString(src.productId, src.product_id, src.inventoryId, src.inventory_id, src.itemId),
    imeiUnitId: firstString(src.imeiUnitId, src.imei_unit_id),
    quantity,
    unitPrice,
    costPrice,
    total,
    returnedQuantity: Math.max(0, asNumber(firstNumber(src.returnedQuantity, src.returned_quantity), 0)),
    name: firstString(src.name, src.productName),
    imei: firstString(src.imei, src.serial, src.serialNumber),
  };
}

export function normalizeSale(input: unknown, ctx: NormalizeContext = {}): AnyRecord {
  const src = isRecord(input) ? input : {};
  const id = resolveId(src, ctx, 'sale');
  const createdAt = firstString(src.createdAt, src.date, ctx.updatedAt) || nowIso(ctx);
  const discount = Math.max(0, asNumber(firstNumber(src.discount, src.discountAmount), 0));
  const rawTotal = asNumber(firstNumber(src.total, src.finalTotal, src.netTotal), 0);
  const rawSubtotal = asNumber(firstNumber(src.subtotal, src.grossTotal), rawTotal + discount);
  const items = asArray(src.items).map((item, index) => normalizeSaleItem(item, index, { id, now: ctx.now }));
  const itemsTotal = items.reduce((sum, item) => sum + asNumber(item.total), 0);
  const subtotal = Number.isFinite(rawSubtotal) && rawSubtotal > 0 ? rawSubtotal : (itemsTotal || rawTotal);
  const total = Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : Math.max(0, subtotal - discount);
  const paid = asNumber(firstNumber(src.paid, src.paidAmount, src.paid_amount), total);
  const remaining = asNumber(firstNumber(src.remaining, src.remainingAmount, src.remaining_amount), Math.max(0, total - paid));
  const computedCost = items.reduce((sum, item) => sum + asNumber(item.costPrice) * asNumber(item.quantity), 0);
  const rawProfit = firstNumber(src.profit);
  const profit = rawProfit !== undefined && rawProfit > 0 && rawProfit < total
    ? rawProfit
    : Math.max(0, total - computedCost);

  return {
    ...src,
    id,
    invoiceNumber: firstString(src.invoiceNumber, src.invoice_number, src.invoiceNo, src.number) || id.slice(0, 8),
    customerId: firstString(src.customerId, src.customer_id),
    customerName: firstString(src.customerName, src.customer_name),
    customerPhone: firstString(src.customerPhone, src.customer_phone),
    items,
    subtotal,
    discount,
    total,
    finalTotal: total,
    paid,
    paidAmount: paid,
    remaining,
    remainingAmount: remaining,
    profit,
    paymentMethod: normalizePaymentMethod(src.paymentMethod),
    cashierId: firstString(src.cashierId, src.userId, src.user_id, 'mobile_pos'),
    cashierName: firstString(src.cashierName, src.userName, src.cashier_name),
    safeId: firstString(src.safeId, src.safe_id),
    safeName: firstString(src.safeName, src.safe_name),
    notes: firstString(src.notes, src.note),
    createdAt,
    date: createdAt,
    branchId: firstString(src.branchId, ctx.branchId),
    branchName: firstString(src.branchName, ctx.branchName),
    updated_at: firstString(ctx.updatedAt, src.updated_at, createdAt),
  };
}

// ------------------------------------------------------------
//  الصيانة (Maintenance)
// ------------------------------------------------------------

const MAINTENANCE_STATUS_ALIASES: Record<string, string> = {
  received: 'received',
  new: 'received',
  pending: 'received',
  مستلم: 'received',
  جاري_الفحص: 'in_progress',
  inspecting: 'in_progress',
  repairing: 'in_progress',
  in_progress: 'in_progress',
  'in-progress': 'in_progress',
  قيد_الإصلاح: 'in_progress',
  ready: 'completed',
  completed: 'completed',
  منتهي: 'completed',
  جاهز: 'completed',
  delivered: 'delivered',
  تم_التسليم: 'delivered',
  مسلم: 'delivered',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  ملغي: 'cancelled',
};

export function normalizeMaintenanceStatus(raw: unknown): 'received' | 'in_progress' | 'completed' | 'delivered' | 'cancelled' {
  const value = asString(raw, 'received').trim().toLowerCase();
  const mapped = MAINTENANCE_STATUS_ALIASES[value] || MAINTENANCE_STATUS_ALIASES[asString(raw, '')] || 'received';
  return mapped as 'received' | 'in_progress' | 'completed' | 'delivered' | 'cancelled';
}

export function normalizeMaintenance(input: unknown, ctx: NormalizeContext = {}): AnyRecord {
  const src = isRecord(input) ? input : {};
  const id = resolveId(src, ctx, 'maint');
  const receivedAt = firstString(src.receivedAt, src.receivedDate, src.createdAt, ctx.updatedAt) || nowIso(ctx);
  const status = normalizeMaintenanceStatus(src.status);
  const parts = asArray(src.parts).map((part, index) => ({
    ...part,
    id: firstString(part.id) || `${id}_part_${index}`,
    inventoryId: firstString(part.inventoryId, part.inventory_id),
    name: firstString(part.name, part.partName) || 'قطعة غيار',
    quantity: Math.max(0, asNumber(firstNumber(part.quantity, part.qty), 1)),
    unitCost: asNumber(firstNumber(part.unitCost, part.cost, part.unitPrice), 0),
    total: asNumber(firstNumber(part.total), asNumber(firstNumber(part.unitCost, part.cost, part.price), 0) * asNumber(firstNumber(part.quantity, part.qty), 1)),
  }));
  const partsCost = parts.reduce((sum, part) => sum + asNumber(part.total), 0);
  const finalCost = asNumber(firstNumber(src.finalCost, src.finalPrice, src.collectedAmount, src.estimatedCost, src.expectedPrice), 0);
  const collectedAmount = asNumber(firstNumber(src.collectedAmount, src.finalCost, src.finalPrice), status === 'delivered' ? finalCost : 0);
  const costPrice = asNumber(firstNumber(src.costPrice, src.cost, partsCost), partsCost);
  const deliveredAt = firstString(src.deliveredAt, src.deliveryDate);

  return {
    ...src,
    id,
    ticketNumber: firstString(src.ticketNumber, src.ticketNo) || id.slice(0, 6),
    customerName: firstString(src.customerName, src.customer) || 'عميل صيانة',
    customerPhone: firstString(src.customerPhone, src.phone),
    deviceType: firstString(src.deviceType, src.deviceModel, src.device) || 'جهاز صيانة',
    deviceModel: firstString(src.deviceModel, src.deviceType, src.device) || 'جهاز صيانة',
    imeiLink: firstString(src.imeiLink, src.imei, src.serialNumber),
    problem: firstString(src.problem, src.issue, src.diagnosis) || 'فحص وإصلاح',
    diagnosis: firstString(src.diagnosis, src.problem, src.issue) || 'فحص وإصلاح',
    status,
    estimatedCost: asNumber(firstNumber(src.estimatedCost, src.expectedPrice, src.finalPrice), 0),
    finalCost,
    collectedAmount,
    parts,
    additionalExpenses: asNumber(firstNumber(src.additionalExpenses, src.extraCost), 0),
    profit: asNumber(firstNumber(src.profit), Math.max(0, finalCost - costPrice)),
    costPrice,
    expectedPrice: asNumber(firstNumber(src.expectedPrice, src.estimatedCost), 0),
    finalPrice: finalCost,
    technicianId: firstString(src.technicianId, src.technician),
    safeId: firstString(src.safeId, src.safe_id),
    receivedAt,
    receivedDate: receivedAt,
    completedAt: firstString(src.completedAt, src.completedDate),
    deliveredAt,
    deliveryDate: deliveredAt,
    notes: firstString(src.notes, src.note),
    createdAt: firstString(src.createdAt, ctx.updatedAt, receivedAt),
    branchId: firstString(src.branchId, ctx.branchId),
    branchName: firstString(src.branchName, ctx.branchName),
    updated_at: firstString(ctx.updatedAt, src.updated_at, receivedAt),
  };
}

// ------------------------------------------------------------
//  العملاء (Customers)
// ------------------------------------------------------------

export function normalizeCustomer(input: unknown, ctx: NormalizeContext = {}): AnyRecord {
  const src = isRecord(input) ? input : {};
  return {
    ...src,
    id: resolveId(src, ctx, 'cust'),
    name: firstString(src.name, src.customerName) || 'عميل',
    phone: firstString(src.phone, src.mobile, src.telephone),
    address: firstString(src.address),
    balance: asNumber(firstNumber(src.balance, src.debt, src.remaining), 0),
    createdAt: firstString(src.createdAt, ctx.updatedAt) || nowIso(ctx),
    updated_at: firstString(ctx.updatedAt, src.updated_at, src.createdAt, nowIso(ctx)),
  };
}

// ------------------------------------------------------------
//  الخزن والإعدادات المساعدة
// ------------------------------------------------------------

export function normalizeSafe(input: unknown, ctx: NormalizeContext = {}): AnyRecord {
  const src = isRecord(input) ? input : {};
  const rawType = asString(src.type, 'cash').toLowerCase();
  const type = rawType === 'bank' ? 'bank' : rawType === 'wallet' || rawType === 'ewallet' ? 'ewallet' : 'cash';
  return {
    ...src,
    id: resolveId(src, ctx, 'safe'),
    name: firstString(src.name, src.title) || 'خزينة',
    balance: asNumber(firstNumber(src.balance, src.amount), 0),
    isDefault: asBoolean(src.isDefault ?? src.is_default),
    type,
  };
}

// ------------------------------------------------------------
//  الموزّع العام
// ------------------------------------------------------------

/**
 * يطبّع سجل واحد حسب نوع المخزن. بيرجع نفس السجل لو المخزن غير معروف.
 */
export function normalizeRecord(store: SyncableStore | string, data: unknown, ctx: NormalizeContext = {}): AnyRecord {
  const canonical = canonicalStoreName(store) || store;
  const src = isRecord(data) ? data : {};

  switch (canonical) {
    case 'transactions':
      return normalizeTransaction(src, ctx);
    case 'inventory':
      return normalizeInventoryItem(src, ctx);
    case 'imeiUnits':
      return normalizeImeiUnit(src, ctx);
    case 'sales':
      return normalizeSale(src, ctx);
    case 'maintenance':
      return normalizeMaintenance(src, ctx);
    case 'customers':
      return normalizeCustomer(src, ctx);
    case 'categories':
      return normalizeCategory(src, ctx);
    case 'safes':
      return normalizeSafe(src, ctx);
    default:
      return {
        ...src,
        id: resolveId(src, ctx, 'rec'),
        updated_at: firstString(ctx.updatedAt, src.updated_at, src.createdAt, nowIso(ctx)),
      };
  }
}

/** يطبّع مجموعة سجلات لمخزن واحد. */
export function normalizeRecords(store: SyncableStore | string, items: unknown[], ctx: NormalizeContext = {}): AnyRecord[] {
  return items.map(item => normalizeRecord(store, item, { ...ctx, id: undefined, now: ctx.now, updatedAt: ctx.updatedAt || undefined, branchId: ctx.branchId, branchName: ctx.branchName }));
}
