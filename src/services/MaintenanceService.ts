import { v4 as uuidv4 } from 'uuid';
import { StoreState } from '../hooks/store/types';
import { StoreUpdates } from './types';
import { validText, isFiniteNumber, isPositiveInteger, roundMoney } from '../hooks/store/helpers';
import { MaintenancePart, Transaction, Maintenance } from '../types';

export class MaintenanceService {
  static addMaintenancePart(
    state: StoreState,
    maintenanceId: string,
    part: Omit<MaintenancePart, 'id'>
  ): { safePart: MaintenancePart | null; updates: StoreUpdates } {
    const { maintenance, inventory } = state;
    const maint = maintenance.find(m => m.id === maintenanceId);
    if (!maint || maint.status === 'delivered' || maint.status === 'cancelled' || typeof part.inventoryId !== 'string' ||
        !isPositiveInteger(part.quantity) || !validText(part.name, 200) || !isFiniteNumber(part.unitCost) || part.unitCost < 0) {
      return { safePart: null, updates: { deltas: [] } };
    }

    let safePart: MaintenancePart;
    if (part.inventoryId.startsWith('manual-')) {
      safePart = { ...part, name: part.name.trim(), unitCost: roundMoney(part.unitCost), total: roundMoney(part.unitCost * part.quantity), id: uuidv4() };
    } else {
      const inventoryItem = inventory.find(inv => inv.id === part.inventoryId);
      if (!inventoryItem || inventoryItem.hasIMEI || inventoryItem.quantity < part.quantity) {
        return { safePart: null, updates: { deltas: [] } };
      }
      safePart = {
        id: uuidv4(), inventoryId: inventoryItem.id, name: inventoryItem.name,
        quantity: part.quantity, unitCost: roundMoney(inventoryItem.costPrice),
        total: roundMoney(inventoryItem.costPrice * part.quantity)
      };
    }

    const updates: StoreUpdates = { deltas: [] };

    // To add an element to parts array, we need to replace the whole maintenance item 
    // OR we can make 'increment' handle array pushes?
    // Current 'upsert' does a deep merge (Object.assign basically). Array replacement works if we send the full array.
    const newMaint = { ...maint, parts: [...maint.parts, safePart] };
    updates.deltas.push({ type: 'upsert', storeName: 'maintenance', items: [newMaint] });

    if (!safePart.inventoryId.startsWith('manual-')) {
      updates.deltas.push({ type: 'increment', storeName: 'inventory', items: [{ id: safePart.inventoryId, quantity: -safePart.quantity }] });
    }

    return { safePart, updates };
  }

  static removeMaintenancePart(
    state: StoreState,
    maintenanceId: string,
    partId: string
  ): { ok: boolean; updates: StoreUpdates } {
    const { maintenance } = state;
    const maint = maintenance.find(m => m.id === maintenanceId);
    const part = maint?.parts.find(p => p.id === partId);
    if (!maint || !part || maint.status === 'delivered' || maint.status === 'cancelled') {
      return { ok: false, updates: { deltas: [] } };
    }
    
    const updates: StoreUpdates = { deltas: [] };

    if (!part.inventoryId.startsWith('manual-')) {
      updates.deltas.push({ type: 'increment', storeName: 'inventory', items: [{ id: part.inventoryId, quantity: part.quantity }] });
    }

    const newMaint = { ...maint, parts: maint.parts.filter(p => p.id !== partId) };
    updates.deltas.push({ type: 'upsert', storeName: 'maintenance', items: [newMaint] });

    return { ok: true, updates };
  }

  static deliverMaintenance(
    state: StoreState,
    id: string,
    collectedAmount: number,
    safeId: string,
    currentUser: any
  ): { ok: true; updates: StoreUpdates } | { ok: false; error: string } {
    const { maintenance, safes } = state;
    const maint = maintenance.find(m => m.id === id);
    if (!maint) return { ok: false, error: 'تذكرة الصيانة غير موجودة' };
    if (maint.status === 'delivered') return { ok: false, error: 'التذكرة مسلّمة بالفعل' };
    if (maint.status === 'cancelled') return { ok: false, error: 'لا يمكن تسليم تذكرة ملغاة' };
    if (maint.status !== 'completed') {
      return { ok: false, error: 'لازم تحوّل التذكرة لحالة «مكتمل» قبل التسليم' };
    }
    const safe = safes.find(s => s.id === safeId);
    if (!safe) return { ok: false, error: 'اختر الخزنة اللي هيتحصّل فيها المبلغ' };
    if (!isFiniteNumber(collectedAmount) || collectedAmount < 0) {
      return { ok: false, error: 'المبلغ المحصّل غير صحيح' };
    }

    const partsCost = maint.parts.reduce((sum, p) => sum + (isFiniteNumber(p.total) && p.total >= 0 ? p.total : 0), 0);
    const additionalExpenses = roundMoney(
      isFiniteNumber(maint.additionalExpenses) && maint.additionalExpenses >= 0 ? maint.additionalExpenses : 0
    );
    const finalAmount = roundMoney(collectedAmount);
    const profit = roundMoney(finalAmount - partsCost - additionalExpenses);

    if (additionalExpenses > 0 && roundMoney(safe.balance + finalAmount) < additionalExpenses) {
      return { ok: false, error: `رصيد ${safe.name} لا يكفي لصرف المصاريف الإضافية (${additionalExpenses})` };
    }

    const now = new Date().toISOString();
    
    const updates: StoreUpdates = { deltas: [] };
    
    const updatedMaint: Maintenance = {
      ...maint,
      status: 'delivered', collectedAmount: finalAmount, finalCost: finalAmount,
      profit, deliveredAt: now, safeId
    };
    updates.deltas.push({ type: 'upsert', storeName: 'maintenance', items: [updatedMaint] });

    const safeDelta = roundMoney(finalAmount - additionalExpenses);
    if (safeDelta !== 0) {
      updates.deltas.push({ type: 'increment', storeName: 'safes', items: [{ id: safeId, balance: safeDelta }] });
    }

    const newTransactions: Transaction[] = [];
    if (finalAmount > 0) {
      newTransactions.push({
        id: uuidv4(),
        type: 'maintenance',
        amount: finalAmount,
        description: `إيراد صيانة - تذكرة ${maint.ticketNumber}`,
        referenceId: maint.id,
        safeId,
        userId: currentUser?.id || '',
        createdAt: now
      });
    }
    if (additionalExpenses > 0) {
      newTransactions.push({
        id: uuidv4(),
        type: 'maintenance',
        amount: -additionalExpenses,
        description: `مصروفات صيانة - تذكرة ${maint.ticketNumber}`,
        referenceId: maint.id,
        safeId,
        userId: currentUser?.id || '',
        createdAt: now
      });
    }
    
    if (newTransactions.length > 0) {
      updates.deltas.push({ type: 'upsert', storeName: 'transactions', items: newTransactions });
    }

    return { ok: true, updates };
  }
}
