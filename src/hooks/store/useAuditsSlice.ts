import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { StoreUpdates } from '../../services/types';
import { useStoreDispatcher } from './useStoreDispatcher';
import { validText, MAX_TEXT_LENGTH } from './helpers';
import { formatDate } from '../../utils/format';
import { nextDocumentNumber } from '../../utils/sequence';
import { InventoryAudit, InventoryAuditItem, InventoryItem } from '../../types';

export function useAuditsSlice(state: StoreState) {
    const { categories, inventory, inventoryAudits, currentUser } = state;
    const dispatch = useStoreDispatcher(state);

    const generateAuditNumber = useCallback(() => nextDocumentNumber(inventoryAudits.map(a => a.auditNumber), 'AUD', 4), [inventoryAudits]);
    const getInventoryAuditQuantity = (item: InventoryItem) => item.quantity || 0;

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
  
      const updates: StoreUpdates = { deltas: [] };
      if (applyNow) {
        const updatedInventory: InventoryItem[] = [];
        auditItems.forEach(row => {
          if (!row.hasIMEI) {
            const item = inventory.find(i => i.id === row.inventoryId);
            if (item) updatedInventory.push({ ...item, quantity: row.countedQuantity });
          }
        });
        if (updatedInventory.length > 0) updates.deltas.push({ type: 'upsert', storeName: 'inventory', items: updatedInventory });
      }
  
      updates.deltas.push({ type: 'upsert', storeName: 'inventoryAudits', items: [newAudit] });
      dispatch(updates);
      return newAudit;
    }, [categories, currentUser, generateAuditNumber, inventory, dispatch]);
  

    const applyInventoryAudit = useCallback((auditId: string) => {
      const audit = inventoryAudits.find(a => a.id === auditId);
      if (!audit || audit.status === 'applied') return null;
  
      if (!Array.isArray(audit.items) || audit.items.some(row =>
        !row || typeof row.inventoryId !== 'string' || !inventory.some(item => item.id === row.inventoryId) ||
        !Number.isInteger(row.countedQuantity) || row.countedQuantity < 0
      )) return null;
  
      const updates: StoreUpdates = { deltas: [] };
      const updatedInventory: InventoryItem[] = [];
      audit.items.forEach(row => {
        if (!row.hasIMEI) {
          const item = inventory.find(i => i.id === row.inventoryId);
          if (item) updatedInventory.push({ ...item, quantity: row.countedQuantity });
        }
      });
      if (updatedInventory.length > 0) updates.deltas.push({ type: 'upsert', storeName: 'inventory', items: updatedInventory });
  
      const appliedAt = new Date().toISOString();
      const updatedAudit: InventoryAudit = { ...audit, status: 'applied', appliedAt };
      updates.deltas.push({ type: 'upsert', storeName: 'inventoryAudits', items: [updatedAudit] });
      dispatch(updates);
      return updatedAudit;
    }, [inventory, inventoryAudits, dispatch]);
  

    const deleteInventoryAudit = useCallback((auditId: string) => {
      dispatch({ deltas: [{ type: 'delete', storeName: 'inventoryAudits', items: [{ id: auditId }] }] });
    }, [dispatch]);
  

  return { createInventoryAudit, applyInventoryAudit, deleteInventoryAudit };
}
