import { StoreState } from '../hooks/store/types';

export type DeltaAction = 
  | { type: 'replace'; storeName: keyof StoreState; items: unknown[] }
  | { type: 'upsert'; storeName: keyof StoreState; items: unknown[] }
  | { type: 'delete'; storeName: keyof StoreState; items: unknown[] }
  | { type: 'increment'; storeName: keyof StoreState; items: unknown[] };

export interface StoreUpdates {
  deltas: DeltaAction[];
}
