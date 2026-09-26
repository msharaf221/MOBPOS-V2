import { useCallback } from 'react';
import { StoreState } from './types';
import { pushDelta } from '../../utils/lanSync';
import { DeltaAction, StoreUpdates } from '../../services/types';

export function useStoreDispatcher(state: StoreState) {
  const dispatch = useCallback(async (updates: StoreUpdates) => {
    // 1. Apply locally
    for (const delta of updates.deltas) {
      const { type, storeName, items } = delta;
      const setterName = `set${storeName.charAt(0).toUpperCase() + storeName.slice(1)}`;
      const setter = (state as any)[setterName];
      if (!setter) {
        console.warn(`Setter ${setterName} not found`);
        continue;
      }

      if (type === 'replace') {
        setter(items);
      } else if (type === 'delete') {
        const deleteIds = new Set(items.map((it: any) => it.id));
        setter((prev: any[]) => prev.filter((it: any) => !deleteIds.has(it.id)));
      } else if (type === 'increment') {
        setter((prev: any[]) => {
          const map = new Map(prev.map((it: any) => [it.id, it]));
          for (const it of items) {
            const existing = map.get(it.id);
            if (existing) {
              const updated = { ...existing };
              for (const [key, val] of Object.entries(it)) {
                if (key !== 'id' && typeof val === 'number') {
                  updated[key] = (updated[key] || 0) + val;
                }
              }
              map.set(it.id, updated);
            }
          }
          return Array.from(map.values());
        });
      } else {
        // upsert
        setter((prev: any[]) => {
          const map = new Map(prev.map((it: any) => [it.id, it]));
          for (const it of items) {
            const existing = map.get(it.id);
            if (existing) {
              map.set(it.id, { ...existing, ...it });
            } else {
              map.set(it.id, it);
            }
          }
          return Array.from(map.values());
        });
      }

      // 2. Push to LAN Hub (fire and forget)
      // This will broadcast to everyone (including ourselves, but React state will just overwrite with same data)
      pushDelta(storeName as string, items, type).catch(err => console.warn('Sync failed:', err));
    }
  }, [state]);

  return dispatch;
}
