import { useState, useEffect, useCallback, useRef } from 'react';

const DB_NAME = 'MobileShopDB';
const DB_VERSION = 4;

// Store names
const STORES = {
  users: 'users',
  customers: 'customers',
  categories: 'categories',
  inventory: 'inventory',
  imeiUnits: 'imeiUnits',
  sales: 'sales',
  saleReturns: 'saleReturns',
  maintenance: 'maintenance',
  safes: 'safes',
  transactions: 'transactions',
  suppliers: 'suppliers',
  stockWastes: 'stockWastes',
  inventoryAudits: 'inventoryAudits',
  sideAccountEntries: 'sideAccountEntries',
  notifications: 'notifications',
  settings: 'settings',
  backups: 'backups', // local backup snapshots (excluded from backup payloads)
};

let dbPromise: Promise<IDBDatabase> | null = null;

// Keep one connection for the lifetime of the renderer. Opening a fresh
// IndexedDB connection for every read/write leaks handles in long-running
// cashier sessions and can leave old connections blocking schema upgrades.
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('تعذر فتح قاعدة البيانات'));
    };
    request.onblocked = () => {
      // A stale renderer can block an upgrade. The caller still receives the
      // normal request error/timeout from IndexedDB, but this is useful in logs.
      console.warn('IndexedDB upgrade is blocked by another open connection');
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      Object.values(STORES).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      });

      // Settings use arbitrary string keys rather than an `id` field.
      if (!db.objectStoreNames.contains('appSettings')) {
        db.createObjectStore('appSettings');
      }
    };
  });

  return dbPromise;
}

type StoreRecord = { id: string };

function runTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => T
): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(storeNames, mode);
    } catch (error) {
      reject(error);
      return;
    }

    let result: T;
    try {
      result = operation(transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }

    transaction.onerror = () => reject(transaction.error || new Error('فشلت معاملة قاعدة البيانات'));
    transaction.onabort = () => reject(transaction.error || new Error('تم إلغاء معاملة قاعدة البيانات'));
    transaction.oncomplete = () => resolve(result);
  }));
}

async function getAll<T>(storeName: string): Promise<T[]> {
  return runTransaction(storeName, 'readonly', transaction => {
    const request = transaction.objectStore(storeName).getAll();
    return new Promise<T[]>((resolve, reject) => {
      request.onerror = () => reject(request.error || new Error('تعذر قراءة البيانات'));
      request.onsuccess = () => resolve(request.result as T[]);
    });
  });
}

async function put<T extends StoreRecord>(storeName: string, item: T): Promise<void> {
  await runTransaction(storeName, 'readwrite', transaction => {
    transaction.objectStore(storeName).put(item);
  });
}

async function putMany<T extends StoreRecord>(storeName: string, items: T[]): Promise<void> {
  await runTransaction(storeName, 'readwrite', transaction => {
    const store = transaction.objectStore(storeName);
    items.forEach(item => store.put(item));
  });
}

async function remove(storeName: string, id: string): Promise<void> {
  await runTransaction(storeName, 'readwrite', transaction => {
    transaction.objectStore(storeName).delete(id);
  });
}

async function clearStore(storeName: string): Promise<void> {
  await runTransaction(storeName, 'readwrite', transaction => {
    transaction.objectStore(storeName).clear();
  });
}

async function getSetting<T>(key: string): Promise<T | null> {
  return runTransaction('appSettings', 'readonly', transaction => {
    const request = transaction.objectStore('appSettings').get(key);
    return new Promise<T | null>((resolve, reject) => {
      request.onerror = () => reject(request.error || new Error('تعذر قراءة الإعداد'));
      request.onsuccess = () => resolve((request.result ?? null) as T | null);
    });
  });
}

async function setSetting<T>(key: string, value: T): Promise<void> {
  await runTransaction('appSettings', 'readwrite', transaction => {
    transaction.objectStore('appSettings').put(value, key);
  });
}

