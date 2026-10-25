/**
 * useLanSync — LAN host/client data bridge.
 *
 * Extracted from App.tsx so the root component stays focused on
 * license / auth / routing. This hook:
 *  - On LAN client: pulls full central snapshot once, then listens to SSE
 *  - On host: pushes full snapshot once, then listens to SSE
 *  - Applies incoming deltas via the shared applyStoreDelta helper
 */

import { useEffect } from 'react';
import type {
  User, Customer, Category, InventoryItem, IMEIUnit, Sale, SaleReturn,
  Maintenance, Safe, Transaction, Supplier, Purchase, StockWaste,
  InventoryAudit, SideAccountEntry, Notification, AppSettings, AuditLogEntry
} from '../types';
import {
  isLanClient,
  fetchCentralData,
  pushCentralData,
  pushDelta,
  connectLanStream,
} from '../utils/lanSync';
import { applyStoreDelta, type Identifiable, type DeltaType } from './store/applyDeltas';

/** Minimal store surface required by the LAN bridge */
export interface LanSyncStore {
  isLoading: boolean;
  users: User[];
  customers: Customer[];
  categories: Category[];
  inventory: InventoryItem[];
  imeiUnits: IMEIUnit[];
  sales: Sale[];
  saleReturns: SaleReturn[];
  maintenance: Maintenance[];
  safes: Safe[];
  transactions: Transaction[];
  suppliers: Supplier[];
  purchases: Purchase[];
  stockWastes: StockWaste[];
  inventoryAudits: InventoryAudit[];
  sideAccountEntries: SideAccountEntry[];
  notifications: Notification[];
  auditLogs: AuditLogEntry[];
  appSettings: AppSettings;
  setUsers: (v: User[] | ((p: User[]) => User[])) => void;
  setCustomers: (v: Customer[] | ((p: Customer[]) => Customer[])) => void;
  setCategories: (v: Category[] | ((p: Category[]) => Category[])) => void;
  setInventory: (v: InventoryItem[] | ((p: InventoryItem[]) => InventoryItem[])) => void;
  setImeiUnits: (v: IMEIUnit[] | ((p: IMEIUnit[]) => IMEIUnit[])) => void;
  setSales: (v: Sale[] | ((p: Sale[]) => Sale[])) => void;
  setSaleReturns: (v: SaleReturn[] | ((p: SaleReturn[]) => SaleReturn[])) => void;
  setMaintenance: (v: Maintenance[] | ((p: Maintenance[]) => Maintenance[])) => void;
  setSafes: (v: Safe[] | ((p: Safe[]) => Safe[])) => void;
  setTransactions: (v: Transaction[] | ((p: Transaction[]) => Transaction[])) => void;
  setSuppliers: (v: Supplier[] | ((p: Supplier[]) => Supplier[])) => void;
  setPurchases: (v: Purchase[] | ((p: Purchase[]) => Purchase[])) => void;
  setStockWastes: (v: StockWaste[] | ((p: StockWaste[]) => StockWaste[])) => void;
  setInventoryAudits: (v: InventoryAudit[] | ((p: InventoryAudit[]) => InventoryAudit[])) => void;
  setSideAccountEntries: (v: SideAccountEntry[] | ((p: SideAccountEntry[]) => SideAccountEntry[])) => void;
  setNotifications: (v: Notification[] | ((p: Notification[]) => Notification[])) => void;
  setAuditLogs: (v: AuditLogEntry[] | ((p: AuditLogEntry[]) => AuditLogEntry[])) => void;
  setAppSettings: (v: AppSettings | ((p: AppSettings) => AppSettings)) => void;
}

