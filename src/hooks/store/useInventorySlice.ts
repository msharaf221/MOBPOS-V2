import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { useStoreDispatcher } from './useStoreDispatcher';
import { validText, isFiniteNumber, roundMoney, normalizeCode } from './helpers';
import { auditEvents } from '../../utils/auditLogger';
import { InventoryItem } from '../../types';

export function useInventorySlice(state: StoreState) {
    const { categories, inventory, imeiUnits, sales, maintenance, currentUser, addAuditLog } = state;

    
    const dispatch = useStoreDispatcher(state);

    const addInventoryItem = useCallback((item: Omit<InventoryItem, 'id' | 'createdAt'>): InventoryItem | null => {
      const trimmedName = typeof item.name === 'string' ? item.name.trim() : '';
      const trimmedCode = typeof item.code === 'string' ? item.code.trim() : '';
      const trimmedBarcode = typeof item.barcode === 'string' ? item.barcode.trim() : '';
      const finalCode = trimmedCode || "PRD-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  
      if (!validText(trimmedName, 200)) return null;
      if (!validText(finalCode, 100) || trimmedBarcode.length > 100) return null;
      if (!categories.some(c => c.id === item.categoryId)) return null;
      if (!isFiniteNumber(item.costPrice) || item.costPrice < 0 || !isFiniteNumber(item.sellPrice) || item.sellPrice < 0) return null;
      if (!Number.isInteger(item.quantity) || item.quantity < 0 || !Number.isInteger(item.minQuantity) || item.minQuantity < 0) return null;
      if (typeof item.hasIMEI !== 'boolean') return null;
      if (item.hasIMEI && item.quantity !== 0) return null;
  
      const normalizedCode = normalizeCode(finalCode);
      const duplicate = inventory.find(i =>
        normalizeCode(i.code) === normalizedCode ||
        (trimmedBarcode && normalizeCode(i.barcode) === normalizeCode(trimmedBarcode))
      );
      if (duplicate) return null;
  
      const newItem: InventoryItem = {
        ...item,
        name: trimmedName, code: finalCode, barcode: trimmedBarcode,
        costPrice: roundMoney(item.costPrice), sellPrice: roundMoney(item.sellPrice),
        id: uuidv4(),
        createdAt: new Date().toISOString()
      };
      
      dispatch({ deltas: [{ type: 'upsert', storeName: 'inventory', items: [newItem] }] });
      addAuditLog(auditEvents.inventoryAdded(currentUser, newItem.name, newItem.quantity, newItem.sellPrice));
      return newItem;
    }, [categories, inventory, dispatch, currentUser, addAuditLog]);

  

    
    const updateInventoryItem = useCallback((id: string, updates: Partial<InventoryItem>): { ok: boolean; error?: string } => {
      const existing = inventory.find(i => i.id === id);
      if (!existing) return { ok: false, error: 'المنتج غير موجود' };
      if (updates.name !== undefined && !validText(updates.name, 200)) return { ok: false, error: 'اسم المنتج مطلوب (200 حرف كحد أقصى)' };
      if (updates.code !== undefined && !validText(updates.code, 100)) return { ok: false, error: 'الكود مطلوب (100 حرف كحد أقصى)' };
      if (updates.barcode !== undefined && (typeof updates.barcode !== 'string' || updates.barcode.length > 100)) return { ok: false, error: 'الباركود طويل جدًا (100 حرف كحد أقصى)' };
      if (updates.categoryId !== undefined && !categories.some(c => c.id === updates.categoryId)) return { ok: false, error: 'اختر فئة صحيحة' };
      for (const value of [updates.costPrice, updates.sellPrice, updates.quantity, updates.minQuantity]) {
        if (value !== undefined && (!isFiniteNumber(value) || value < 0)) return { ok: false, error: 'لا يمكن أن تكون الأسعار أو الكميات بقيم سالبة أو غير رقمية' };
      }
      if (updates.quantity !== undefined && !Number.isInteger(updates.quantity)) return { ok: false, error: 'الكمية يجب أن تكون عددًا صحيحًا' };
      if (updates.minQuantity !== undefined && !Number.isInteger(updates.minQuantity)) return { ok: false, error: 'حد الطلب يجب أن يكون عددًا صحيحًا' };
      if (existing.hasIMEI && updates.quantity !== undefined && updates.quantity !== 0) return { ok: false, error: 'كمية منتجات الـ IMEI تُحسب من الوحدات، عدّلها من شاشة IMEI' };
      if (updates.hasIMEI === true && (updates.quantity ?? existing.quantity) !== 0) return { ok: false, error: 'تحويل منتج إلى IMEI يتطلب أن تكون الكمية صفرًا' };
      if (updates.hasIMEI === false && existing.hasIMEI && imeiUnits.some(u => u.inventoryId === id)) return { ok: false, error: 'لا يمكن إلغاء خاصية IMEI والمنتج له وحدات مسجلة' };
      if (updates.code && inventory.some(i => i.id !== id && normalizeCode(i.code) === normalizeCode(updates.code))) {
        return { ok: false, error: 'هذا الكود مستخدم بالفعل في منتج آخر' };
      }
      if (updates.barcode && inventory.some(i => i.id !== id && normalizeCode(i.barcode) === normalizeCode(updates.barcode))) {
        return { ok: false, error: 'هذا الباركود مستخدم بالفعل في منتج آخر' };
      }
  
      const safeUpdates: Partial<InventoryItem> = { ...updates };
      delete safeUpdates.id;
      delete safeUpdates.createdAt;
      if (safeUpdates.name) safeUpdates.name = safeUpdates.name.trim();
      if (safeUpdates.code) safeUpdates.code = safeUpdates.code.trim();
      if (safeUpdates.barcode !== undefined) safeUpdates.barcode = safeUpdates.barcode.trim();
      if (safeUpdates.costPrice !== undefined) safeUpdates.costPrice = roundMoney(safeUpdates.costPrice);
      if (safeUpdates.sellPrice !== undefined) safeUpdates.sellPrice = roundMoney(safeUpdates.sellPrice);
      
      const updatedItem = { ...existing, ...safeUpdates };
      dispatch({ deltas: [{ type: 'upsert', storeName: 'inventory', items: [updatedItem] }] });
      return { ok: true };
    }, [categories, inventory, dispatch, imeiUnits]);

  

    
    const deleteInventoryItem = useCallback((id: string): { ok: boolean; error?: string } => {
      const existing = inventory.find(i => i.id === id);
      if (!existing) return { ok: false, error: 'المنتج غير موجود' };
      if (imeiUnits.some(u => u.inventoryId === id) || sales.some(s => s.items.some(i => i.inventoryId === id)) ||
          maintenance.some(m => m.parts.some(p => p.inventoryId === id))) {
        return { ok: false, error: 'لا يمكن حذف منتج مرتبط بفواتير أو أجهزة IMEI أو صيانة' };
      }
      
      dispatch({ deltas: [{ type: 'delete', storeName: 'inventory', items: [{ id }] }] });
      addAuditLog(auditEvents.inventoryDeleted(currentUser, existing.name));
      return { ok: true };
    }, [imeiUnits, sales, maintenance, inventory, dispatch, currentUser, addAuditLog]);

  

  return { addInventoryItem, updateInventoryItem, deleteInventoryItem };
}
