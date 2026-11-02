// ============================================================
//  المحرك المحاسبي والمالي الموحد — Unified Accounting & Financial Engine
// ------------------------------------------------------------
//  Single Source of Truth للحسابات المالية المشتركة بين
//  الديسكتوب والموبايل:
//  1. الفصل الصارم بين التدفقات النقدية (Cash Flow) وقائمة الدخل (P&L).
//  2. الإيرادات = مبيعات البضاعة (صافي) + إيرادات الصيانة المسلمة + الإيرادات التشغيلية الأخرى.
//  3. مجمل الربح = أرباح مبيعات البضاعة (صافي) + أرباح الصيانة المسلمة + الإيرادات التشغيلية الأخرى.
//  4. صافي أرباح التشغيل = مجمل الربح - (المصروفات التشغيلية + الهوالك).
//  5. منع القسمة على صفر ومعالجة حالات الخسارة الصريحة.
//  6. حساب رأس المال في بضاعة المخزن بالتكلفة بدقة تامة.
// ============================================================

export interface MinimalTransaction {
  id?: string;
  type: string;
  amount: number;
  date?: string;
  createdAt?: string;
  category?: string;
  description?: string;
  safeId?: string;
}

export interface MinimalSaleItem {
  id?: string;
  quantity?: number;
  unitPrice?: number;
  costPrice?: number;
  cost?: number;
  price?: number;
  total?: number;
  returnedQuantity?: number;
}

export interface MinimalSale {
  id?: string;
  total: number;
  profit?: number;
  createdAt?: string;
  date?: string;
  items?: MinimalSaleItem[];
}

export interface MinimalSaleReturn {
  id?: string;
  quantity?: number;
  refundAmount?: number;
  netValue?: number;
  costValue?: number;
  profitImpact?: number;
  debtForgiven?: number;
  createdAt?: string;
  date?: string;
}

export interface MinimalMaintenance {
  id?: string;
  status: string;
  collectedAmount?: number;
  finalPrice?: number;
  finalCost?: number;
  costPrice?: number;
  profit?: number;
  completedAt?: string;
  deliveredAt?: string;
  createdAt?: string;
}

export interface MinimalStockWaste {
  id?: string;
  quantity?: number;
  totalCost: number;
  createdAt?: string;
}

export interface MinimalInventoryItem {
  id?: string;
  costPrice?: number;
  cost_price?: number;
  purchasePrice?: number;
  purchase_price?: number;
  cost?: number;
  sellPrice?: number;
  selling_price?: number;
  sell_price?: number;
  price?: number;
  quantity?: number;
  stock_quantity?: number;
  quantity_in_stock?: number;
  minQuantity?: number;
  hasIMEI?: boolean;
  hasImei?: boolean;
}

/** المعاملات غير التشغيلية: تؤثر فقط على رصيد الخزينة (Cash Flow) ولا تدخل في الأرباح والخسائر (P&L) */
export const NON_PNL_TRANSACTION_TYPES = new Set([
  'capital',              // رأس مال / تمويل المالك
  'withdrawal',           // مسحوبات المالك الشخصية
  'transfer',             // تحويل بين الخزائن
  'wallet_deposit',       // إيداع محفظة وسيط (حركة نقدية عابرة)
  'wallet_withdrawal',    // سحب محفظة وسيط (حركة نقدية عابرة)
  'side_account',         // حساب جانبي شخصي
  'customer_payment',     // تحصيل آجل (المبيعة سُجلت من قبل)
  'supplier_payment',     // سداد مورد (تحويل سيولة لأصل)
  'purchase',             // شراء بضاعة المخزن (تحويل أصل نقدي لأصل مخزني)
]);

export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function asValidNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * فحص هل الحركة تؤثر على قائمة الدخل (تشغيلية) أم حركة تدفق نقدي فقط
 */
export function isPnlTransaction(type: string): boolean {
  const norm = String(type || '').trim().toLowerCase();
  return !NON_PNL_TRANSACTION_TYPES.has(norm);
}

/**
 * فحص نوع المصروف التشغيلي الفعلي
 */
export function isOperationalExpense(t: MinimalTransaction): boolean {
  const type = String(t.type || '').trim().toLowerCase();
  if (!isPnlTransaction(type)) return false;
  return type === 'expense' || type === 'maintenance_cost' || (type !== 'income' && t.amount < 0);
}

/**
 * فحص نوع الإيراد التشغيلي الإضافي (غير المبيعات والصيانة)
 */
export function isOperationalIncome(t: MinimalTransaction): boolean {
  const type = String(t.type || '').trim().toLowerCase();
  if (!isPnlTransaction(type)) return false;
  return type === 'income' || (t.amount > 0 && type !== 'expense');
}

/**
 * مبيعات البضاعة مع المرتجعات
 */
export interface MerchandiseSalesResult {
  grossSalesRevenue: number;
  grossSalesProfit: number;
  returnedRevenue: number;
  returnedProfit: number;
  netSalesRevenue: number;
  netSalesProfit: number;
}