function buildSetters(store: LanSyncStore): Record<string, (val: unknown) => void> {
  return {
    users: store.setUsers as (val: unknown) => void,
    customers: store.setCustomers as (val: unknown) => void,
    categories: store.setCategories as (val: unknown) => void,
    inventory: store.setInventory as (val: unknown) => void,
    imeiUnits: store.setImeiUnits as (val: unknown) => void,
    sales: store.setSales as (val: unknown) => void,
    saleReturns: store.setSaleReturns as (val: unknown) => void,
    maintenance: store.setMaintenance as (val: unknown) => void,
    safes: store.setSafes as (val: unknown) => void,
    transactions: store.setTransactions as (val: unknown) => void,
    suppliers: store.setSuppliers as (val: unknown) => void,
    purchases: store.setPurchases as (val: unknown) => void,
    stockWastes: store.setStockWastes as (val: unknown) => void,
    inventoryAudits: store.setInventoryAudits as (val: unknown) => void,
    sideAccountEntries: store.setSideAccountEntries as (val: unknown) => void,
    notifications: store.setNotifications as (val: unknown) => void,
    auditLogs: store.setAuditLogs as (val: unknown) => void,
    appSettings: (items: unknown) => {
      const val = Array.isArray(items) ? items[0] : items;
      if (val && typeof val === 'object') {
        store.setAppSettings(val as AppSettings);
      }
    },
  };
}

function applyCentralSnapshot(store: LanSyncStore, centralData: Record<string, unknown>): void {
  if (Array.isArray(centralData.users) && (centralData.users as unknown[]).length > 0) {
    store.setUsers(centralData.users as User[]);
  }
  if (Array.isArray(centralData.customers)) store.setCustomers(centralData.customers as Customer[]);
  if (Array.isArray(centralData.categories)) store.setCategories(centralData.categories as Category[]);
  if (Array.isArray(centralData.inventory)) store.setInventory(centralData.inventory as InventoryItem[]);
  if (Array.isArray(centralData.imeiUnits)) store.setImeiUnits(centralData.imeiUnits as IMEIUnit[]);
  if (Array.isArray(centralData.sales)) store.setSales(centralData.sales as Sale[]);
  if (Array.isArray(centralData.saleReturns)) store.setSaleReturns(centralData.saleReturns as SaleReturn[]);
  if (Array.isArray(centralData.maintenance)) store.setMaintenance(centralData.maintenance as Maintenance[]);
  if (Array.isArray(centralData.safes)) store.setSafes(centralData.safes as Safe[]);
  if (Array.isArray(centralData.transactions)) store.setTransactions(centralData.transactions as Transaction[]);
  if (Array.isArray(centralData.suppliers)) store.setSuppliers(centralData.suppliers as Supplier[]);
  if (Array.isArray(centralData.purchases)) store.setPurchases(centralData.purchases as Purchase[]);
  if (Array.isArray(centralData.stockWastes)) store.setStockWastes(centralData.stockWastes as StockWaste[]);
  if (Array.isArray(centralData.inventoryAudits)) store.setInventoryAudits(centralData.inventoryAudits as InventoryAudit[]);
  if (Array.isArray(centralData.sideAccountEntries)) store.setSideAccountEntries(centralData.sideAccountEntries as SideAccountEntry[]);
  if (Array.isArray(centralData.notifications)) store.setNotifications(centralData.notifications as Notification[]);
  if (Array.isArray(centralData.auditLogs)) store.setAuditLogs(centralData.auditLogs as AuditLogEntry[]);
  if (centralData.appSettings && typeof centralData.appSettings === 'object') {
    store.setAppSettings(centralData.appSettings as AppSettings);
  }
}

/**
 * @param enabled - typically `screen === 'app'`
 * @param store   - the result of useStore() (or a compatible subset)
 */
