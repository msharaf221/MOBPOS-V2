import { 
  User, Customer, Category, InventoryItem, IMEIUnit, 
  Sale, SaleReturn, Maintenance, Safe, Transaction, Supplier, Notification, StockWaste,
  InventoryAudit, SideAccountEntry
} from '../types';

// ============================================================
//  بيانات النظام الافتراضية - نظيفة وفاضية من أي شغل تجريبي
//  العمليات الحقيقية (مبيعات، مخزون، عملاء) تبدأ من الصفر
// ============================================================

const now = () => new Date().toISOString();

// ============ USERS ============
// مستخدم admin واحد فقط للدخول (يُجبر على تغيير كلمة المرور الافتراضية عند أول تسجيل دخول)
export const initialUsers: User[] = [
  { 
    id: 'u1', 
    username: 'admin', 
    password: 'admin123', 
    name: 'مدير المحل', 
    role: 'admin', 
    createdAt: now(),
    mustChangePassword: true,
  },
];

// ============ CUSTOMERS ============
export const initialCustomers: Customer[] = [];

// ============ CATEGORIES ============
// التصنيفات الأساسية (هيكل النظام) - تساعد العميل على إضافة المنتجات بسرعة
export const initialCategories: Category[] = [
  { id: 'cat1', name: 'هواتف Apple', type: 'device' },
  { id: 'cat2', name: 'هواتف Samsung', type: 'device' },
  { id: 'cat3', name: 'هواتف Xiaomi', type: 'device' },
  { id: 'cat4', name: 'هواتف OPPO/Realme', type: 'device' },
  { id: 'cat5', name: 'هواتف أخرى', type: 'device' },
  { id: 'cat6', name: 'تابلت', type: 'device' },
  { id: 'cat7', name: 'ساعات ذكية', type: 'device' },
  { id: 'cat8', name: 'سماعات', type: 'accessory' },
  { id: 'cat9', name: 'شواحن وكابلات', type: 'accessory' },
  { id: 'cat10', name: 'جرابات وكفرات', type: 'accessory' },
  { id: 'cat11', name: 'واقي شاشة', type: 'accessory' },
  { id: 'cat12', name: 'باور بانك', type: 'accessory' },
  { id: 'cat13', name: 'شاشات LCD', type: 'spare_part' },
  { id: 'cat14', name: 'بطاريات', type: 'spare_part' },
  { id: 'cat15', name: 'كابلات فليكس', type: 'spare_part' },
  { id: 'cat16', name: 'كاميرات', type: 'spare_part' },
  { id: 'cat17', name: 'سماعات داخلية', type: 'spare_part' },
  { id: 'cat18', name: 'أدوات صيانة', type: 'spare_part' },
];

// ============ INVENTORY ============
export const initialInventory: InventoryItem[] = [];

// ============ IMEI UNITS ============
export const initialIMEIUnits: IMEIUnit[] = [];

// ============ SALES ============
export const initialSales: Sale[] = [];

// ============ SALE RETURNS ============
export const initialSaleReturns: SaleReturn[] = [];

// ============ MAINTENANCE ============
export const initialMaintenance: Maintenance[] = [];

// ============ SAFES ============
// خزنة رئيسية واحدة فقط (لازمة لعملية البيع والصيانة)
export const initialSafes: Safe[] = [
  { id: 'safe1', name: 'الخزنة الرئيسية', balance: 0, isDefault: true },
];

// ============ SUPPLIERS ============
export const initialSuppliers: Supplier[] = [];

// ============ STOCK WASTE ============
export const initialStockWastes: StockWaste[] = [];

// ============ INVENTORY AUDITS ============
export const initialInventoryAudits: InventoryAudit[] = [];

// ============ SIDE ACCOUNTS ============
export const initialSideAccountEntries: SideAccountEntry[] = [];

// ============ TRANSACTIONS ============
export const initialTransactions: Transaction[] = [];

// ============ NOTIFICATIONS ============
export const initialNotifications: Notification[] = [];