/** Clear data stores while preserving appSettings (theme, branding, etc.). */
async function clearAllData(): Promise<void> {
  const db = await openDB();
  const storeNames = Array.from(db.objectStoreNames).filter(name => name !== 'appSettings');
  if (storeNames.length === 0) return;
  await runTransaction(storeNames, 'readwrite', transaction => {
    storeNames.forEach(storeName => transaction.objectStore(storeName).clear());
  });
}

async function getDBSize(): Promise<{ usage: number; quota: number }> {
  if (typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
  return { usage: 0, quota: 0 };
}

/**
 * Replace one store atomically. The write queue in the hook serializes
 * updates for that store, so a failed write cannot leave a half-cleared list.
 */
async function replaceStoreData(storeName: string, items: StoreRecord[]): Promise<void> {
  await runTransaction(storeName, 'readwrite', transaction => {
    const store = transaction.objectStore(storeName);
    store.clear();
    items.forEach(item => store.put(item));
  });
}

/** Replace several stores in one IndexedDB transaction. */
async function replaceStoresData(dataMap: Record<string, StoreRecord[]>): Promise<void> {
  const db = await openDB();
  const storeNames = Object.keys(dataMap).filter(name =>
    name !== 'appSettings' && db.objectStoreNames.contains(name)
  );
  if (storeNames.length === 0) return;

  await runTransaction(storeNames, 'readwrite', transaction => {
    storeNames.forEach(storeName => {
      const store = transaction.objectStore(storeName);
      store.clear();
      dataMap[storeName].forEach(item => store.put(item));
    });
  });
}

// Atomically reset all application data. The unused `settings` object store is
// intentionally excluded; the `appSettings` key/value store is never touched.
async function resetAllStores(dataMap: Record<string, StoreRecord[]>): Promise<void> {
  const storeNames = Object.values(STORES).filter(name => name !== STORES.settings);
  await runTransaction(storeNames, 'readwrite', transaction => {
    storeNames.forEach(storeName => {
      const store = transaction.objectStore(storeName);
      store.clear();
      (dataMap[storeName] || []).forEach(item => store.put(item));
    });
  });
}

/**
 * يصدّر كل المخازن. `excludeStores` ضروري هنا: مخزن `backups` نفسه فيه
 * نسخة كاملة من الداتا كلها (لعدد 7 لقطة)، وقراءته ثم حذفه من الـ payload
 * يعني كل نسخة احتياطية تقرأ الداتا ~8 مرات من غير أي فايدة.
 */
async function exportAllData(excludeStores: readonly string[] = []): Promise<Record<string, unknown[]>> {
  const skipped = new Set(excludeStores);
  const data: Record<string, unknown[]> = {};
  for (const storeName of Object.values(STORES)) {
    if (skipped.has(storeName)) continue;
    try {
      data[storeName] = await getAll(storeName);
    } catch {
      data[storeName] = [];
    }
  }
  return data;
}

/** Import supplied stores atomically; callers validate records before calling. */
async function importAllData(data: Record<string, unknown[]>): Promise<void> {
  const records: Record<string, StoreRecord[]> = {};
  const allowed = new Set(Object.values(STORES).filter(name => name !== STORES.backups && name !== STORES.settings));

  for (const [storeName, items] of Object.entries(data)) {
    if (!allowed.has(storeName)) continue;
    if (!Array.isArray(items)) throw new Error(`بيانات مخزن ${storeName} غير صالحة`);
    records[storeName] = items as StoreRecord[];
  }

  await replaceStoresData(records);
}

// ============================================================
//  طبقة الحفظ: كتابة الفروقات (delta) بدل إعادة كتابة المخزن
// ------------------------------------------------------------
//  الطريقة القديمة كانت في كل تعديل — حتى إضافة منتج واحد —
//  تعمل clear() على المخزن ثم put() لكل السجلات. يعني إضافة
//  256 منتج واحد ورا التاني = 32,896 عملية كتابة و256 معاملة
//  (كل معاملة = flush على الديسك)، وحجم الكتابة كله ~7 ميجابايت
//  لداتا حجمها الحقيقي 54 كيلوبايت. ده كان سبب التجمّد حول
//  عدد معين من المنتجات وسبب تضخّم ملف الداتا.
//
//  دلوقتي بنقارن الحالة الجديدة باللي مكتوب فعلًا على الديسك
//  ونبعت الفرق بس: put للمتغيّرين/الجُدد وdelete للممسوحين.
//  السجلات اللي مرجعها نفسه (لم يتغيّر) ما بتترسمش من جديد.
//  ولو أغلب المخزن اتغيّر (مثل الاستيراد أو الجرد) نرجع
//  لكتابة المخزن كاملة لأنها أرخص في الحالة دي.
//
//  كمان الكتابات المتتابعة السريعة بتتدمج في معاملة واحدة
//  (coalescing) عشان الضغط المتكرر على زرار "إضافة" مايبنيش
//  طابور انتظار. ولأن آخر حالة هي اللي بتكتب، مفيش فقدان بيانات.
// ============================================================

/** نافذة دمج الكتابات المتتابعة. صغيرة كفاية إنها ماتحسّش، وكبيرة كفاية إنها تلم الضغطات المتلاحقة. */
const WRITE_COALESCE_MS = 40;

type PendingWriteJob = () => Promise<void> | null;

/** كل مثيلات الـ hooks بتسجّل هنا عشان نعرف نستنى كتاباتهم لحد الآخر. */
const pendingWriteJobs = new Set<PendingWriteJob>();

/**
 * يستنى لحد ما كل الكتابات المعلّقة تخلص. مهم قبل قراءة الداتا
 * مباشرة من IndexedDB (نسخة احتياطية/مزامنة/تصدير) عشان مايقراش
 * نسخة قديمة بينما في تعديل في الطريق للديسك.
 */
export async function flushPendingWrites(): Promise<void> {
  for (let pass = 0; pass < 10; pass++) {
    const jobs = Array.from(pendingWriteJobs)
      .map(job => job())
      .filter((job): job is Promise<void> => job !== null);
    if (jobs.length === 0) return;
    await Promise.all(jobs);
  }
}

// أفضل محاولة للفلش قبل ما تقفل الصفحة (HMR/ريفرش/إغلاق التطبيق).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', () => {
    void flushPendingWrites();
  });
}

