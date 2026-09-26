// @ts-nocheck
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { SalesService } from '../../services/SalesService';
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

export function useSalesSlice(state: StoreState) {
    const { customers, setCustomers, inventory, setInventory, imeiUnits, setImeiUnits, sales, setSales, saleReturns, setSaleReturns, safes, setSafes, setTransactions, currentUser, addAuditLog } = state;

    const generateInvoiceNumber = useCallback(
      () => nextDocumentNumber(sales.map(s => s.invoiceNumber), 'INV', 4),
      [sales]
    );
  

    
    const dispatch = useStoreDispatcher(state);

    const createSale = useCallback((
      customerId: string,
      items: Omit<SaleItem, 'id' | 'returnedQuantity'>[],
      discount: number,
      paidAmount: number,
      paymentMethod: 'cash' | 'card' | 'installment',
      safeId: string,
      notes: string
    ): Sale | null => {
      const { sale, updates } = SalesService.createSale(
        state, customerId, items, discount, paidAmount, paymentMethod, safeId, notes, currentUser
      );
      if (sale) {
        dispatch(updates);
        addAuditLog(auditEvents.saleCreated(currentUser, sale.invoiceNumber, sale.total, sale.paid, customerId ? customers.find(c => c.id === customerId)?.name : undefined, safes.find(s => s.id === safeId)?.name));
      }
      return sale;
    }, [state, dispatch, currentUser, addAuditLog, customers, safes]);

  

    
    const processSaleReturn = useCallback((
      saleId: string,
      saleItemId: string,
      quantity: number,
      reason: string
    ) => {
      const { returnRecord, updates } = SalesService.processSaleReturn(
        state, saleId, saleItemId, quantity, reason, currentUser
      );
      if (returnRecord) {
        dispatch(updates);
        const sale = sales.find(s => s.id === saleId);
        const safeObj = safes.find(s => s.id === sale?.safeId);
        addAuditLog(auditEvents.saleReturnProcessed(currentUser, sale?.invoiceNumber || '', returnRecord.refundAmount, reason, safeObj?.name));
      }
      return returnRecord;
    }, [state, dispatch, currentUser, addAuditLog, sales, safes]);

  

  return { generateInvoiceNumber, createSale, processSaleReturn };
}
