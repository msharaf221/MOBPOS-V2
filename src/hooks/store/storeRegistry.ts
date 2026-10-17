/**
 * Registry of live IndexedDB-backed stores.
 * Enables multi-store atomic persistence without double-writing through
 * each useIndexedDB hook's individual schedulePersist.
 */
import type { Identifiable } from './applyDeltas';

export type StoreSnapshot = Identifiable[];

export interface RegisteredStore {
  /** Current in-memory snapshot (must stay in sync with React state). */
  getSnapshot: () => StoreSnapshot;
  /**
   * Apply a new snapshot to React state AND mark the disk snapshot as
   * already persisted (so useIndexedDB will not schedule a second write).
   */
  applyPersisted: (next: StoreSnapshot) => void;
  /** Apply a new snapshot and let the normal persist path run (non-atomic). */
  applyAndPersist: (next: StoreSnapshot) => void;
}

const registry = new Map<string, RegisteredStore>();

export function registerStore(name: string, api: RegisteredStore): () => void {
  registry.set(name, api);
  return () => {
    if (registry.get(name) === api) registry.delete(name);
  };
}

export function getRegisteredStore(name: string): RegisteredStore | undefined {
  return registry.get(name);
}

export function getAllRegisteredStoreNames(): string[] {
  return Array.from(registry.keys());
}
