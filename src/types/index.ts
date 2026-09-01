// Types for MOBPOS Management System

// User & Auth Types
export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: 'admin' | 'manager' | 'staff';
  createdAt: string;
  mustChangePassword?: boolean;
}

// Customer Types
export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  balance: number;
  createdAt: string;
}

// Category Types
export interface Category {
  id: string;
  name: string;
  type: 'device' | 'accessory' | 'spare_part';
}

// Inventory Types (Product Templates)
export interface InventoryItem {
  id: string;
  name: string;
  code: string;
  barcode: string;
  categoryId: string;
  costPrice: number;
  sellPrice: number;
  quantity: number;
  minQuantity: number;
  hasIMEI: boolean;
  createdAt: string;
}

// IMEI Unit Types (Individual Devices)
export interface IMEIUnit {
  id: string;
  inventoryId: string;
  imei1: string;
  imei2: string;
  color: string;
  storage: string;
  ram: string;
  condition: 'new' | 'used' | 'refurbished';
  warrantyEndDate: string;
  status: 'available' | 'sold' | 'returned' | 'maintenance' | 'wasted';
  saleId: string;
  customerId: string;
  purchasePrice: number;
  notes: string;
  createdAt: string;
}

// Sale Types
export interface SaleItem {
  id: string;
  inventoryId: string;
  imeiUnitId?: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  total: number;
  returnedQuantity: number;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerId: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
  profit: number;
  paymentMethod: 'cash' | 'card' | 'installment';
  cashierId: string;
  safeId: string;
  notes: string;
  createdAt: string;
}

// Sale Return Types
export interface SaleReturn {
  id: string;
  saleId: string;
  saleItemId: string;
  inventoryId: string;
  imeiUnitId?: string;
  quantity: number;
  refundAmount: number;
  reason: string;
  createdAt: string;
  processedBy: string;
}

// Maintenance Types
export interface MaintenancePart {
  id: string;
  inventoryId: string;
  name: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface Maintenance {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  deviceType: string;
  deviceModel: string;
  imeiLink: string;
  problem: string;
  diagnosis: string;
  status: 'received' | 'in_progress' | 'completed' | 'delivered' | 'cancelled';
  estimatedCost: number;
  finalCost: number;
  collectedAmount: number;
  parts: MaintenancePart[];
  additionalExpenses: number;
  profit: number;
  technicianId: string;
  safeId: string;
  receivedAt: string;
  completedAt: string;
  deliveredAt: string;
  notes: string;
}

// Safe/Cash Register Types
export interface Safe {
  id: string;
  name: string;
  balance: number;
  isDefault: boolean;
  type?: 'cash' | 'ewallet' | 'bank';
}

// Transaction Types
export interface Transaction {
  id: string;
  type: 'sale' | 'purchase' | 'maintenance' | 'expense' | 'income' | 'transfer' | 'return' | 'waste' | 'customer_payment' | 'wallet_deposit' | 'wallet_withdrawal' | 'capital' | 'side_account';
  amount: number;
  description: string;
  referenceId: string;
  safeId: string;
  userId: string;
  createdAt: string;
}

// Supplier Types
export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  balance: number;
}

// Waste / Scrap Types
export interface StockWaste {
  id: string;
  inventoryId: string;
  supplierId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  reason: string;
  notes: string;
  createdAt: string;
  userId: string;
}

// Inventory audit / stock count types
export interface InventoryAuditItem {
  id: string;
  inventoryId: string;
  productName: string;
  code: string;
  categoryName: string;
  hasIMEI: boolean;
  costPrice: number;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  differenceCost: number;
  notes: string;
}

export interface InventoryAudit {
  id: string;
  auditNumber: string;
  title: string;
  status: 'draft' | 'applied';
  items: InventoryAuditItem[];
  totalShortage: number;
  totalSurplus: number;
  netDifferenceCost: number;
  notes: string;
  userId: string;
  createdAt: string;
  appliedAt: string;
}

// Side accounts / external ledger types
export type SideAccountEntryType = 'receivable' | 'payable' | 'incoming' | 'outgoing';
export type SideAccountImpact = 'none' | 'main_safe' | 'capital' | 'separate_safe';
export type SideAccountStatus = 'open' | 'partial' | 'settled';

export interface SideAccountEntry {
  id: string;
  partyName: string;
  type: SideAccountEntryType;
  impact: SideAccountImpact;
  amount: number;
  paidAmount: number;
  status: SideAccountStatus;
  description: string;
  notes: string;
  safeId: string;
  safeDelta: number;
  transactionId: string;
  userId: string;
  createdAt: string;
  dueDate: string;
}

// Purchase Types
export interface PurchaseItem {
  id: string;
  inventoryId: string;
  quantity: number;
  unitCost: number;
  total: number;
  /** معرّفات وحدات IMEI اللي اتولدت من البند ده (للمنتجات اللي بسيريال) */
  imeiUnitIds?: string[];
}

export interface Purchase {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  items: PurchaseItem[];
  total: number;
  paid: number;
  remaining: number;
  /** الخزنة اللي اتدفع منها المبلغ المدفوع ('' لو الفاتورة آجل بالكامل) */
  safeId: string;
  userId: string;
  notes: string;
  createdAt: string;
}

// Notification Types
export type NotificationType =
  | 'low_stock'
  | 'warranty_expiring'
  | 'maintenance_delayed'
  | 'customer_debt'
  | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  /**
   * Where the notification came from:
   *  - 'auto'   → generated live from shop data by `src/utils/alerts.ts`
   *               (removed automatically once its condition no longer holds).
   *  - 'system' → one-off event pushed by the app itself.
   *  - undefined → legacy row imported from an old backup (hidden by the
   *                one-time cleanup migration in `useStore`).
   */
  source?: 'auto' | 'system';
  /** Page id to open when the notification is clicked (e.g. 'inventory'). */
  link?: string;
  /**
   * Hidden from the list and from the unread badge. Kept in the store (instead
   * of deleted) so the alerts engine never resurrects an alert the user has
   * already dismissed while its condition is still true.
   */
  dismissed?: boolean;
}

// App State Types
export interface AppState {
  currentUser: User | null;
  isDarkMode: boolean;
  sidebarCollapsed: boolean;
}

// Persistent app settings
export interface AppSettings {
  language?: string;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  receiptFooter: string;
  notifSound: boolean;
  autoRefresh: boolean;
  /** Shop logo stored as a data: URL (e.g. data:image/png;base64,...) */
  shopLogo?: string;
  /** Brand accent color as a hex string (e.g. #3b82f6) */
  accentColor?: string;
  /** Overall visual theme style, on top of light/dark mode */
  themeStyle?: 'default' | 'midnightGold';
  /**
   * إظهار أسعار قطع الغيار في إيصال الصيانة الخاص بالعميل.
   * افتراضياً `false` — أسعار القطع دي تكلفة المحل (سر تجاري)، وإظهارها
   * بيخلي العميل يقدر يحسب المصنعية بالطرح من الإجمالي.
   */
  maintenanceReceiptShowPartPrices?: boolean;
}