export function calculateMerchandiseSales(
  sales: readonly MinimalSale[],
  returns: readonly MinimalSaleReturn[] = []
): MerchandiseSalesResult {
  const grossSalesRevenue = sales.reduce((sum, s) => sum + asValidNumber(s.total, 0), 0);
  const grossSalesProfit = sales.reduce((sum, s) => sum + asValidNumber(s.profit, 0), 0);

  // حساب أثر المرتجعات
  let returnedRevenue = 0;
  let returnedProfit = 0;

  for (const r of returns) {
    if (r.netValue !== undefined) {
      returnedRevenue += asValidNumber(r.netValue, 0);
      returnedProfit += asValidNumber(r.profitImpact, 0);
    }
  }

  const netSalesRevenue = roundMoney(Math.max(0, grossSalesRevenue - returnedRevenue));
  const netSalesProfit = roundMoney(grossSalesProfit - returnedProfit);

  return {
    grossSalesRevenue: roundMoney(grossSalesRevenue),
    grossSalesProfit: roundMoney(grossSalesProfit),
    returnedRevenue: roundMoney(returnedRevenue),
    returnedProfit: roundMoney(returnedProfit),
    netSalesRevenue,
    netSalesProfit,
  };
}

/**
 * قسم الصيانة
 */
export interface MaintenanceResult {
  maintRevenue: number;
  maintCost: number;
  maintProfit: number;
  deliveredCount: number;
}

export function calculateMaintenance(
  maintenanceList: readonly MinimalMaintenance[]
): MaintenanceResult {
  const delivered = maintenanceList.filter(m => m.status === 'delivered');
  let maintRevenue = 0;
  let maintCost = 0;
  let maintProfit = 0;

  for (const m of delivered) {
    const rev = asValidNumber(m.finalPrice, asValidNumber(m.collectedAmount, 0));
    const cost = asValidNumber(m.finalCost, asValidNumber(m.costPrice, 0));
    const profit = m.profit !== undefined ? asValidNumber(m.profit, 0) : Math.max(0, rev - cost);

    maintRevenue += rev;
    maintCost += cost;
    maintProfit += profit;
  }

  return {
    maintRevenue: roundMoney(maintRevenue),
    maintCost: roundMoney(maintCost),
    maintProfit: roundMoney(maintProfit),
    deliveredCount: delivered.length,
  };
}

/**
 * تجميع المعاملات المالية (تشغيلي vs غير تشغيلي)
 */
export interface TransactionBreakdown {
  otherOperatingIncome: number;
  operatingExpenses: number;
  wasteFromTransactions: number;
  capitalInflow: number;
  ownerWithdrawals: number;
}

export function calculateTransactionsBreakdown(
  transactions: readonly MinimalTransaction[]
): TransactionBreakdown {
  let otherOperatingIncome = 0;
  let operatingExpenses = 0;
  let wasteFromTransactions = 0;
  let capitalInflow = 0;
  let ownerWithdrawals = 0;

  for (const t of transactions) {
    const type = String(t.type || '').trim().toLowerCase();
    const absAmount = Math.abs(asValidNumber(t.amount, 0));

    if (type === 'capital' || (type === 'deposit' && !isOperationalIncome(t))) {
      capitalInflow += absAmount;
    } else if (type === 'withdrawal') {
      ownerWithdrawals += absAmount;
    } else if (type === 'waste') {
      wasteFromTransactions += absAmount;
    } else if (isOperationalExpense(t)) {
      operatingExpenses += absAmount;
    } else if (isOperationalIncome(t)) {
      otherOperatingIncome += absAmount;
    }
  }

  return {
    otherOperatingIncome: roundMoney(otherOperatingIncome),
    operatingExpenses: roundMoney(operatingExpenses),
    wasteFromTransactions: roundMoney(wasteFromTransactions),
    capitalInflow: roundMoney(capitalInflow),
    ownerWithdrawals: roundMoney(ownerWithdrawals),
  };
}

/**
 * قائمة الدخل والأرباح الشاملة (Comprehensive P&L)
 */
export interface ComprehensivePnlResult {
  // الإيرادات
  netSalesRevenue: number;
  maintRevenue: number;
  otherOperatingIncome: number;
  totalOperatingRevenue: number;

  // مجمل الربح
  netSalesProfit: number;
  maintProfit: number;
  grossOperatingProfit: number;

  // التكاليف والمصروفات
  operatingExpenses: number;
  wasteTotal: number;
  totalDeductions: number;

  // صافي الربح
  netOperatingProfit: number;

  // هوامش ومؤشرات
  profitMarginPct: number;
  isLoss: boolean;
  isZeroRevenue: boolean;
  statusLabel: 'ربح' | 'خسارة' | 'متعادل';
}

