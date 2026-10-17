import { useCallback, useRef } from 'react';
import { StoreState } from './types';
import { pushDelta } from '../../utils/lanSync';
import { StoreUpdates } from '../../services/types';
import { applyStoreDelta, type Identifiable } from './applyDeltas';
import { getRegisteredStore } from './storeRegistry';
import { persistMultiStoreDeltas, type MultiStoreDelta } from '../useIndexedDB';

function setterNameFor(storeName: string): string {
  return `set${storeName.charAt(0).toUpperCase()}${storeName.slice(1)}`;
}

/**
 * Applies StoreUpdates from domain services.
 *
 * Prefer path (atomic):
 *   1. Compute next snapshot for every affected store
 *   2. persistMultiStoreDeltas — one IndexedDB transaction
 *   3. applyPersisted on each registered store (React state only, no second write)
 *   4. pushDelta to LAN hub
 *
 * Fallback: if atomic write fails or a store is not registered, use the
 * React setter / applyAndPersist path.
 *
 * Performance: `dispatch` is referentially stable (state via ref) so slices
 * that depend on it do not re-create callbacks on every store write.
 */
export function useStoreDispatcher(state: StoreState) {
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback(async (updates: StoreUpdates) => {
    if (!updates?.deltas?.length) return;
    const liveState = stateRef.current;

    const byStore = new Map<string, typeof updates.deltas>();
    for (const delta of updates.deltas) {
      const name = delta.storeName as string;
      const list = byStore.get(name) ?? [];
      list.push(delta);
      byStore.set(name, list);
    }

    const multiDeltas: MultiStoreDelta[] = [];
    const nextByStore = new Map<string, Identifiable[]>();

    for (const [storeName, deltas] of byStore) {
      const registered = getRegisteredStore(storeName);
      let previous: Identifiable[];

      if (registered) {
        previous = registered.getSnapshot();
      } else {
        const fromState = (liveState as unknown as Record<string, unknown>)[storeName];
        previous = Array.isArray(fromState) ? (fromState as Identifiable[]) : [];
      }

      let next = previous;
      for (const d of deltas) {
        next = applyStoreDelta(next, d.type, d.items, storeName);
      }

      multiDeltas.push({ storeName, previous, next });
      nextByStore.set(storeName, next);
    }

    let atomicOk = false;
    if (multiDeltas.length > 0) {
      try {
        await persistMultiStoreDeltas(multiDeltas);
        atomicOk = true;
      } catch (err) {
        console.error('[dispatcher] persistMultiStoreDeltas failed, falling back:', err);
      }
    }

    for (const [storeName, next] of nextByStore) {
      const registered = getRegisteredStore(storeName);

      if (registered && atomicOk) {
        registered.applyPersisted(next);
      } else if (registered) {
        registered.applyAndPersist(next);
      } else {
        const setterKey = setterNameFor(storeName);
        const typedSetter = (liveState as unknown as Record<string, (val: unknown) => void>)[setterKey];
        if (typedSetter) typedSetter(next);
        else console.warn(`[dispatcher] Setter ${setterKey} not found for store "${storeName}"`);
      }
    }

    for (const d of updates.deltas) {
      pushDelta(d.storeName as string, d.items, d.type).catch(err =>
        console.warn('[dispatcher] LAN pushDelta failed:', err)
      );
    }
  }, []);

  return dispatch;
}
