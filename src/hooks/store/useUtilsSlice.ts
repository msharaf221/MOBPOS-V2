import { useCallback } from 'react';
import { StoreState } from './types';
import { indexedDBUtils } from '../useIndexedDB';
import { denyUnlessRole } from './helpers';
import {
  initialUsers, initialCustomers, initialCategories, initialInventory,
  initialIMEIUnits, initialSales, initialSaleReturns, initialMaintenance, initialSafes,
  initialTransactions, initialSuppliers, initialPurchases, initialStockWastes, initialInventoryAudits,
  initialSideAccountEntries, initialNotifications
} from '../../data/initialData';

export function useUtilsSlice(state: StoreState) {
  const { currentUser } = state;

  const resetAllData = useCallback(async () => {
    const denied = denyUnlessRole(currentUser, 'admin', 'إعادة ضبط البيانات متاحة لمدير النظام فقط');
    if (denied) {
      console.warn(`[useUtilsSlice] ${denied.error}`);
      return;
    }

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
  }, [currentUser]);
  

  return { resetAllData };
}
