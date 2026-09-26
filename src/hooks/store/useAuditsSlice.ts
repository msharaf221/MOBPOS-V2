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

export function useAuditsSlice(state: StoreState) {
    const { categories, inventory, inventoryAudits, currentUser } = state;
    const dispatch = useStoreDispatcher(state);

    const createInventoryAudit = useCallback((
      title: string,
      rows: Array<{ inventoryId: string; countedQuantity: number; notes: string }>,
      notes: string,
      applyNow: boolean
    ) => {
      if (!validText(title, 200) || !Array.isArray(rows) || rows.length === 0 || typeof notes !== 'string' || notes.length > MAX_TEXT_LENGTH) return null;
      const rowIds = new Set<string>();
      if (!rows.every(row => {
        if (!row || !inventory.some(inv => inv.id === row.inventoryId) || rowIds.has(row.inventoryId) ||
            !Number.isInteger(row.countedQuantity) || row.countedQuantity < 0 || typeof row.notes !== 'string' || row.notes.length > MAX_TEXT_LENGTH) return false;
        rowIds.add(row.inventoryId);
        return true;
      })) return null;
      const nowIso = new Date().toISOString();
      const auditItems: InventoryAuditItem[] = rows.map(row => {
        const item = inventory.find(inv => inv.id === row.inventoryId);
        const category = categories.find(cat => cat.id === item?.categoryId);
        const systemQuantity = item ? getInventoryAuditQuantity(item) : 0;
        const countedQuantity = row.countedQuantity;
        const difference = countedQuantity - systemQuantity;
        const costPrice = item?.costPrice || 0;
        return {
          id: uuidv4(),
          inventoryId: row.inventoryId,
          productName: item?.name || 'منتج محذوف',
          code: item?.code || '',
          categoryName: category?.name || '',
          hasIMEI: !!item?.hasIMEI,
          costPrice,
          systemQuantity,
          countedQuantity,
          difference,
          differenceCost: difference * costPrice,
          notes: row.notes || ''
        };
      });
  
      const newAudit: InventoryAudit = {
        id: uuidv4(),
        auditNumber: generateAuditNumber(),
        title: title || `جرد ${formatDate(new Date())}`,
        status: applyNow ? 'applied' : 'draft',
        items: auditItems,
        totalShortage: auditItems.filter(i => i.difference < 0).reduce((sum, i) => sum + Math.abs(i.difference), 0),
        totalSurplus: auditItems.filter(i => i.difference > 0).reduce((sum, i) => sum + i.difference, 0),
        netDifferenceCost: auditItems.reduce((sum, i) => sum + i.differenceCost, 0),
        notes,
        userId: currentUser?.id || '',
        createdAt: nowIso,
        appliedAt: applyNow ? nowIso : ''
      };
  
      if (applyNow) {
        const newQuantities: Record<string, number> = {};
        auditItems.forEach(row => {
          if (!row.hasIMEI) newQuantities[row.inventoryId] = row.countedQuantity;
        });
        setInventory(prev => prev.map(item =>
          Object.prototype.hasOwnProperty.call(newQuantities, item.id)
            ? { ...item, quantity: newQuantities[item.id] }
            : item
        ));
        const adjustment = buildAuditAdjustmentTransaction(newAudit, new Set(Object.keys(newQuantities)), nowIso);
        if (adjustment) setTransactions(prev => [...prev, adjustment]);
      }
  
      updates.deltas.push({ type: 'upsert', storeName: 'inventoryAudits', items: [newAudit] });
        dispatch(updates);
      return newAudit;
    }, [buildAuditAdjustmentTransaction, categories, currentUser, generateAuditNumber, getInventoryAuditQuantity, inventory, dispatch]);
  

    const applyInventoryAudit = useCallback((auditId: string) => {
      const audit = inventoryAudits.find(a => a.id === auditId);
      if (!audit || audit.status === 'applied') return null;
  
      if (!Array.isArray(audit.items) || audit.items.some(row =>
        !row || typeof row.inventoryId !== 'string' || !inventory.some(item => item.id === row.inventoryId) ||
        !Number.isInteger(row.countedQuantity) || row.countedQuantity < 0
      )) return null;
  
      const newQuantities: Record<string, number> = {};
      audit.items.forEach(row => {
        if (!row.hasIMEI && inventory.some(item => item.id === row.inventoryId)) newQuantities[row.inventoryId] = row.countedQuantity;
      });
  
      setInventory(prev => prev.map(item =>
        Object.prototype.hasOwnProperty.call(newQuantities, item.id)
          ? { ...item, quantity: newQuantities[item.id] }
          : item
      ));
  
      const appliedAt = new Date().toISOString();
      const updatedAudit: InventoryAudit = { ...audit, status: 'applied', appliedAt };
      updates.deltas.push({ type: 'upsert', storeName: 'inventoryAudits', items: [updatedAudit] });
      dispatch(updates);
  
      const adjustment = buildAuditAdjustmentTransaction(updatedAudit, new Set(Object.keys(newQuantities)), appliedAt);
      if (adjustment) setTransactions(prev => [...prev, adjustment]);
  
      return updatedAudit;
    }, [buildAuditAdjustmentTransaction, inventory, inventoryAudits, dispatch]);
  

    const deleteInventoryAudit = useCallback((auditId: string) => {
      dispatch({ deltas: [{ type: 'delete', storeName: 'inventoryAudits', items: [{ id: auditId }] }] });
    }, [dispatch]);
  

  return { createInventoryAudit, applyInventoryAudit, deleteInventoryAudit };
}
