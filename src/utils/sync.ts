// ============================================================
//  المزامنة بين الأجهزة عبر Supabase (اختيارية — تُفعَّل من الإعدادات)
//  كل مخزن بيانات يُرفع كصف JSON واحد معزول بـ tenant_id، والاستعادة بأسلوب الأحدث
// ============================================================

import { indexedDBUtils } from '../hooks/useIndexedDB';
import { getStoredLicense } from '../license/engine';

const CFG_URL = 'mobpos_sync_url';
const CFG_KEY = 'mobpos_sync_key';
const CFG_TENANT = 'mobpos_sync_tenant';

export interface SyncConfig {
  url: string;   // https://xxxx.supabase.co
  anonKey: string;
  tenantId?: string;
}

/** الحصول على معرّف المتجر/المستأجر الحالي للمزامنة */
export function getTenantId(): string {
  const custom = (localStorage.getItem(CFG_TENANT) || '').trim();
  if (custom) return custom;
  const license = getStoredLicense(true);
  if (license?.keyId) return license.keyId;
  return 'default-store';
}

export function getSyncConfig(): SyncConfig {
  return {
    url: (localStorage.getItem(CFG_URL) || '').trim(),
    anonKey: (localStorage.getItem(CFG_KEY) || '').trim(),
    tenantId: getTenantId(),
  };
}

export function saveSyncConfig(cfg: SyncConfig): void {
  localStorage.setItem(CFG_URL, cfg.url.trim());
  localStorage.setItem(CFG_KEY, cfg.anonKey.trim());
  if (cfg.tenantId !== undefined) {
    localStorage.setItem(CFG_TENANT, cfg.tenantId.trim());
  }
}

export function isSyncConfigured(): boolean {
  const c = getSyncConfig();
  return !!c.url && !!c.anonKey;
}

interface StoreRow {
  tenant_id: string;
  store: string;
  data: unknown;
  updated_at: string;
}

async function fetchRows(cfg: SyncConfig): Promise<StoreRow[]> {
  const tenantId = cfg.tenantId || getTenantId();
  const url = `${cfg.url.replace(/\/$/, '')}/rest/v1/mobpos_stores?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
    },
  });
  if (!res.ok) throw new Error(`قراءة المزامنة فشلت (${res.status})`);
  return (await res.json()) as StoreRow[];
}

const SYNCABLE_STORES = () =>
  Object.values(indexedDBUtils.STORES).filter(s => s !== indexedDBUtils.STORES.backups);

/** رفع كل بيانات هذا الجهاز إلى السحابة معزولة بـ tenant_id. */
export async function pushAll(): Promise<number> {
  const cfg = getSyncConfig();
  if (!isSyncConfigured()) throw new Error('اضبط رابط Supabase والمفتاح أولاً');

  const tenantId = cfg.tenantId || getTenantId();
  const stores = SYNCABLE_STORES();
  let count = 0;
  for (const store of stores) {
    const data = await indexedDBUtils.getAll(store);
    const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/mobpos_stores`, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        store,
        data,
        updated_at: new Date().toISOString()
      }),
    });
    if (!res.ok) throw new Error(`رفع "${store}" فشل (${res.status})`);
    count++;
  }
  return count;
}

/** تنزيل بيانات السحابة لهذا المتجر واستبدال البيانات المحلية بها. */
export async function pullAll(): Promise<number> {
  const cfg = getSyncConfig();
  if (!isSyncConfigured()) throw new Error('اضبط رابط Supabase والمفتاح أولاً');

  const rows = await fetchRows(cfg);
  let count = 0;
  for (const row of rows) {
    if (!SYNCABLE_STORES().includes(row.store)) continue;
    if (!Array.isArray(row.data)) continue;
    await indexedDBUtils.replaceStoreData(row.store, row.data as { id: string }[]);
    count++;
  }
  return count;
}
