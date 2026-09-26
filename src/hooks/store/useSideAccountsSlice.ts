// @ts-nocheck
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { SideAccountsService } from '../../services/SideAccountsService';
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

export function useSideAccountsSlice(state: StoreState) {
    const { safes, setSafes, transactions, setTransactions, sideAccountEntries, setSideAccountEntries, currentUser } = state;

    
    const dispatch = useStoreDispatcher(state);

    const addSideAccountEntry = useCallback((input: {
      partyName: string;
      type: SideAccountEntryType;
      impact: SideAccountImpact;
      amount: number;
      paidAmount: number;
      description: string;
      notes: string;
      safeId: string;
      dueDate: string;
      newSafeName?: string;
    }) => {
      const { entry, updates } = SideAccountsService.addSideAccountEntry(state, input, currentUser);
      if (entry) {
        dispatch(updates);
      }
      return entry;
    }, [state, dispatch, currentUser]);

  

    
    const updateSideAccountEntry = useCallback((
      id: string,
      updates: Partial<Pick<SideAccountEntry, 'paidAmount' | 'status' | 'notes' | 'dueDate'>> & { safeId?: string }
    ) => {
      const { entry, storeUpdates } = SideAccountsService.updateSideAccountEntry(state, id, updates, currentUser);
      if (entry) {
        dispatch(storeUpdates);
      }
      return entry;
    }, [state, dispatch, currentUser]);

  

    const deleteSideAccountEntry = useCallback((id: string) => {
      const entry = sideAccountEntries.find(e => e.id === id);
      if (!entry) return;
  
      // Reverse every cash effect this entry ever had:
      //  - the original cash movement (capital / side_account transaction)
      //  - settlement transactions created for receivable/payable entries
      // The original transaction uses entry.transactionId, while each settlement
      // uses referenceId = entry.id, so both are matched here.
      const relatedTransactions = transactions.filter(t =>
        t.id === entry.transactionId || t.referenceId === entry.id
      );
      const deltasBySafe: Record<string, number> = {};
      relatedTransactions.forEach(t => {
        if (t.safeId) deltasBySafe[t.safeId] = (deltasBySafe[t.safeId] || 0) + t.amount;
      });
  
      if (Object.keys(deltasBySafe).length > 0) {
        setSafes(prev => prev.map(s =>
          deltasBySafe[s.id]
            ? { ...s, balance: Math.round((s.balance - deltasBySafe[s.id]) * 100) / 100 }
            : s
        ));
      }
  
      if (relatedTransactions.length > 0) {
        const idsToRemove = new Set(relatedTransactions.map(t => t.id));
        setTransactions(prev => prev.filter(t => !idsToRemove.has(t.id)));
      }
  
      setSideAccountEntries(prev => prev.filter(e => e.id !== id));
    }, [sideAccountEntries, transactions, setSafes, setSideAccountEntries, setTransactions]);
  

  return { addSideAccountEntry, updateSideAccountEntry, deleteSideAccountEntry };
}
