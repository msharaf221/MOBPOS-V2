/**
 * Pure helpers for applying store deltas to in-memory arrays.
 * Shared by useStoreDispatcher, LAN sync bridge, and SyncEngine so the
 * same rules (upsert / delete / replace / increment) never drift apart.
 */

export type Identifiable = { id: string; [key: string]: unknown };

export type DeltaType = 'replace' | 'upsert' | 'delete' | 'increment';

export interface StoreDelta {
  type: DeltaType;
  storeName: string;
  items: unknown[];
}

/**
 * Apply a single delta to an array of identifiable records.
 * Returns a new array (never mutates `prev`).
 */
export function applyStoreDelta<T extends Identifiable>(
  prev: T[],
  type: DeltaType,
  items: unknown[],
  storeName?: string
): T[] {
  if (type === 'replace') {
    return items as T[];
  }

  if (type === 'delete') {
    const deleteIds = new Set((items as Identifiable[]).map(it => it.id));
    return prev.filter(it => !deleteIds.has(it.id));
  }

  if (type === 'increment') {
    const map = new Map(prev.map(it => [it.id, it]));
    for (const it of items as Identifiable[]) {
      const existing = map.get(it.id);
      if (!existing) continue;

      const updated: Identifiable = { ...existing };
      for (const [key, val] of Object.entries(it)) {
        if (key === 'id' || typeof val !== 'number') continue;
        const currentVal = typeof updated[key] === 'number' ? (updated[key] as number) : 0;
        const newVal = currentVal + val;
        // Inventory quantity must never go negative
        if (storeName === 'inventory' && key === 'quantity') {
          updated[key] = Math.max(0, newVal);
        } else {
          updated[key] = newVal;
        }
      }
      map.set(it.id, updated as T);
    }
    return Array.from(map.values()) as T[];
  }

  // upsert (deep merge by id)
  const map = new Map(prev.map(it => [it.id, it]));
  for (const it of items as Identifiable[]) {
    const existing = map.get(it.id);
    if (existing) {
      map.set(it.id, { ...existing, ...it } as T);
    } else {
      map.set(it.id, it as T);
    }
  }
  return Array.from(map.values()) as T[];
}

/**
 * Apply a list of deltas in order to a map of store-name → current array.
 * Returns a new map with only the stores that changed.
 */
export function applyAllDeltas(
  stores: Record<string, Identifiable[]>,
  deltas: StoreDelta[]
): Record<string, Identifiable[]> {
  const result: Record<string, Identifiable[]> = {};
  const working: Record<string, Identifiable[]> = { ...stores };

  for (const delta of deltas) {
    const prev = working[delta.storeName] ?? [];
    const next = applyStoreDelta(prev, delta.type, delta.items, delta.storeName);
    working[delta.storeName] = next;
    result[delta.storeName] = next;
  }

  return result;
}
