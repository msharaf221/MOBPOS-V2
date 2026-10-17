import { useCallback } from 'react';
import { StoreState } from './types';
import { pushDelta } from '../../utils/lanSync';
import { StoreUpdates } from '../../services/types';
import { applyStoreDelta, type Identifiable } from './applyDeltas';

/**
 * Maps a store key (e.g. "imeiUnits") to its React setter on StoreState
 * (e.g. "setImeiUnits").
 */
function setterNameFor(storeName: string): string {
  return `set${storeName.charAt(0).toUpperCase()}${storeName.slice(1)}`;
}

export function useStoreDispatcher(state: StoreState) {
  const dispatch = useCallback(
    async (updates: StoreUpdates) => {
      if (!updates?.deltas?.length) return;

      // Apply every delta to React state (and therefore to IndexedDB via
      // useIndexedDB's schedulePersist). All local updates run first so the
      // UI stays consistent even if a later LAN push fails.
      //
      // NOTE: True multi-store atomicity (persistMultiStoreDeltas) is planned
      // in a follow-up: it requires a store registry so we can write all
      // previous/next snapshots in one IDB transaction without double-writing
      // through the per-store hooks. See docs/RESTRUCTURE-PLAN-2026-10.md §2.1.
      for (const delta of updates.deltas) {
        const { type, storeName, items } = delta;
        const setterKey = setterNameFor(storeName as string);
        const typedSetter = (state as unknown as Record<string, (val: unknown) => void>)[setterKey];

        if (!typedSetter) {
          console.warn(`[dispatcher] Setter ${setterKey} not found for store "${storeName}"`);
          continue;
        }

        if (type === 'replace') {
          typedSetter(items);
        } else {
          typedSetter((prev: Identifiable[]) =>
            applyStoreDelta(prev, type, items, storeName as string)
          );
        }

        // Broadcast to LAN Hub (fire-and-forget). Failures must not roll back
        // local state — the outbox / next reconnect will reconcile.
        pushDelta(storeName as string, items, type).catch(err =>
          console.warn('[dispatcher] LAN pushDelta failed:', err)
        );
      }
    },
    [state]
  );

  return dispatch;
}