/** يحسب الفروقات بين لقطتين لنفس المخزن. */
export function diffStore<T extends StoreRecord>(previous: T[], next: T[]): { addedOrChanged: T[]; removedIds: string[] } {
  const previousById = new Map<string, T>(previous.map(item => [item.id, item]));
  const nextById = new Map<string, T>(next.map(item => [item.id, item]));

  const addedOrChanged = next.filter(item => previousById.get(item.id) !== item);
  const removedIds = previous.filter(item => !nextById.has(item.id)).map(item => item.id);

  return { addedOrChanged, removedIds };
}

/** يسجّل دالة الانتظار الخاصة بمثيل hook واحد. */
function usePendingWriteRegistry(getJob: () => Promise<void> | null): void {
  useEffect(() => {
    pendingWriteJobs.add(getJob);
    return () => {
      pendingWriteJobs.delete(getJob);
    };
  }, [getJob]);
}

// Hook for using an IndexedDB store
export function useIndexedDB<T extends StoreRecord>(
  storeName: string,
  initialData: T[]
): [T[], (data: T[] | ((prev: T[]) => T[])) => void, boolean] {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const dataRef = useRef<T[]>([]);
  const loadedRef = useRef(false);
  const pendingUpdatesRef = useRef<Array<T[] | ((prev: T[]) => T[])>>([]);
  /** آخر حالة مكتوبة فعلًا على الديسك — أساس مقارنة الفروقات. */
  const persistedRef = useRef<{ snapshot: T[]; known: boolean }>({ snapshot: [], known: false });
  const queuedWriteRef = useRef<T[] | null>(null);
  const drainPromiseRef = useRef<Promise<void> | null>(null);

  const getDrainJob = useCallback(() => drainPromiseRef.current, []);
  usePendingWriteRegistry(getDrainJob);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const storedData = await getAll<T>(storeName);
        if (cancelled) return;

        const baseData = storedData.length > 0 ? storedData : initialData;
        const pending = pendingUpdatesRef.current;
        const hadPendingUpdates = pending.length > 0;
        const resolvedData = pending.reduce<T[]>((current, update) =>
          typeof update === 'function' ? update(current) : update,
          baseData
        );
        pendingUpdatesRef.current = [];

        if (storedData.length === 0 || hadPendingUpdates) {
          await replaceStoreData(storeName, resolvedData);
        }
        dataRef.current = resolvedData;
        // اللي على الديسك دلوقتي = resolvedData، فنقدر نبني عليه الفروقات
        persistedRef.current = { snapshot: resolvedData, known: true };
        loadedRef.current = true;
        setData(resolvedData);
      } catch (error) {
        console.error(`Error loading ${storeName}:`, error);
        if (!cancelled) {
          const resolvedData = pendingUpdatesRef.current.reduce<T[]>(
            (current, update) => typeof update === 'function' ? update(current) : update,
            initialData
          );
          pendingUpdatesRef.current = [];
          dataRef.current = resolvedData;
          // فشل القراءة = ماعرفناش حالة الديسك، فلازم الكتابة الجاية كاملة
          persistedRef.current = { snapshot: resolvedData, known: false };
          loadedRef.current = true;
          setData(resolvedData);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [storeName, initialData]);

  /** يكتب لقطة المخزن على الديسك — فروقات لو ممكن، وإلا إعادة كتابة كاملة. */
  const persistSnapshot = useCallback(async (next: T[]) => {
    const { snapshot, known } = persistedRef.current;

    if (!known) {
      await replaceStoreData(storeName, next);
      persistedRef.current = { snapshot: next, known: true };
      return;
    }

    const { addedOrChanged, removedIds } = diffStore(snapshot, next);
    if (addedOrChanged.length === 0 && removedIds.length === 0) {
      persistedRef.current = { snapshot: next, known: true };
      return;
    }

    // إعادة الكتابة الكاملة بتبقى أرخص لما التغيير يلمس كل السجلات تقريبًا
    const fullRewriteCost = next.length + 1;
    const deltaCost = addedOrChanged.length + removedIds.length;

    if (deltaCost >= fullRewriteCost) {
      await replaceStoreData(storeName, next);
    } else {
      await runTransaction(storeName, 'readwrite', transaction => {
        const store = transaction.objectStore(storeName);
        removedIds.forEach(id => store.delete(id));
        addedOrChanged.forEach(item => store.put(item));
      });
    }
    persistedRef.current = { snapshot: next, known: true };
  }, [storeName]);

  /**
   * يجدول الكتابة على الديسك ويدمج اللقطات المتتابعة في معاملة واحدة.
   * آخر لقطة هي اللي بتكتب، فالتجميع مابيضّعش أي تعديل.
   */
  const schedulePersist = useCallback((next: T[]) => {
    queuedWriteRef.current = next;
    if (drainPromiseRef.current) return drainPromiseRef.current;

    const drain = (async () => {
      if (WRITE_COALESCE_MS > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, WRITE_COALESCE_MS));
      }
      try {
        while (queuedWriteRef.current !== null) {
          const snapshotToWrite = queuedWriteRef.current;
          queuedWriteRef.current = null;
          try {
            await persistSnapshot(snapshotToWrite);
          } catch (error) {
            console.error(`Error saving ${storeName}:`, error);
            // فشل الكتابة = ماعرفناش حالة الديسك؛ المحاولة الجاية تكتب المخزن كامل
            persistedRef.current = { snapshot: snapshotToWrite, known: false };
          }
        }
      } finally {
        drainPromiseRef.current = null;
      }
    })();

    drainPromiseRef.current = drain;
    return drain;
  }, [persistSnapshot, storeName]);

  const updateData = useCallback(
    (newDataOrFn: T[] | ((prev: T[]) => T[])) => {
      const base = dataRef.current;
      const newData = typeof newDataOrFn === 'function' ? newDataOrFn(base) : newDataOrFn;
      dataRef.current = newData;
      setData(newData);

      if (!loadedRef.current) {
        // The initial read must win over an early UI update. The updater is
        // replayed against the loaded records in loadData(), then persisted.
        pendingUpdatesRef.current.push(newDataOrFn);
        return;
      }

      void schedulePersist(newData);
    },
    [schedulePersist]
  );

  return [data, updateData, isLoading];
}

