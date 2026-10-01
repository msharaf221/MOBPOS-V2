import { useCallback } from 'react';
import { StoreState } from './types';
import { pushDelta } from '../../utils/lanSync';
import { StoreUpdates } from '../../services/types';

export function useStoreDispatcher(state: StoreState) {
  const dispatch = useCallback(async (updates: StoreUpdates) => {
    // 1. Apply locally
    for (const delta of updates.deltas) {
      const { type, storeName, items } = delta;
      type Identifiable = { id: string; [key: string]: unknown };
      const setterName = `set${storeName.charAt(0).toUpperCase() + storeName.slice(1)}`;
      const typedSetter = (state as unknown as Record<string, (val: unknown) => void>)[setterName];
      if (!typedSetter) {
        console.warn(`Setter ${setterName} not found`);
        continue;
      }

      if (type === 'replace') {
        typedSetter(items);
      } else if (type === 'delete') {
        const deleteIds = new Set((items as Identifiable[]).map(it => it.id));
        typedSetter((prev: Identifiable[]) => prev.filter(it => !deleteIds.has(it.id)));
      } else if (type === 'increment') {
        typedSetter((prev: Identifiable[]) => {
          const map = new Map(prev.map(it => [it.id, it]));
          for (const it of items as Identifiable[]) {
            const existing = map.get(it.id);
            if (existing) {
              const updated = { ...existing };
              for (const [key, val] of Object.entries(it)) {
                if (key !== 'id' && typeof val === 'number') {
                  const currentVal = typeof updated[key] === 'number' ? (updated[key] as number) : 0;
                  const newVal = currentVal + val;
                  if (storeName === 'inventory' && key === 'quantity') {
                    updated[key] = Math.max(0, newVal);
                  } else {
                    updated[key] = newVal;
                  }
                }
              }
              map.set(it.id, updated);
            }
          }
          return Array.from(map.values());
        });
      } else {
        // upsert
        typedSetter((prev: Identifiable[]) => {
          const map = new Map(prev.map(it => [it.id, it]));
          for (const it of items as Identifiable[]) {
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
