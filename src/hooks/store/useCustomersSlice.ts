// @ts-nocheck
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { CustomersService } from '../../services/CustomersService';
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

export function useCustomersSlice(state: StoreState) {
    const { customers, setCustomers, imeiUnits, sales, safes, setSafes, transactions, setTransactions, currentUser } = state;

    
    const dispatch = useStoreDispatcher(state);

    const addCustomer = useCallback((customer: Omit<Customer, 'id' | 'createdAt' | 'balance'>) => {
      const { customer: newCustomer, updates } = CustomersService.addCustomer(state, customer);
      if (newCustomer) {
        dispatch(updates);
      }
      return newCustomer;
    }, [state, dispatch]);

  

    
    const updateCustomer = useCallback((id: string, updates: Partial<Customer>) => {
      const res = CustomersService.updateCustomer(state, id, updates);
      if (res.ok) {
        dispatch(res.updates);
      }
    }, [state, dispatch]);

  

    
    const deleteCustomer = useCallback((id: string) => {
      const res = CustomersService.deleteCustomer(state, id);
      if (res.ok) {
        dispatch(res.updates);
      }
      return res;
    }, [state, dispatch]);

  

    
    const recordCustomerPayment = useCallback((customerId: string, amount: number, safeId: string, notes: string) => {
      const { transaction, updates } = CustomersService.recordCustomerPayment(state, customerId, amount, safeId, notes, currentUser);
      if (transaction) {
        dispatch(updates);
      }
      return transaction;
    }, [state, dispatch, currentUser]);

  

    
    const recordWalletTransaction = useCallback((
      type: 'deposit' | 'withdrawal',
      amount: number,
      fee: number,
      cost: number,
      walletId: string,
      cashSafeId: string,
      notes: string
    ) => {
      const { transactions: txs, updates } = CustomersService.recordWalletTransaction(
        state, type, amount, fee, cost, walletId, cashSafeId, notes, currentUser
      );
      if (txs) {
        dispatch(updates);
      }
      return txs;
    }, [state, dispatch, currentUser]);

  

  return { addCustomer, updateCustomer, deleteCustomer, recordCustomerPayment, recordWalletTransaction };
}
