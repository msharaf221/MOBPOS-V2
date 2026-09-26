// @ts-nocheck
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
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

export function useIMEISlice(state: StoreState) {
    const { inventory, imeiUnits, setImeiUnits, sales, maintenance } = state;

    const addIMEIUnit = useCallback((unit: Omit<IMEIUnit, 'id' | 'createdAt'>) => {
      const inventoryItem = inventory.find(i => i.id === unit.inventoryId);
      const imei1 = unit.imei1?.trim();
      const imei2 = unit.imei2?.trim() || '';
      const statuses: IMEIUnit['status'][] = ['available', 'sold', 'returned', 'maintenance', 'wasted'];
      if (!inventoryItem?.hasIMEI || !validText(imei1, 40) || imei1 === imei2 ||
          (imei2 && imei2.length > 40) || !statuses.includes(unit.status) ||
          !isFiniteNumber(unit.purchasePrice) || unit.purchasePrice < 0 ||
          imeiUnits.some(u => u.imei1 === imei1 || u.imei2 === imei1 || (imei2 && (u.imei1 === imei2 || u.imei2 === imei2)))) return null;
      const newUnit: IMEIUnit = {
        ...unit,
        imei1, imei2,
        purchasePrice: roundMoney(unit.purchasePrice),
        id: uuidv4(),
        createdAt: new Date().toISOString()
      };
      dispatch({ deltas: [{ type: 'upsert', storeName: 'imeiUnits', items: [newUnit] }] });
      return newUnit;
    }, [inventory, imeiUnits, setImeiUnits]);
  

    const updateIMEIUnit = useCallback((id: string, updates: Partial<IMEIUnit>) => {
      const existing = imeiUnits.find(u => u.id === id);
      if (!existing) return;
      if (updates.inventoryId !== undefined && !inventory.some(i => i.id === updates.inventoryId && i.hasIMEI)) return;
      if (updates.imei1 !== undefined && !validText(updates.imei1, 40)) return;
      if (updates.imei2 !== undefined && updates.imei2.length > 40) return;
      if (updates.purchasePrice !== undefined && (!isFiniteNumber(updates.purchasePrice) || updates.purchasePrice < 0)) return;
      if (updates.imei1 && imeiUnits.some(u => u.id !== id && (u.imei1 === updates.imei1 || u.imei2 === updates.imei1))) return;
      if (updates.imei2 && imeiUnits.some(u => u.id !== id && (u.imei1 === updates.imei2 || u.imei2 === updates.imei2))) return;
      const safeUpdates = { ...updates, ...(updates.purchasePrice !== undefined ? { purchasePrice: roundMoney(updates.purchasePrice) } : {}) };
      delete safeUpdates.id;
      delete safeUpdates.createdAt;
      setImeiUnits(prev => prev.map(u => u.id === id ? { ...u, ...safeUpdates } : u));
    }, [imeiUnits, inventory, setImeiUnits]);
  

    const deleteIMEIUnit = useCallback((id: string): { ok: boolean; error?: string } => {
      const unit = imeiUnits.find(u => u.id === id);
      if (!unit) return { ok: false, error: 'وحدة IMEI غير موجودة' };
      if (unit.status === 'sold' || sales.some(s => s.items.some(i => i.imeiUnitId === id))) {
        return { ok: false, error: 'لا يمكن حذف جهاز تم بيعه؛ استخدم المرتجع للحفاظ على السجل' };
      }
      dispatch({ deltas: [{ type: 'delete', storeName: 'imeiUnits', items: [{ id }] }] });
      return { ok: true };
    }, [imeiUnits, sales, setImeiUnits]);
  

    const findIMEIByNumber = useCallback((imei: string) => {
      return imeiUnits.find(u => u.imei1 === imei || u.imei2 === imei);
    }, [imeiUnits]);
  

    const getIMEIHistory = useCallback((imei: string) => {
      const unit = imeiUnits.find(u => u.imei1 === imei || u.imei2 === imei);
      if (!unit) return null;
      
      const relatedSales = sales.filter(s => s.items.some(i => i.imeiUnitId === unit.id));
      const relatedMaintenance = maintenance.filter(m => m.imeiLink === imei);
      
      return {
        unit,
        sales: relatedSales,
        maintenance: relatedMaintenance
      };
    }, [imeiUnits, sales, maintenance]);
  

  return { addIMEIUnit, updateIMEIUnit, deleteIMEIUnit, findIMEIByNumber, getIMEIHistory };
}
