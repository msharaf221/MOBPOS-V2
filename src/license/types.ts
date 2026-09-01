// License Plan Types
export type PlanType = 'basic' | 'pro' | 'enterprise' | 'lifetime';

export interface LicenseKey {
  id: string;
  key: string;            // The actual signed key string (MSP2...)
  plan: PlanType;
  shopName: string;       // The shop this was issued to
  issuedTo: string;       // Phone or email
  issuedAt: string;
  expiresAt: string;      // ISO date, or '' for lifetime
  lifetime: boolean;
  isActive: boolean;
  maxUsers: number;
  notes: string;
}

export interface ActiveLicense {
  keyId: string;          // unique id inside the signed key
  key: string;            // original signed key string (re-verified on startup)
  plan: PlanType;
  shopName: string;
  activatedAt: string;
  expiresAt: string;      // ISO date, or '' for lifetime
  lifetime: boolean;
  maxUsers: number;
  deviceId: string;       // server-facing fingerprint hash captured at activation
  deviceFingerprint?: unknown; // v3 fuzzy signals for local majority matching (4-of-6)
  machineToken?: string;  // إيصال سري من سيرفر التفعيل — يُصدر عند أول تفعيل ويُقدَّم عند كل إعادة تحقق
  lastVerifiedAt?: string; // آخر إعادة تحقق ناجحة مع سيرفر التفعيل (ISO)
}

// Features available per plan
export interface PlanFeatures {
  name: string;
  nameAr: string;
  maxUsers: number;
  maxProducts: number;
  maxIMEI: number;
  maxCustomers: number;
  modules: string[];       // Which page IDs are accessible
  hasFinance: boolean;
  hasIMEI: boolean;
  hasMaintenance: boolean;
  hasMultipleSafes: boolean;
  hasSuppliers: boolean;
  hasReports: boolean;
  hasBackup: boolean;
  hasDarkMode: boolean;
  price: string;
}

const FULL_MODULES = ['dashboard', 'pos', 'inventory', 'inventoryAudit', 'imei', 'maintenance', 'customers', 'sales', 'safes', 'finance', 'sideAccounts', 'suppliers', 'purchases', 'users', 'settings'];

export const PLAN_FEATURES: Record<PlanType, PlanFeatures> = {
  basic: {
    name: 'Basic',
    nameAr: 'أساسي',
    maxUsers: 2,
    maxProducts: 50,
    maxIMEI: 30,
    maxCustomers: 100,
    modules: ['dashboard', 'pos', 'inventory', 'inventoryAudit', 'customers', 'sales', 'sideAccounts', 'settings'],
    hasFinance: false,
    hasIMEI: false,
    hasMaintenance: false,
    hasMultipleSafes: false,
    hasSuppliers: false,
    hasReports: false,
    hasBackup: false,
    hasDarkMode: false,
    price: 'مجاني',
  },
  pro: {
    name: 'Professional',
    nameAr: 'احترافي',
    maxUsers: 8,
    maxProducts: 500,
    maxIMEI: 300,
    maxCustomers: 1000,
    modules: FULL_MODULES,
    hasFinance: true,
    hasIMEI: true,
    hasMaintenance: true,
    hasMultipleSafes: true,
    hasSuppliers: true,
    hasReports: true,
    hasBackup: true,
    hasDarkMode: true,
    price: '499 ج.م/شهر',
  },
  enterprise: {
    name: 'Enterprise',
    nameAr: 'مؤسسي',
    maxUsers: 50,
    maxProducts: 99999,
    maxIMEI: 99999,
    maxCustomers: 99999,
    modules: FULL_MODULES,
    hasFinance: true,
    hasIMEI: true,
    hasMaintenance: true,
    hasMultipleSafes: true,
    hasSuppliers: true,
    hasReports: true,
    hasBackup: true,
    hasDarkMode: true,
    price: '999 ج.م/شهر',
  },
  lifetime: {
    name: 'Lifetime',
    nameAr: 'اشتراك دائم',
    maxUsers: 8,
    maxProducts: 99999,
    maxIMEI: 99999,
    maxCustomers: 99999,
    modules: FULL_MODULES,
    hasFinance: true,
    hasIMEI: true,
    hasMaintenance: true,
    hasMultipleSafes: true,
    hasSuppliers: true,
    hasReports: true,
    hasBackup: true,
    hasDarkMode: true,
    price: 'دفعة واحدة مدى الحياة',
  },
};
