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

// Open database connection
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create all object stores
      Object.values(STORES).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      });

      // Create settings store with different key
      if (!db.objectStoreNames.contains('appSettings')) {
        db.createObjectStore('appSettings');
      }
    };
  });
}

// Generic get all from store
async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Generic put (add or update)
async function put<T extends { id: string }>(storeName: string, item: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Generic put many
async function putMany<T extends { id: string }>(storeName: string, items: T[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    items.forEach((item) => store.put(item));

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

// Generic delete
async function remove(storeName: string, id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Clear entire store
async function clearStore(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Get setting
async function getSetting<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('appSettings', 'readonly');
    const store = transaction.objectStore('appSettings');
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? null);
  });
}

// Set setting
async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('appSettings', 'readwrite');
    const store = transaction.objectStore('appSettings');
    const request = store.put(value, key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Clear all data (preserve appSettings so user stays logged in)
async function clearAllData(): Promise<void> {
  const db = await openDB();
  const storeNames = Array.from(db.objectStoreNames).filter(
    (name) => name !== 'appSettings' // keep dark mode & current user
  );
  
  for (const storeName of storeNames) {
    await clearStore(storeName);
  }
}

// Get database size estimate
async function getDBSize(): Promise<{ usage: number; quota: number }> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
  return { usage: 0, quota: 0 };
}

// Hook for using IndexedDB store
export function useIndexedDB<T extends { id: string }>(
  storeName: string,
  initialData: T[]
): [T[], (data: T[] | ((prev: T[]) => T[])) => void, boolean] {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const dataRef = useRef<T[]>([]);
  const writeQueueRef = useRef(Promise.resolve());

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const storedData = await getAll<T>(storeName);
        if (storedData.length > 0) {
          dataRef.current = storedData;
          setData(storedData);
        } else {
          // Initialize with default data
          await putMany(storeName, initialData);
          dataRef.current = initialData;
          setData(initialData);
        }
      } catch (error) {
        console.error(`Error loading ${storeName}:`, error);
        dataRef.current = initialData;
        setData(initialData);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [storeName]);

  // Update data
  const updateData = useCallback(
    async (newDataOrFn: T[] | ((prev: T[]) => T[])) => {
      const newData = typeof newDataOrFn === 'function' ? newDataOrFn(dataRef.current) : newDataOrFn;
      dataRef.current = newData;
      setData(newData);

      writeQueueRef.current = writeQueueRef.current.then(async () => {
        try {
          await replaceStoreData(storeName, newData);
        } catch (error) {
          console.error(`Error saving ${storeName}:`, error);
        }
      });

      return writeQueueRef.current;
    },
    [storeName]
  );

  return [data, updateData, isLoading];
}

// Hook for single setting
export function useIndexedDBSetting<T>(
  key: string,
  initialValue: T
): [T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);
  const valueRef = useRef(initialValue);
  const writeQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    const loadSetting = async () => {
      try {
        const stored = await getSetting<T>(key);
        if (stored !== null) {
          valueRef.current = stored;
          setValue(stored);
        }
      } catch (error) {
        console.error(`Error loading setting ${key}:`, error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSetting();
  }, [key]);

  const updateValue = useCallback(
    async (newValue: T) => {
      valueRef.current = newValue;
      setValue(newValue);
      writeQueueRef.current = writeQueueRef.current.then(async () => {
        try {
          await setSetting(key, newValue);
        } catch (error) {
          console.error(`Error saving setting ${key}:`, error);
        }
      });

      return writeQueueRef.current;
    },
    [key]
  );

  return [value, updateValue, isLoading];
}

// Replace ALL records in a store with new ones — clear + put in ONE atomic transaction
async function replaceStoreData(storeName: string, items: { id: string }[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    // Clear everything first
    store.clear();
    // Add all new items in the same transaction (atomic = all or nothing)
    items.forEach((item) => store.put(item));
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

// Atomically reset multiple stores to a known dataset
async function resetAllStores(dataMap: Record<string, { id: string }[]>): Promise<void> {
  for (const storeName of Object.values(STORES)) {
    if (storeName === 'settings') continue; // skip unused store
    const items = dataMap[storeName] || [];
    await replaceStoreData(storeName, items);
  }
}

// Export ALL data from every store (for backup)
async function exportAllData(): Promise<Record<string, unknown[]>> {
  const data: Record<string, unknown[]> = {};
  for (const storeName of Object.values(STORES)) {
    try {
      data[storeName] = await getAll(storeName);
    } catch {
      data[storeName] = [];
    }
  }
  return data;
}

// Import ALL data into stores (for restore)
async function importAllData(data: Record<string, unknown[]>): Promise<void> {
  for (const storeName of Object.values(STORES)) {
    if (data[storeName] && Array.isArray(data[storeName])) {
      try {
        await clearStore(storeName);
        await putMany(storeName, data[storeName] as { id: string }[]);
      } catch {
        // ignore individual store errors
      }
    }
  }
}

// Export utilities
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
  resetAllStores,
  STORES,
};
