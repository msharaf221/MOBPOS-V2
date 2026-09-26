// @ts-nocheck
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { SafesService } from '../../services/SafesService';
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

export function useSafesSlice(state: StoreState) {
    const { safes, setSafes, transactions, setTransactions, sideAccountEntries, currentUser } = state;

    
    const addSafe = useCallback((safe: Omit<Safe, 'id'>) => {
      const validTypes: NonNullable<Safe['type']>[] = ['cash', 'ewallet', 'bank'];
      if (!validText(safe.name, 200) || !isFiniteNumber(safe.balance) || safe.balance < 0 || typeof safe.isDefault !== 'boolean' ||
          (safe.type !== undefined && !validTypes.includes(safe.type)) || safes.some(s => s.name.trim() === safe.name.trim())) return null;
      const openingBalance = roundMoney(safe.balance);
      const newSafe: Safe = { ...safe, name: safe.name.trim(), balance: openingBalance, id: uuidv4() };
      
      const updates = { deltas: [] };
      if (newSafe.isDefault) {
         const oldDefaults = safes.filter(s => s.isDefault).map(s => ({ ...s, isDefault: false }));
         if (oldDefaults.length > 0) updates.deltas.push({ type: 'upsert', storeName: 'safes', items: oldDefaults });
      }
      updates.deltas.push({ type: 'upsert', storeName: 'safes', items: [newSafe] });
  
      if (openingBalance > 0) {
        updates.deltas.push({ type: 'upsert', storeName: 'transactions', items: [{
          id: uuidv4(),
          type: 'capital',
          amount: openingBalance,
          description: `رصيد افتتاحي - ${newSafe.name}`,
          referenceId: newSafe.id,
          safeId: newSafe.id,
          userId: currentUser?.id || '',
          createdAt: new Date().toISOString()
        }]});
      }
      dispatch(updates);
      return newSafe;
    }, [currentUser, safes, dispatch]);

  

    
    const deleteSafe = useCallback((id: string): { ok: boolean; error?: string } => {
      if (currentUser?.role !== 'admin') {
        return { ok: false, error: 'حذف الخزانة متاح لمدير النظام فقط' };
      }
  
      const safe = safes.find(s => s.id === id);
      if (!safe) return { ok: false, error: 'الخزنة غير موجودة' };
      if (safe.isDefault) return { ok: false, error: 'لا يمكن حذف الخزنة الافتراضية' };
      if (safes.length <= 1) return { ok: false, error: 'لا يمكن حذف آخر خزنة في النظام' };
      if ((safe.balance || 0) !== 0) {
        return { ok: false, error: 'رصيد الخزنة غير صفري — حوّل الرصيد إلى خزنة أخرى أو صفّره أولاً' };
      }
      const hasHistory = transactions.some(t => t.safeId === id)
        || sideAccountEntries.some(e => e.safeId === id);
      if (hasHistory) {
        return { ok: false, error: 'توجد حركات أو حسابات جانبية مرتبطة بهذه الخزنة — لا يمكن حذفها للحفاظ على السجلات المالية' };
      }
  
      dispatch({ deltas: [{ type: 'delete', storeName: 'safes', items: [{ id }] }] });
      return { ok: true };
    }, [currentUser, safes, transactions, sideAccountEntries, dispatch]);

  

    
    const dispatch = useStoreDispatcher(state);

    const transferBetweenSafes = useCallback((fromId: string, toId: string, amount: number) => {
      const { ok, updates } = SafesService.transferBetweenSafes(state, fromId, toId, amount, currentUser);
      if (ok) {
        dispatch(updates);
      }
    }, [state, dispatch, currentUser]);

  

  return { addSafe, deleteSafe, transferBetweenSafes };
}
