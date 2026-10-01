import { useCallback, useEffect, useState } from 'react';
import { useIndexedDB, useIndexedDBSetting, indexedDBUtils } from './useIndexedDB';
import { defaultAppSettings } from './store/helpers';
import { StoreState } from './store/types';
import {
  User, Customer, Category, InventoryItem, IMEIUnit,
  Sale, SaleReturn, Maintenance, Safe, Transaction, Supplier, Notification,
  Purchase, StockWaste, InventoryAudit, SideAccountEntry,
  AppSettings, AuditLogEntry
} from '../types';
import {
  initialUsers, initialCustomers, initialCategories, initialInventory,
  initialIMEIUnits, initialSales, initialSaleReturns, initialMaintenance, initialSafes,
  initialTransactions, initialSuppliers, initialPurchases, initialStockWastes, initialInventoryAudits,
  initialSideAccountEntries, initialNotifications, initialAuditLogs
} from '../data/initialData';

import { useAuthSlice } from './store/useAuthSlice';
import { useCustomersSlice } from './store/useCustomersSlice';
import { useCategoriesSlice } from './store/useCategoriesSlice';
import { useInventorySlice } from './store/useInventorySlice';
import { useIMEISlice } from './store/useIMEISlice';
import { useSalesSlice } from './store/useSalesSlice';
import { usePurchasesSlice } from './store/usePurchasesSlice';
import { useWasteSlice } from './store/useWasteSlice';
import { useAuditsSlice } from './store/useAuditsSlice';
import { useSideAccountsSlice } from './store/useSideAccountsSlice';
import { useMaintenanceSlice } from './store/useMaintenanceSlice';
import { useSafesSlice } from './store/useSafesSlice';
import { useTransactionsSlice } from './store/useTransactionsSlice';
import { useNotificationsSlice } from './store/useNotificationsSlice';
import { useStatsSlice } from './store/useStatsSlice';
import { useUtilsSlice } from './store/useUtilsSlice';


export { defaultAppSettings } from './store/helpers';

export function useStore() {
  const [users, setUsers, usersLoading] = useIndexedDB<User>('users', initialUsers);
  const [customers, setCustomers, customersLoading] = useIndexedDB<Customer>('customers', initialCustomers);
  const [categories, setCategories, categoriesLoading] = useIndexedDB<Category>('categories', initialCategories);
  const [inventory, setInventory, inventoryLoading] = useIndexedDB<InventoryItem>('inventory', initialInventory);
  const [imeiUnits, setImeiUnits, imeiLoading] = useIndexedDB<IMEIUnit>('imeiUnits', initialIMEIUnits);
  const [sales, setSales, salesLoading] = useIndexedDB<Sale>('sales', initialSales);
  const [saleReturns, setSaleReturns, saleReturnsLoading] = useIndexedDB<SaleReturn>('saleReturns', initialSaleReturns);
  const [maintenance, setMaintenance, maintenanceLoading] = useIndexedDB<Maintenance>('maintenance', initialMaintenance);
  const [safes, setSafes, safesLoading] = useIndexedDB<Safe>('safes', initialSafes);
  const [transactions, setTransactions, transactionsLoading] = useIndexedDB<Transaction>('transactions', initialTransactions);
  const [suppliers, setSuppliers, suppliersLoading] = useIndexedDB<Supplier>('suppliers', initialSuppliers);
  const [purchases, setPurchases, purchasesLoading] = useIndexedDB<Purchase>('purchases', initialPurchases);
  const [stockWastes, setStockWastes, stockWastesLoading] = useIndexedDB<StockWaste>('stockWastes', initialStockWastes);
  const [inventoryAudits, setInventoryAudits, inventoryAuditsLoading] = useIndexedDB<InventoryAudit>('inventoryAudits', initialInventoryAudits);
  const [sideAccountEntries, setSideAccountEntries, sideAccountEntriesLoading] = useIndexedDB<SideAccountEntry>('sideAccountEntries', initialSideAccountEntries);
  const [notifications, setNotifications, notificationsLoading] = useIndexedDB<Notification>('notifications', initialNotifications);
  const [auditLogs, setAuditLogs, auditLogsLoading] = useIndexedDB<AuditLogEntry>('auditLogs', initialAuditLogs);

  const addAuditLog = useCallback((entry: AuditLogEntry) => {
    setAuditLogs(prev => [entry, ...prev.slice(0, 4999)]);
  }, [setAuditLogs]);
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const userLoading = false;
  const [isDarkMode, setIsDarkMode, darkModeLoading] = useIndexedDBSetting<boolean>('darkMode', false);
  const [appSettings, setAppSettings, appSettingsLoading] = useIndexedDBSetting<AppSettings>('shopSettings', defaultAppSettings);

  useEffect(() => {
    indexedDBUtils.remove('appSettings', 'currentUser').catch(() => {
    });
  }, []);

  const isLoading = usersLoading || customersLoading || categoriesLoading || 
    inventoryLoading || imeiLoading || salesLoading || maintenanceLoading ||
    saleReturnsLoading || safesLoading || transactionsLoading || suppliersLoading || purchasesLoading || stockWastesLoading ||
    inventoryAuditsLoading || sideAccountEntriesLoading || notificationsLoading || auditLogsLoading ||
    userLoading || darkModeLoading || appSettingsLoading;

  const state: StoreState = {
    users, setUsers,
    customers, setCustomers,
    categories, setCategories,
    inventory, setInventory,
    imeiUnits, setImeiUnits,
    sales, setSales,
    saleReturns, setSaleReturns,
    maintenance, setMaintenance,
    safes, setSafes,
    transactions, setTransactions,
    suppliers, setSuppliers,
    purchases, setPurchases,
    stockWastes, setStockWastes,
    inventoryAudits, setInventoryAudits,
    sideAccountEntries, setSideAccountEntries,
    notifications, setNotifications,
    auditLogs, setAuditLogs,
    currentUser, setCurrentUser,
    isDarkMode, setIsDarkMode,
    appSettings, setAppSettings,
    addAuditLog
  };

  const auth = useAuthSlice(state);
  const customersSlice = useCustomersSlice(state);
  const categoriesSlice = useCategoriesSlice(state);
  const inventorySlice = useInventorySlice(state);
  const imeiSlice = useIMEISlice(state);
  const salesSlice = useSalesSlice(state);
  const purchasesSlice = usePurchasesSlice(state);
  const wasteSlice = useWasteSlice(state);
  const auditsSlice = useAuditsSlice(state);
  const sideAccountsSlice = useSideAccountsSlice(state);
  const maintenanceSlice = useMaintenanceSlice(state);
  const safesSlice = useSafesSlice(state);
  const transactionsSlice = useTransactionsSlice(state);
  const notificationsSlice = useNotificationsSlice(state);
  const statsSlice = useStatsSlice(state);
  const utilsSlice = useUtilsSlice(state);

  return {
    ...state,
    isLoading,
    ...auth,
    ...customersSlice,
    ...categoriesSlice,
    ...inventorySlice,
    ...imeiSlice,
    ...salesSlice,
    ...purchasesSlice,
    ...wasteSlice,
    ...auditsSlice,
    ...sideAccountsSlice,
    ...maintenanceSlice,
    ...safesSlice,
    ...transactionsSlice,
    ...notificationsSlice,
    ...statsSlice,
    ...utilsSlice,
    clearAuditLogs: () => setAuditLogs([]),
    auditLogsLoading
  };
}