// Hook for single setting
export function useIndexedDBSetting<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);
  const valueRef = useRef(initialValue);
  const loadedRef = useRef(false);
  const pendingUpdatesRef = useRef<Array<T | ((prev: T) => T)>>([]);
  /**
   * نفس فكرة مخازن القوائم: كتابات الإعدادات المتتابعة (مثل الكتابة في خانة
   * اسم المحل حرف بحرف) بتتدمج في عملية حفظ واحدة لآخر قيمة بدل transaction
   * لكل حرف.
   */
  const queuedSettingRef = useRef<T | null>(null);
  const drainPromiseRef = useRef<Promise<void> | null>(null);
  const getDrainJob = useCallback(() => drainPromiseRef.current, []);
  usePendingWriteRegistry(getDrainJob);

  useEffect(() => {
    let cancelled = false;
    const loadSetting = async () => {
      try {
        const stored = await getSetting<T>(key);
        if (cancelled) return;
        const pending = pendingUpdatesRef.current;
        const hadPendingUpdates = pending.length > 0;
        let resolved = stored !== null ? stored : valueRef.current;
        for (const update of pending) {
          resolved = typeof update === 'function' ? (update as (prev: T) => T)(resolved) : update;
        }
        pendingUpdatesRef.current = [];
        valueRef.current = resolved;
        loadedRef.current = true;
        setValue(resolved);
        if (stored === null || hadPendingUpdates) await setSetting(key, resolved);
      } catch (error) {
        console.error(`Error loading setting ${key}:`, error);
        if (!cancelled) {
          loadedRef.current = true;
          pendingUpdatesRef.current = [];
          setValue(valueRef.current);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadSetting();
    return () => { cancelled = true; };
  }, [key]);

  const updateValue = useCallback(
    (newValueOrFn: T | ((prev: T) => T)) => {
      const newValue = typeof newValueOrFn === 'function'
        ? (newValueOrFn as (prev: T) => T)(valueRef.current)
        : newValueOrFn;
      valueRef.current = newValue;
      setValue(newValue);
      if (!loadedRef.current) {
        pendingUpdatesRef.current.push(newValueOrFn);
        return;
      }

      queuedSettingRef.current = newValue;
      if (drainPromiseRef.current) return;

      const drain = (async () => {
        if (WRITE_COALESCE_MS > 0) {
          await new Promise<void>(resolve => setTimeout(resolve, WRITE_COALESCE_MS));
        }
        try {
          while (queuedSettingRef.current !== null) {
            const valueToWrite = queuedSettingRef.current;
            queuedSettingRef.current = null;
            try {
              await setSetting(key, valueToWrite);
            } catch (error) {
              console.error(`Error saving setting ${key}:`, error);
            }
          }
        } finally {
          drainPromiseRef.current = null;
        }
      })();

      drainPromiseRef.current = drain;
    },
    [key]
  );

  return [value, updateValue, isLoading];
}

export const indexedDBUtils = {
  openDB,
  getAll,
  put,
  putMany,
  remove,
  clearStore,
  clearAllData,
  getSetting,
  setSetting,
  getDBSize,
  exportAllData,
  importAllData,
  replaceStoreData,
  replaceStoresData,
  resetAllStores,
  flushPendingWrites,
  STORES,
};