export function calculateComprehensivePnl(params: {
  sales: readonly MinimalSale[];
  returns?: readonly MinimalSaleReturn[];
  maintenance?: readonly MinimalMaintenance[];
  transactions?: readonly MinimalTransaction[];
  stockWastes?: readonly MinimalStockWaste[];
}): ComprehensivePnlResult {
  const { sales, returns = [], maintenance = [], transactions = [], stockWastes = [] } = params;

  // 1. مبيعات البضاعة
  const salesResult = calculateMerchandiseSales(sales, returns);

  // 2. الصيانة
  const maintResult = calculateMaintenance(maintenance);

  // 3. المعاملات الإضافية
  const txBreakdown = calculateTransactionsBreakdown(transactions);

  // 4. الهوالك (من جدول الهوالك أو من القيود الدفترية)
  const wastesCost = stockWastes.reduce((sum, w) => sum + asValidNumber(w.totalCost, 0), 0);
  const totalWaste = roundMoney(wastesCost + txBreakdown.wasteFromTransactions);

  // 5. إجمالي الإيرادات = مبيعات البضاعة + إيرادات الصيانة + أي دخل تشغيلي آخر
  const totalOperatingRevenue = roundMoney(
    salesResult.netSalesRevenue + maintResult.maintRevenue + txBreakdown.otherOperatingIncome
  );

  // 6. مجمل الربح = أرباح مبيعات البضاعة + أرباح الصيانة + أي دخل تشغيلي آخر
  const grossOperatingProfit = roundMoney(
    salesResult.netSalesProfit + maintResult.maintProfit + txBreakdown.otherOperatingIncome
  );

  // 7. إجمالي المصروفات والهوالك
  const totalDeductions = roundMoney(txBreakdown.operatingExpenses + totalWaste);

  // 8. صافي أرباح التشغيل = مجمل الربح - (المصروفات + الهوالك)
  const netOperatingProfit = roundMoney(grossOperatingProfit - totalDeductions);

  // 9. هامش الربح التشغيلي وحالات الخسارة
  const isZeroRevenue = totalOperatingRevenue <= 0;
  const isLoss = netOperatingProfit < 0;

  let profitMarginPct = 0;
  if (!isZeroRevenue) {
    profitMarginPct = Math.round((netOperatingProfit / totalOperatingRevenue) * 100);
  } else if (isLoss) {
    // إيراد صفر وخسارة: لا نقسم على صفر بل نضع علامة خسارة صريحة
    profitMarginPct = 0;
  }

  const statusLabel = isLoss ? 'خسارة' : netOperatingProfit > 0 ? 'ربح' : 'متعادل';

  return {
    netSalesRevenue: salesResult.netSalesRevenue,
    maintRevenue: maintResult.maintRevenue,
    otherOperatingIncome: txBreakdown.otherOperatingIncome,
    totalOperatingRevenue,

    netSalesProfit: salesResult.netSalesProfit,
    maintProfit: maintResult.maintProfit,
    grossOperatingProfit,

    operatingExpenses: txBreakdown.operatingExpenses,
    wasteTotal: totalWaste,
    totalDeductions,

    netOperatingProfit,
    profitMarginPct,
    isLoss,
    isZeroRevenue,
    statusLabel,
  };
}

/**
 * حساب رأس المال في بضاعة المخزن بدقة تامة
 */
export interface InventoryValuationResult {
  totalCapitalAtCost: number;
  totalRetailValue: number;
  totalPiecesCount: number;
  totalProductsCount: number;
  potentialProfit: number;
}

export function extractItemCostPrice(item: MinimalInventoryItem): number {
  return asValidNumber(
    item.costPrice ??
    item.cost_price ??
    item.purchasePrice ??
    item.purchase_price ??
    item.cost,
    0
  );
}

export function extractItemSellPrice(item: MinimalInventoryItem): number {
  return asValidNumber(
    item.sellPrice ??
    item.selling_price ??
    item.sell_price ??
    item.price,
    0
  );
}

export function extractItemQuantity(item: MinimalInventoryItem): number {
  return Math.max(
    0,
    asValidNumber(
      item.quantity ??
      item.stock_quantity ??
      item.quantity_in_stock,
      0
    )
  );
}

export function calculateInventoryValuation(
  inventory: readonly MinimalInventoryItem[]
): InventoryValuationResult {
  let totalCost = 0;
  let totalRetail = 0;
  let totalPieces = 0;

  for (const item of inventory) {
    const qty = extractItemQuantity(item);
    const cost = extractItemCostPrice(item);
    const sell = extractItemSellPrice(item);

    if (qty > 0) {
      totalPieces += qty;
      totalCost += qty * cost;
      totalRetail += qty * sell;
    }
  }

  const totalCapitalAtCost = roundMoney(totalCost);
  const totalRetailValue = roundMoney(totalRetail);
  const potentialProfit = roundMoney(Math.max(0, totalRetailValue - totalCapitalAtCost));

  return {
    totalCapitalAtCost,
    totalRetailValue,
    totalPiecesCount: totalPieces,
    totalProductsCount: inventory.length,
    potentialProfit,
  };
}
