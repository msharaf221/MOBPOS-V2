// ============================================================
//  نظام النسخ الاحتياطي — Backup Engine
//  - نسخة احتياطية يومية تلقائية (محلية داخل IndexedDB)
//  - تصدير / استعادة ملفات JSON
//  - رفع تلقائي إلى Google Drive (انظر googleDrive.ts)
// ============================================================

import { indexedDBUtils } from '../hooks/useIndexedDB';
import { getAccessToken, uploadBackupToDrive, pruneDriveBackups } from './googleDrive';

// ===== Types =====

export interface BackupPayload {
  app: 'MOBPOS';
  formatVersion: 1;
  exportedAt: string;
  shopName?: string;
  data: Record<string, unknown[]>;
}

export interface LocalBackupSnapshot {
  id: string;
  name: string;          // file name e.g. MOBPOS-backup-2026-08-21.json
  createdAt: string;     // ISO
  size: number;          // bytes (JSON length)
  auto: boolean;         // created automatically?
  payload: BackupPayload;
}

export interface BackupSettings {
  autoEnabled: boolean;          // daily automatic backup on/off
  autoHour: number;              // hour of day (0-23) after which backup may run
  retentionLocal: number;        // number of local snapshots to keep
  lastBackupAt: string | null;
  lastBackupName: string | null;
  // Google Drive
  driveClientId: string;
  driveConnectedEmail: string | null;
  driveAutoUpload: boolean;      // auto-upload the daily backup to Drive
  lastDriveUploadAt: string | null;
  lastDriveFileName: string | null;
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  autoEnabled: true,
  autoHour: 12,
  retentionLocal: 7,
  lastBackupAt: null,
  lastBackupName: null,
  driveClientId: '',
  driveConnectedEmail: null,
  driveAutoUpload: true,
  lastDriveUploadAt: null,
  lastDriveFileName: null,
};

const SETTINGS_KEY = 'backup_settings';

// ===== Settings persistence =====

export async function getBackupSettings(): Promise<BackupSettings> {
  try {
    const stored = await indexedDBUtils.getSetting<Partial<BackupSettings>>(SETTINGS_KEY);
    return { ...DEFAULT_BACKUP_SETTINGS, ...(stored || {}) };
  } catch {
    return { ...DEFAULT_BACKUP_SETTINGS };
  }
}

export async function saveBackupSettings(patch: Partial<BackupSettings>): Promise<BackupSettings> {
  const current = await getBackupSettings();
  const next = { ...current, ...patch };
  await indexedDBUtils.setSetting(SETTINGS_KEY, next);
  return next;
}

// ===== Payload creation =====

