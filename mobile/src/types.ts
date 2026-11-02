export interface BranchConfig {
  id: string;
  name: string;
  city?: string;
  code?: string;
  color: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  tenantId: string;
  /** 🔐 سر عزل المستأجر (اختياري) — مطلوب فقط مع مخطط RLS الصارم (Step 8) */
  tenantSecret?: string;
  enabled: boolean;
  createdAt: string;
  lastSyncAt?: string;
  status?: 'connected' | 'error' | 'syncing' | 'offline';
  errorMessage?: string;
  userEmail?: string;
  userName?: string;
}

export interface SaleItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  cost?: number;
  inventoryId?: string;
  /** معرّف وحدة IMEI المبيعة — لازم يوصل للديسكتوب عشان يعلّمها مباعة. */
  imeiUnitId?: string;
  costPrice?: number;
  unitPrice?: number;
  total?: number;
  returnedQuantity?: number;
  imei?: string;
}

export interface SaleRecord {
  id: string;
  invoiceNumber?: string;
  date: string;
  createdAt?: string;
  subtotal?: number;
  total: number;
  discount?: number;
  finalTotal: number;
  paidAmount?: number;
  remainingAmount?: number;
  profit?: number;
  paymentMethod?: string;
  safeId?: string;
  safeName?: string;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
  items: SaleItem[];
  notes?: string;
  branchId?: string;
  branchName?: string;
  branchColor?: string;
}

export interface Safe {
  id: string;
  name: string;
  type?: 'cash' | 'bank' | 'wallet' | 'card';
  balance: number;
  isDefault?: boolean;
  branchId?: string;
  branchName?: string;
}

export interface Transaction {
  id: string;
  date: string;
  createdAt?: string;
  type:
    | 'sale'
    | 'sale_return'
    | 'purchase'
    | 'purchase_return'
    | 'maintenance'
    | 'maintenance_cost'
    | 'expense'
    | 'deposit'
    | 'income'
    | 'withdrawal'
    | 'transfer'
    | 'return'
    | 'waste'
    | 'inventory_adjustment'
    | 'customer_payment'
    | 'wallet_deposit'
    | 'wallet_withdrawal'
    | 'capital'
    | 'side_account';
  amount: number;
  safeId: string;
  safeName?: string;
  referenceId?: string;
  description: string;
  category?: string;
  userName?: string;
  branchId?: string;
  branchName?: string;
  branchColor?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  /** اسم القسم كنص للعرض في الموبايل. */
  category?: string;
  /** معرّف القسم القانوني للديسكتوب (أهم حاجة لعرض صحيح). */
  categoryId?: string;
  quantity: number;
  minQuantity?: number;
  costPrice?: number;
  sellPrice: number;
  /** كود الصنف الداخلي. */
  code?: string;
  barcode?: string;
  hasImei?: boolean;
  hasIMEI?: boolean;
  createdAt?: string;
  updatedAt?: string;
  branchId?: string;
  branchName?: string;
  /** عدد وحدات IMEI المتاحة فعلياً للمنتج (الكمية العادية بتكون 0 للموبايلات). */
  availableImeiCount?: number;
}

export interface ImeiUnit {
  id: string;
  productId: string;
  inventoryId?: string;
  productName?: string;
  imei: string;
  imei1?: string;
  imei2?: string;
  serialNumber?: string;
  status: 'available' | 'sold' | 'maintenance' | 'returned' | 'wasted';
  saleId?: string;
  customerId?: string;
  costPrice?: number;
  sellPrice?: number;
  color?: string;
  storage?: string;
  createdAt?: string;
  branchId?: string;
  branchName?: string;
}

export interface MaintenanceOrder {
  id: string;
  ticketNumber?: string;
  customerName: string;
  customerPhone?: string;
  deviceType?: string;
  deviceModel: string;
  problem: string;
  diagnosis?: string;
  status: 'received' | 'inspecting' | 'repairing' | 'ready' | 'completed' | 'delivered' | 'cancelled';
  costPrice?: number;
  expectedPrice?: number;
  finalPrice?: number;
  collectedAmount?: number;
  profit?: number;
  receivedDate: string;
  deliveryDate?: string;
  deliveredAt?: string;
  receivedAt?: string;
  safeId?: string;
  branchId?: string;
  branchName?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  balance: number; // positive = customer owes shop, negative = shop owes customer
  branchId?: string;
  branchName?: string;
}

export interface BranchMetrics {
  branchId: string;
  branchName: string;
  branchColor: string;
  // 1. مبيعات البضاعة (Sales)
  todaySalesTotal: number;
  todaySalesProfit: number;
  todayInvoicesCount: number;
  todayCashCollected: number;
  // 2. إيرادات وأرباح الصيانة (Maintenance)
  todayMaintenanceIncome: number;
  todayMaintenanceProfit: number;
  todayMaintenanceCount: number;
  activeMaintenanceCount: number;
  // 3. الإيراد الشامل والأرباح الشاملة
  todayTotalRevenue: number;
  todayProfitTotal: number;
  todayGrossProfit?: number;
  todayNetProfit?: number;
  // 4. المصروفات والسيولة
  todayExpensesTotal: number;
  totalSafesBalance: number;
  // 5. تقييم المخزون والبضاعة
  inventoryCostValue: number;
  inventorySellValue: number;
  inventoryTotalItemsCount: number;
  lowStockCount: number;
  // 6. ديون العملاء
  totalCustomerDebts: number;
  hourlySales: { hour: string; total: number }[];
  recentSales: SaleRecord[];
  recentTransactions: Transaction[];
  safesList: Safe[];
  inventoryList: InventoryItem[];
  maintenanceList: MaintenanceOrder[];
  customersList: Customer[];
  imeiUnitsList: ImeiUnit[];
  /** عدد الكتابات المعلّقة محلياً في انتظار إعادة الإرسال للسحابة. */
  pendingOutboxCount?: number;
  lastSyncedAt?: string;
}

export interface AppSettings {
  hideAmounts: boolean; // privacy mode
  biometricLock: boolean;
  theme: 'dark' | 'light';
  autoRefreshInterval: number; // in seconds (0 = disabled, 15, 30, 60)
  soundEffects: boolean;
}
