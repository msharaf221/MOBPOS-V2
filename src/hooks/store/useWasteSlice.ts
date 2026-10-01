import { useCallback } from 'react';
import { StoreState } from './types';
import { WasteService } from '../../services/WasteService';
import { useStoreDispatcher } from './useStoreDispatcher';

export function useWasteSlice(state: StoreState) {
    const { currentUser } = state;
    const dispatch = useStoreDispatcher(state);

    const recordStockWaste = useCallback((
      inventoryId: string,
      quantity: number,
      supplierId: string,
      reason: string,
      notes: string
    ) => {
      const { wasteRecord, updates } = WasteService.recordStockWaste(state, inventoryId, quantity, supplierId, reason, notes, currentUser);
      if (wasteRecord) {
        dispatch(updates);
      }
      return wasteRecord;
    }, [state, dispatch, currentUser]);

  

  return { recordStockWaste };
}