function todayTag(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Export every store (except the backups store itself) into one payload. */
export async function createBackupPayload(): Promise<BackupPayload> {
  const data = await indexedDBUtils.exportAllData();
  // Never nest backups inside backups
  delete data[indexedDBUtils.STORES.backups];

  let shopName: string | undefined;
  try {
    const appSettings = await indexedDBUtils.getSetting<{ shopName?: string }>('shopSettings');
    shopName = appSettings?.shopName;
  } catch {
    // ignore
  }

  return {
    app: 'MOBPOS',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    ...(shopName ? { shopName } : {}),
    data,
  };
}

// ===== Local snapshots (IndexedDB) =====

export async function listLocalSnapshots(): Promise<Omit<LocalBackupSnapshot, 'payload'>[]> {
  try {
    const all = await indexedDBUtils.getAll<LocalBackupSnapshot>(indexedDBUtils.STORES.backups);
    return all
      .map(({ payload, ...meta }) => ({ ...meta, size: payload ? meta.size : 0 }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

async function saveLocalSnapshot(payload: BackupPayload, auto: boolean): Promise<LocalBackupSnapshot> {
  const settings = await getBackupSettings();
  const json = JSON.stringify(payload);
  const name = `MOBPOS-backup-${todayTag()}.json`;
  const snapshot: LocalBackupSnapshot = {
    id: `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    size: json.length,
    auto,
    payload,
  };

  await indexedDBUtils.put(indexedDBUtils.STORES.backups, snapshot);

  // Retention: keep newest N
  const all = await indexedDBUtils.getAll<LocalBackupSnapshot>(indexedDBUtils.STORES.backups);
  const sorted = [...all].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const keep = Math.max(1, settings.retentionLocal || 7);
  const toDelete = sorted.slice(keep);
  for (const old of toDelete) {
    await indexedDBUtils.remove(indexedDBUtils.STORES.backups, old.id);
  }

  return snapshot;
}

export async function deleteLocalSnapshot(id: string): Promise<void> {
  await indexedDBUtils.remove(indexedDBUtils.STORES.backups, id);
}

export async function downloadLocalSnapshot(id: string): Promise<void> {
  const all = await indexedDBUtils.getAll<LocalBackupSnapshot>(indexedDBUtils.STORES.backups);
  const snap = all.find(s => s.id === id);
  if (!snap) throw new Error('النسخة غير موجودة');
  downloadPayload(snap.payload, snap.name);
}

// ===== File download =====

export function downloadPayload(payload: BackupPayload, fileName?: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || `MOBPOS-backup-${todayTag()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ===== Restore =====

/**
 * Internal carrier key: when a legacy file contains app settings (a plain
 * object, not a list of records), extractStores puts them here so
 * restoreFromParsed can write them into the appSettings store.
 */
export const LEGACY_SETTINGS_KEY = '__legacyAppSettings__';

/**
 * Legacy key mapping: the first app version (v1.0.0) exported localStorage
 * keys prefixed with `shop_` whose values are JSON strings. Map the stripped
 * key names to today's IndexedDB store names.
 */
const LEGACY_KEY_ALIASES: Record<string, string> = {
  products: 'inventory',
  items: 'inventory',
  goods: 'inventory',
  stock: 'inventory',
  inventory: 'inventory',
  clients: 'customers',
  customers: 'customers',
  invoices: 'sales',
  orders: 'sales',
  sales: 'sales',
  returns: 'saleReturns',
  salereturns: 'saleReturns',
  repairs: 'maintenance',
  tickets: 'maintenance',
  maintenance: 'maintenance',
  wallets: 'safes',
  cashboxes: 'safes',
  safes: 'safes',
  cashflow: 'transactions',
  money: 'transactions',
  transactions: 'transactions',
  vendors: 'suppliers',
  suppliers: 'suppliers',
  wastes: 'stockWastes',
  damages: 'stockWastes',
  stockwastes: 'stockWastes',
  alerts: 'notifications',
  notifications: 'notifications',
  users: 'users',
  staff: 'users',
  employees: 'users',
  categories: 'categories',
  imei: 'imeiUnits',
  imeis: 'imeiUnits',
  devices: 'imeiUnits',
  imeiunits: 'imeiUnits',
  audits: 'inventoryAudits',
  inventoryaudits: 'inventoryAudits',
  accounts: 'sideAccountEntries',
  sideaccounts: 'sideAccountEntries',
  sideaccountentries: 'sideAccountEntries',
};

/**
 * Converts a legacy localStorage export ({ "shop_xxx": "<json>", ... })
 * into the current stores map. Returns null if the file is not in that
 * format or contains nothing restorable.
 */
function parseLegacyLocalStorageExport(obj: Record<string, unknown>): Record<string, unknown[]> | null {
  const shopKeys = Object.keys(obj).filter(k => k.startsWith('shop_'));
  if (shopKeys.length === 0) return null;

  const knownStores = Object.values(indexedDBUtils.STORES);
  const result: Record<string, unknown[]> = {};
  let restoredAnything = false;

  for (const key of shopKeys) {
    const raw = obj[key];
    if (typeof raw !== 'string') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // unparseable entry — skip it
    }

    const name = key.slice('shop_'.length).toLowerCase();

    if (Array.isArray(parsed)) {
      const storeName =
        LEGACY_KEY_ALIASES[name] ??
        (knownStores.includes(name) ? name : null);
      if (storeName && storeName !== indexedDBUtils.STORES.backups) {
        result[storeName] = parsed;
        restoredAnything = true;
      }
    } else if (parsed && typeof parsed === 'object') {
      // Legacy settings were stored as a plain object (e.g. shop_settings)
      if (name.includes('setting')) {
        result[LEGACY_SETTINGS_KEY] = [parsed];
        restoredAnything = true;
      }
    }
  }

  return restoredAnything ? result : null;
}

/** Accepts the current payload format, a raw stores map, or a legacy v1 export. */
export function extractStores(parsed: unknown): Record<string, unknown[]> | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  // New / standard format: { app, data: {...} }
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    return obj.data as Record<string, unknown[]>;
  }

  // Raw stores map (at least one known store present as an array)
  const known = Object.values(indexedDBUtils.STORES);
  const looksLikeStoresMap = known.some(
    key => key !== indexedDBUtils.STORES.backups && Array.isArray(obj[key])
  );
  if (looksLikeStoresMap) {
    return obj as unknown as Record<string, unknown[]>;
  }

  // Legacy v1.0.0 localStorage export: { "shop_xxx": "<json string>", ... }
  return parseLegacyLocalStorageExport(obj);
}

export async function restoreFromParsed(parsed: unknown): Promise<void> {
  const data = extractStores(parsed);
  if (!data) throw new Error('ملف غير صالح');

  // Apply legacy settings carried over from old-format files, then strip
  // the carrier key so it never reaches the object stores.
  const { [LEGACY_SETTINGS_KEY]: legacySettings, ...stores } = data;
  if (Array.isArray(legacySettings) && legacySettings[0] && typeof legacySettings[0] === 'object') {
    try {
      await indexedDBUtils.setSetting('shopSettings', legacySettings[0]);
    } catch {
      // settings are non-critical — continue restoring the data stores
    }
  }

  await indexedDBUtils.importAllData(stores);
}

// ===== Manual backup =====

export interface BackupRunResult {
  ok: boolean;
  snapshotName?: string;
  driveUploaded?: boolean;
  driveError?: string;
  error?: string;
}

/** Create a backup now (local snapshot + optional Drive upload). */
export async function runBackupNow(uploadToDrive: boolean): Promise<BackupRunResult> {
  try {
    const payload = await createBackupPayload();
    const snapshot = await saveLocalSnapshot(payload, false);

    let driveUploaded = false;
    let driveError: string | undefined;

    if (uploadToDrive) {
      try {
        const settings = await getBackupSettings();
        if (!settings.driveClientId) {
          driveError = 'لم يتم ضبط Google Drive بعد';
        } else {
          const token = await getAccessToken(settings.driveClientId, false);
          if (!token) {
            driveError = 'تعذر الحصول على إذن الوصول إلى Google Drive';
          } else {
            await uploadBackupToDrive(token, payload);
            await pruneDriveBackups(token, 15);
            driveUploaded = true;
            await saveBackupSettings({
              lastDriveUploadAt: new Date().toISOString(),
              lastDriveFileName: snapshot.name,
            });
          }
        }
      } catch (err) {
        driveError = err instanceof Error ? err.message : 'خطأ غير معروف أثناء الرفع';
      }
    }

    await saveBackupSettings({
      lastBackupAt: snapshot.createdAt,
      lastBackupName: snapshot.name,
    });

    return { ok: true, snapshotName: snapshot.name, driveUploaded, driveError };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'فشل إنشاء النسخة الاحتياطية' };
  }
}

// ===== Automatic daily backup =====

/**
 * Runs the daily backup if it's due:
 * - automatic backup is enabled
 * - no backup was created today yet
 * - current hour >= configured autoHour (or 24h+ passed since last backup)
 */
export async function maybeRunScheduledBackup(): Promise<BackupRunResult | null> {
  try {
    const settings = await getBackupSettings();
    if (!settings.autoEnabled) return null;

    const now = new Date();
    const last = settings.lastBackupAt ? new Date(settings.lastBackupAt) : null;

    const hasBackupToday =
      !!last && last.toDateString() === now.toDateString();
    if (hasBackupToday) return null;

    const passed24h = !last || now.getTime() - last.getTime() >= 24 * 60 * 60 * 1000;
    const hourReached = now.getHours() >= settings.autoHour;
    if (!hourReached && !passed24h) return null;

    // Due — create the local snapshot
    const payload = await createBackupPayload();
    const snapshot = await saveLocalSnapshot(payload, true);

    // Attempt a silent upload to Google Drive (no popups; skip quietly if unavailable)
    let driveUploaded = false;
    if (settings.driveAutoUpload && settings.driveClientId) {
      try {
        const token = await getAccessToken(settings.driveClientId, true);
        if (token) {
          await uploadBackupToDrive(token, payload);
          await pruneDriveBackups(token, 15);
          driveUploaded = true;
          await saveBackupSettings({
            lastDriveUploadAt: new Date().toISOString(),
            lastDriveFileName: snapshot.name,
          });
        }
      } catch {
        // silent — next attempt happens on the next run
      }
    }

    await saveBackupSettings({
      lastBackupAt: snapshot.createdAt,
      lastBackupName: snapshot.name,
    });

    return { ok: true, snapshotName: snapshot.name, driveUploaded };
  } catch (err) {
    console.error('Scheduled backup failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'فشل النسخ التلقائي' };
  }
}

// ===== Storage durability =====

/** Ask the browser to make our storage persistent (protect against eviction). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      return await navigator.storage.persist();
    }
  } catch {
    // ignore
  }
  return false;
}

// ===== Formatting helpers =====

export function formatBackupTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
