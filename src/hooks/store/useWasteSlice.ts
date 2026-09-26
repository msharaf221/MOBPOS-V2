// @ts-nocheck
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { WasteService } from '../../services/WasteService';
import { useStoreDispatcher } from './useStoreDispatcher';
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

export function useWasteSlice(state: StoreState) {
    const { inventory, setInventory, imeiUnits, setImeiUnits, setTransactions, suppliers, setStockWastes, currentUser } = state;

    
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
