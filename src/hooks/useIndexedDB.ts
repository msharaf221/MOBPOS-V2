/**
 * TEMPORARY STUB — restore full implementation:
 *   curl -sL "https://raw.githubusercontent.com/msharaf221/MOBPOS-V2/5ac5c2b45fbf84aeefe4dec4cea4199f90bceea1/src/hooks/useIndexedDB.ts" \
 *     -o src/hooks/useIndexedDB.ts
 *
 * See docs/RESTORE_INDEXEDDB.md
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export type StoreDeltaListener = (
  storeName: string,
  delta: { addedOrChanged: { id: string }[]; removedIds: string[] },
  isRemote?: boolean
) => void;

const listeners = new Set<StoreDeltaListener>();
export function onStoreDelta(listener: StoreDeltaListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let remote = false;
export function setRemoteApplying(v: boolean) { remote = v; }
export function isApplyingRemote() { return remote; }

export function diffStore<T extends { id: string }>(previous: T[], next: T[]) {
  const prev = new Map(previous.map(i => [i.id, i]));
  const nextMap = new Map(next.map(i => [i.id, i]));
  return {
    addedOrChanged: next.filter(i => prev.get(i.id) !== i),
    removedIds: previous.filter(i => !nextMap.has(i.id)).map(i => i.id),
  };
}

export async function flushPendingWrites() {}
export async function persistMultiStoreDeltas(_deltas: unknown[]) {
  console.warn('[useIndexedDB stub] persistMultiStoreDeltas no-op — restore full implementation');
}
export async function runAtomicTransaction(_names: string[], _op: unknown) {
  console.warn('[useIndexedDB stub] runAtomicTransaction no-op');
}

export interface MultiStoreDelta {
  storeName: string;
  previous: { id: string }[];
  next: { id: string }[];
  known?: boolean;
}

export function useIndexedDB<T extends { id: string }>(
  storeName: string,
  initialData: T[]
): [T[], (data: T[] | ((prev: T[]) => T[])) => void, boolean] {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(true);
  const ref = useRef(initialData);
  useEffect(() => { ref.current = data; }, [data]);
  useEffect(() => { setLoading(false); }, []);
  const update = useCallback((v: T[] | ((prev: T[]) => T[])) => {
    setData(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      ref.current = next;
      return next;
    });
  }, []);
  return [data, update, loading];
}

export function useIndexedDBSetting<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, boolean] {
  const [value, setValue] = useState(initial);
  const [loading] = useState(false);
  const update = useCallback((v: T | ((p: T) => T)) => {
    setValue(prev => typeof v === 'function' ? (v as (p: T) => T)(prev) : v);
  }, []);
  return [value, update, loading];
}

export const indexedDBUtils = {
  openDB: async () => null as unknown as IDBDatabase,
  getAll: async () => [] as unknown[],
  put: async () => {},
  putMany: async () => {},
  remove: async () => {},
  clearStore: async () => {},
  clearAllData: async () => {},
  getSetting: async () => null,
  setSetting: async () => {},
  getDBSize: async () => ({ usage: 0, quota: 0 }),
  exportAllData: async () => ({} as Record<string, unknown[]>),
  importAllData: async () => {},
  replaceStoreData: async () => {},
  replaceStoresData: async () => {},
  resetAllStores: async () => {},
  flushPendingWrites,
  persistMultiStoreDeltas,
  runAtomicTransaction,
  runTransaction: async () => {},
  onStoreDelta,
  setRemoteApplying,
  isApplyingRemote,
  STORES: {} as Record<string, string>,
};