export function useLanSync(enabled: boolean, store: LanSyncStore): void {
  // Full snapshot + live SSE
  useEffect(() => {
    if (!enabled || store.isLoading) return;

    let cleanupStream: (() => void) | null = null;
    const cleanupFns: Array<() => void> = [];
    const setters = buildSetters(store);

    if (isLanClient()) {
      // 🔴 SECURITY: القراءة تحتاج جلسة الآن — لو مفيش جلسة بعد (قبل تسجيل الدخول)
      // fetchCentralData سترجع null وهنا ننتظر حدث جاهزية الجلسة لإعادة السحب.
      fetchCentralData()
        .then(centralData => {
          if (centralData) applyCentralSnapshot(store, centralData);
        })
        .catch(e => console.warn('[useLanSync] fetchCentralData error:', e));
    } else {
      pushCentralData({
        users: store.users,
        customers: store.customers,
        categories: store.categories,
        inventory: store.inventory,
        imeiUnits: store.imeiUnits,
        sales: store.sales,
        saleReturns: store.saleReturns,
        maintenance: store.maintenance,
        safes: store.safes,
        transactions: store.transactions,
        suppliers: store.suppliers,
        purchases: store.purchases,
        stockWastes: store.stockWastes,
        inventoryAudits: store.inventoryAudits,
        sideAccountEntries: store.sideAccountEntries,
        notifications: store.notifications,
        auditLogs: store.auditLogs,
        appSettings: store.appSettings,
      }).catch(e => console.warn('[useLanSync] pushCentralData error:', e));
    }

    // 🔴 SECURITY: بعد حفظ جلسة جديدة (mobpos:lan-session-ready) يعيد عميل LAN
    // سحب نسخة كاملة من بيانات السيرفر مباشرة (كان مستني إعادة تركيب الواجهة).
    if (isLanClient()) {
      const onSessionReady = () => {
        fetchCentralData()
          .then(centralData => {
            if (centralData) applyCentralSnapshot(store, centralData);
          })
          .catch(e => console.warn('[useLanSync] session-ready refetch error:', e));
      };
      window.addEventListener('mobpos:lan-session-ready', onSessionReady);
      cleanupFns.push(() => window.removeEventListener('mobpos:lan-session-ready', onSessionReady));
    }

    cleanupStream = connectLanStream({
      onSync: ({ storeName, items, deltaType }) => {
        const setter = setters[storeName];
        if (!setter) return;

        if (deltaType === 'replace') {
          setter(items);
          return;
        }

        // Functional update for upsert / delete / increment
        (setter as (fn: (prev: Identifiable[]) => Identifiable[]) => void)(prev =>
          applyStoreDelta(prev, deltaType as DeltaType, items, storeName)
        );
      },
      onFullDataReplaced: () => {
        fetchCentralData()
          .then(centralData => {
            if (!centralData) return;
            if (Array.isArray(centralData.sales)) store.setSales(centralData.sales as Sale[]);
            if (Array.isArray(centralData.inventory)) store.setInventory(centralData.inventory as InventoryItem[]);
            if (Array.isArray(centralData.maintenance)) store.setMaintenance(centralData.maintenance as Maintenance[]);
            if (Array.isArray(centralData.safes)) store.setSafes(centralData.safes as Safe[]);
            if (Array.isArray(centralData.auditLogs)) store.setAuditLogs(centralData.auditLogs as AuditLogEntry[]);
          })
          .catch(e => console.warn('[useLanSync] onFullDataReplaced error:', e));
      },
    });

    return () => {
      if (cleanupStream) cleanupStream();
      cleanupFns.forEach(fn => fn());
    };
    // We intentionally depend only on enabled + isLoading so we don't
    // re-subscribe on every store mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, store.isLoading]);

  // Host: keep users in sync on the LAN hub
  useEffect(() => {
    if (!enabled || isLanClient() || store.isLoading) return;
    if (!Array.isArray(store.users) || store.users.length === 0) return;
    pushDelta('users', store.users, 'replace').catch(() => undefined);
  }, [enabled, store.users, store.isLoading]);

  // Host: keep app settings + LAN PIN in sync
  useEffect(() => {
    if (!enabled || isLanClient() || store.isLoading || !store.appSettings) return;
    pushDelta('appSettings', [store.appSettings], 'replace').catch(() => undefined);
  }, [enabled, store.appSettings, store.isLoading]);
}
