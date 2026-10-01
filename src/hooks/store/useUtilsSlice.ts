import { useCallback } from 'react';
import { StoreState } from './types';
import { indexedDBUtils } from '../useIndexedDB';
import {
  initialUsers, initialCustomers, initialCategories, initialInventory,
  initialIMEIUnits, initialSales, initialSaleReturns, initialMaintenance, initialSafes,
  initialTransactions, initialSuppliers, initialPurchases, initialStockWastes, initialInventoryAudits,
  initialSideAccountEntries, initialNotifications
} from '../../data/initialData';

export function useUtilsSlice(_state: StoreState) {

    const resetAllData = useCallback(async () => {
      const defaultData = {
        users: initialUsers,
        customers: initialCustomers,
        categories: initialCategories,
        inventory: initialInventory,
        imeiUnits: initialIMEIUnits,
        sales: initialSales,
        saleReturns: initialSaleReturns,
        maintenance: initialMaintenance,
        safes: initialSafes,
        transactions: initialTransactions,
        suppliers: initialSuppliers,
        purchases: initialPurchases,
        stockWastes: initialStockWastes,
        inventoryAudits: initialInventoryAudits,
        sideAccountEntries: initialSideAccountEntries,
        notifications: initialNotifications,
      };
  
      // Atomically clear + repopulate each store (guaranteed clean slate)
      await indexedDBUtils.resetAllStores(defaultData);
    }, []);
  

  return { resetAllData };
}
