// @ts-nocheck
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { indexedDBUtils } from '../useIndexedDB';
import { validText, isFiniteNumber, isPositiveInteger, roundMoney, MAX_TEXT_LENGTH } from './helpers';
import { hashPasswordForStorage, verifyLoginPassword, needsRehash } from '../../utils/passwords';
import { authenticateLanUser, pushDelta } from '../../utils/lanSync';
import { auditEvents } from '../../utils/auditLogger';
import { buildAutoNotifications, mergeAutoNotifications } from '../../utils/alerts';
import { planSettlementReversal, settledThroughSafes } from '../../utils/sideAccounts';
import { summarizeReturns, returnsInPeriod } from '../../utils/returns';
import { buildImeiStockIndex, isSellableUnit } from '../../utils/stockCounts';
import { formatDate } from '../../utils/format';
import { nextDocumentNumber } from '../../utils/sequence';
import { initialUsers, initialCustomers, initialCategories, initialInventory, initialIMEIUnits, initialSales, initialSaleReturns, initialMaintenance, initialSafes, initialTransactions, initialSuppliers, initialPurchases, initialStockWastes, initialInventoryAudits, initialSideAccountEntries, initialNotifications, initialAuditLogs } from '../../data/initialData';
import { User, Customer, Category, InventoryItem, IMEIUnit, Sale, SaleItem, SaleReturn, Maintenance, MaintenancePart, Safe, Transaction, Supplier, Notification, Purchase, PurchaseItem, StockWaste, InventoryAudit, InventoryAuditItem, SideAccountEntry, SideAccountEntryType, SideAccountImpact, AppSettings, AuditLogEntry } from '../../types';

export function useUtilsSlice(state: StoreState) {
    const { users, customers, categories, inventory, imeiUnits, sales, saleReturns, maintenance, safes, transactions, suppliers, purchases, stockWastes, inventoryAudits, sideAccountEntries, notifications } = state;

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
