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

export function useNotificationsSlice(state: StoreState) {
    const { setNotifications } = state;

    const markNotificationAsRead = useCallback((id: string) => {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    }, [setNotifications]);
  

    const markAllNotificationsAsRead = useCallback(() => {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    }, [setNotifications]);
  

    const dismissNotification = useCallback((id: string) => {
      setNotifications(prev => prev.flatMap(n => {
        if (n.id !== id) return [n];
        // Auto alerts are kept but flagged dismissed, so the engine will not
        // resurrect them while their condition still holds. Anything else
        // (imported/legacy rows) is removed for good.
        return n.source === 'auto' ? [{ ...n, isRead: true, dismissed: true }] : [];
      }));
    }, [setNotifications]);
  

    const clearAllNotifications = useCallback(() => {
      setNotifications(prev => prev.flatMap(n =>
        n.source === 'auto' ? [{ ...n, isRead: true, dismissed: true }] : []
      ));
    }, [setNotifications]);
  

  return { markNotificationAsRead, markAllNotificationsAsRead, dismissNotification, clearAllNotifications };
}
