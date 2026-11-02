// ============================================================
//  MOBPOS Sync Contract — العقد المشترك بين الديسكتوب والموبايل
// ------------------------------------------------------------
//  كل أسماء المخازن وأي أسماء قديمة (snake_case) بتتحول هنا لاسم
//  واحد قانوني، فمفيش سجل بيضيع بسبب اختلاف `imei_units` و`imeiUnits`.
// ============================================================

/** أسماء المخازن القانونية زي ما الديسكتوب بيسجلها في IndexedDB وSupabase. */
export const SYNCABLE_STORES = [
  'users',
  'customers',
  'categories',
  'inventory',
  'imeiUnits',
  'sales',
  'saleReturns',
  'maintenance',
  'safes',
  'transactions',
  'suppliers',
  'purchases',
  'stockWastes',
  'inventoryAudits',
  'sideAccountEntries',
  'notifications',
  'auditLogs',
] as const;

export type SyncableStore = (typeof SYNCABLE_STORES)[number];

/** المخازن الأساسية اللي بتظهر في شاشات التشغيل اليومية. */
export const CORE_STORES: readonly SyncableStore[] = [
  'categories',
  'inventory',
  'imeiUnits',
  'sales',
  'safes',
  'transactions',
  'customers',
  'maintenance',
];

const CANONICAL_BY_LOWER = new Map<string, SyncableStore>(
  SYNCABLE_STORES.map(store => [store.toLowerCase().replace(/[_\-\s]/g, ''), store])
);

/** أسماء بديلة كانت بتستخدمها نسخ الموبايل القديمة أو تكاملات خارجية. */
const EXPLICIT_ALIASES: Record<string, SyncableStore> = {
  imei_units: 'imeiUnits',
  imeiunits: 'imeiUnits',
  imei: 'imeiUnits',
  devices: 'imeiUnits',
  phones: 'imeiUnits',
  products: 'inventory',
  items: 'inventory',
  stock: 'inventory',
  sale_returns: 'saleReturns',
  salesreturns: 'saleReturns',
  returns: 'saleReturns',
  stock_wastes: 'stockWastes',
  stockwastes: 'stockWastes',
  wastes: 'stockWastes',
  inventory_audits: 'inventoryAudits',
  inventoryaudits: 'inventoryAudits',
  audits: 'inventoryAudits',
  side_account_entries: 'sideAccountEntries',
  sideaccountentries: 'sideAccountEntries',
  sideaccounts: 'sideAccountEntries',
  audit_logs: 'auditLogs',
  auditlogs: 'auditLogs',
  app_settings: 'notifications',
  settings: 'notifications',
};

/**
 * يرجع الاسم القانوني للمخزن أو `null` لو مش مخزن متزامن.
 * بيتعامل مع snake_case وkebab-case وحتى casing مختلف.
 */
export function canonicalStoreName(raw: unknown): SyncableStore | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const explicit = EXPLICIT_ALIASES[trimmed.toLowerCase()];
  if (explicit) return explicit;

  const normalized = trimmed.toLowerCase().replace(/[_\-\s]/g, '');
  return CANONICAL_BY_LOWER.get(normalized) || null;
}

export function isSyncableStore(raw: unknown): raw is SyncableStore {
  return canonicalStoreName(raw) !== null;
}

/** التحويل للشكل اللي ممكن يُستخدم في مفاتيح Supabase لو احتجناه. */
export function toSnakeStoreName(store: SyncableStore): string {
  return store.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
