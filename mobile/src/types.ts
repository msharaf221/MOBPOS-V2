export interface BranchConfig {
  id: string;
  name: string;
  city?: string;
  code?: string;
  color: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  tenantId: string;
  enabled: boolean;
  createdAt: string;
  lastSyncAt?: string;
  status?: 'connected' | 'error' | 'syncing' | 'offline';
  errorMessage?: string;
}

export interface SaleItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  cost?: number;
  imei?: string;
}

export interface SaleRecord {
  id: string;
  invoiceNumber?: string;
  date: string;
  createdAt?: string;
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
  customerId?: string;
  items: SaleItem[];
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
  type: 'sale' | 'sale_return' | 'purchase' | 'purchase_return' | 'expense' | 'deposit' | 'withdrawal' | 'transfer';
  amount: number;
  safeId: string;
  safeName?: string;
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
  category?: string;
  quantity: number;
  minQuantity?: number;
  costPrice?: number;
  sellPrice: number;
  barcode?: string;
  hasImei?: boolean;
  branchId?: string;
  branchName?: string;
}

export interface ImeiUnit {
  id: string;
  productId: string;
  productName?: string;
  imei: string;
  status: 'available' | 'sold' | 'maintenance' | 'returned';
  costPrice?: number;
  sellPrice?: number;
  branchId?: string;
  branchName?: string;
}

export interface MaintenanceOrder {
  id: string;
  ticketNumber?: string;
  customerName: string;
  customerPhone?: string;
  deviceModel: string;
  problem: string;
  status: 'received' | 'inspecting' | 'repairing' | 'ready' | 'delivered' | 'cancelled';
  costPrice?: number;
  expectedPrice?: number;
  finalPrice?: number;
  receivedDate: string;
  deliveryDate?: string;
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
  todaySalesTotal: number;
  todayProfitTotal: number;
  todayInvoicesCount: number;
  todayCashCollected: number;
  todayExpensesTotal: number;
  totalSafesBalance: number;
  lowStockCount: number;
  activeMaintenanceCount: number;
  totalCustomerDebts: number;
  hourlySales: { hour: string; total: number }[];
  recentSales: SaleRecord[];
  recentTransactions: Transaction[];
  safesList: Safe[];
  inventoryList: InventoryItem[];
  maintenanceList: MaintenanceOrder[];
  customersList: Customer[];
  lastSyncedAt?: string;
}

export interface AppSettings {
  hideAmounts: boolean; // privacy mode
  biometricLock: boolean;
  theme: 'dark' | 'light';
  autoRefreshInterval: number; // in seconds (0 = disabled, 15, 30, 60)
  soundEffects: boolean;
}
