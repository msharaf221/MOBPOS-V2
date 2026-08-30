// ============================================================
//  المزامنة بين الأجهزة عبر Supabase (اختيارية — تُفعَّل من الإعدادات)
//  كل مخزن بيانات يُرفع كصف JSON واحد، مع عزل صفوف حسب مالك Supabase
// ============================================================

import { indexedDBUtils } from '../hooks/useIndexedDB';
import { getStoredLicense } from '../license/engine';

const CFG_URL = 'mobpos_sync_url';
const CFG_KEY = 'mobpos_sync_key';
const CFG_ACCESS_TOKEN = 'mobpos_sync_access_token';
const CFG_TENANT = 'mobpos_sync_tenant';
const SYNC_TIMEOUT_MS = 30_000;
const MAX_SYNC_PAYLOAD_BYTES = 50 * 1024 * 1024;

export interface SyncConfig {
  url: string;   // https://xxxx.supabase.co
  anonKey: string;
  /** A Supabase Auth access token. The public anon key is not sufficient for RLS. */
  accessToken: string;
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
    accessToken: (localStorage.getItem(CFG_ACCESS_TOKEN) || '').trim(),
    tenantId: getTenantId(),
  };
}

export function saveSyncConfig(cfg: SyncConfig): void {
  localStorage.setItem(CFG_URL, cfg.url.trim());
  localStorage.setItem(CFG_KEY, cfg.anonKey.trim());
  localStorage.setItem(CFG_ACCESS_TOKEN, cfg.accessToken.trim());
  if (cfg.tenantId !== undefined) {
    localStorage.setItem(CFG_TENANT, cfg.tenantId.trim());
  }
}

function validateConfig(cfg: SyncConfig): void {
  if (!cfg.url || !cfg.anonKey || !cfg.accessToken) {
    throw new Error('أدخل رابط Supabase والمفتاح العام وتوكن حساب Supabase أولاً');
  }
  let parsed: URL;
  try {
    parsed = new URL(cfg.url);
  } catch {
    throw new Error('رابط Supabase غير صالح');
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('رابط Supabase يجب أن يكون HTTPS صالحاً بدون بيانات دخول');
  }
  if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error('يجب استخدام HTTPS مع Supabase');
  }
  const tenantId = cfg.tenantId || getTenantId();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)) {
    throw new Error('معرّف المتجر غير صالح');
  }
}

export function isSyncConfigured(): boolean {
  const c = getSyncConfig();
  try {
    validateConfig(c);
    return true;
  } catch {
    return false;
  }
}

interface StoreRow {
  tenant_id: string;
  store: string;
  data: unknown;
  updated_at: string;
}

const SYNCABLE_STORES = () =>
  Object.values(indexedDBUtils.STORES).filter(
    s => s !== indexedDBUtils.STORES.backups && s !== indexedDBUtils.STORES.settings
  );

function authHeaders(cfg: SyncConfig, includeContentType = false): Record<string, string> {
  return {
    apikey: cfg.anonKey,
    // Supabase RLS evaluates the JWT in Authorization. Sending the anon key
    // here would make every request anonymous and is not a tenant boundary.
    Authorization: `Bearer ${cfg.accessToken}`,
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('انتهت مهلة الاتصال بـ Supabase');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRows(cfg: SyncConfig): Promise<StoreRow[]> {
  const tenantId = cfg.tenantId || getTenantId();
  const url = `${cfg.url.replace(/\/$/, '')}/rest/v1/mobpos_stores?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*`;
  const res = await fetchWithTimeout(url, { headers: authHeaders(cfg) });
  if (!res.ok) throw new Error(`قراءة المزامنة فشلت (${res.status})`);
  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) throw new Error('استجابة المزامنة غير صالحة');
  return rows as StoreRow[];
}

/** رفع كل بيانات هذا الجهاز إلى السحابة معزولة بـ tenant_id. */
export async function pushAll(): Promise<number> {
  const cfg = getSyncConfig();
  validateConfig(cfg);

  // نخلّص أي كتابة معلّقة الأول عشان مابرّعش نسخة قديمة من المخزن
  await indexedDBUtils.flushPendingWrites();

  const tenantId = cfg.tenantId || getTenantId();
  let count = 0;
  for (const store of SYNCABLE_STORES()) {
    const data = await indexedDBUtils.getAll(store);
    const body = JSON.stringify({
      tenant_id: tenantId,
      store,
      data,
      updated_at: new Date().toISOString(),
    });
    if (new TextEncoder().encode(body).byteLength > MAX_SYNC_PAYLOAD_BYTES) {
      throw new Error(`بيانات مخزن ${store} أكبر من الحد المسموح (50 ميجابايت)`);
    }

    const res = await fetchWithTimeout(`${cfg.url.replace(/\/$/, '')}/rest/v1/mobpos_stores`, {
      method: 'POST',
      headers: { ...authHeaders(cfg, true), Prefer: 'resolution=merge-duplicates' },
      body,
    });
    if (!res.ok) throw new Error(`رفع "${store}" فشل (${res.status})`);
    count++;
  }
  return count;
}

/** تنزيل بيانات السحابة لهذا المتجر واستبدال البيانات المحلية بها. */
export async function pullAll(): Promise<number> {
  const cfg = getSyncConfig();
  validateConfig(cfg);

  const tenantId = cfg.tenantId || getTenantId();
  const rows = await fetchRows(cfg);
  const stores: Record<string, { id: string }[]> = {};
  const allowedStores = new Set(SYNCABLE_STORES());

  for (const row of rows) {
    // Defense in depth: never apply a row returned for another tenant, even if
    // a future server policy/query regression returns extra rows.
    if (row.tenant_id !== tenantId || !allowedStores.has(row.store) || !Array.isArray(row.data)) continue;
    const records = row.data as Array<{ id?: unknown }>;
    if (records.length > 100_000 || new TextEncoder().encode(JSON.stringify(records)).byteLength > MAX_SYNC_PAYLOAD_BYTES) {
      throw new Error(`بيانات مخزن ${row.store} أكبر من الحد المسموح`);
    }
    const ids = new Set<string>();
    if (records.some(record => {
      const id = record && record.id;
      if (typeof id !== 'string' || id.length === 0 || id.length > 256 || ids.has(id)) return true;
      ids.add(id);
      return false;
    })) {
      throw new Error(`بيانات مخزن ${row.store} غير صالحة`);
    }
    stores[row.store] = records as { id: string }[];
  }

  // نفس سبب الاستعادة من ملف: الكتابة المعلّقة لازم تخلص قبل ما نستبدل المخازن،
  // وبعدها cشان مافيش تعديل قديم ينزل فوق البيانات الجديدة.
  await indexedDBUtils.flushPendingWrites();
  await indexedDBUtils.replaceStoresData(stores);
  await indexedDBUtils.flushPendingWrites();
  return Object.keys(stores).length;
}
