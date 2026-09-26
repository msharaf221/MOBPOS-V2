import { StoreState } from '../hooks/store/types';

export type DeltaAction = 
  | { type: 'replace'; storeName: keyof StoreState; items: any[] }
  | { type: 'upsert'; storeName: keyof StoreState; items: any[] }
  | { type: 'delete'; storeName: keyof StoreState; items: any[] }
  | { type: 'increment'; storeName: keyof StoreState; items: any[] };

export interface StoreUpdates {
  deltas: DeltaAction[];
}
