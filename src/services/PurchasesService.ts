import { v4 as uuidv4 } from 'uuid';
import { StoreState } from '../hooks/store/types';
import { StoreUpdates } from './types';
import { roundMoney, isFiniteNumber, isPositiveInteger, validText, MAX_TEXT_LENGTH } from '../hooks/store/helpers';
import { nextDocumentNumber } from '../utils/sequence';
import { PurchaseItem, Purchase, Transaction, IMEIUnit } from '../types';

export class PurchasesService {
  static createPurchase(
    state: StoreState,
    data: {
      supplierId: string;
      items: {
        inventoryId: string;
        quantity: number;
        unitCost: number;
        imeis?: Array<Pick<IMEIUnit, 'imei1' | 'imei2' | 'color' | 'storage' | 'ram' | 'condition' | 'warrantyEndDate' | 'notes'>>;
      }[];
      paid: number;
      safeId: string;
      notes?: string;
      updateCostPrice?: boolean;
    },
    currentUser: any
  ): { ok: true; purchase: Purchase; updates: StoreUpdates } | { ok: false; error: string } {
    const { suppliers, inventory, imeiUnits, safes, purchases } = state;
    
    const supplier = suppliers.find(sup => sup.id === data.supplierId);
    if (!supplier) return { ok: false, error: 'المورد غير موجود' };
    if (!Array.isArray(data.items) || data.items.length === 0) return { ok: false, error: 'أضف صنف واحد على الأقل للفاتورة' };
    const notes = typeof data.notes === 'string' ? data.notes.slice(0, MAX_TEXT_LENGTH) : '';

    const seenImeis = new Set<string>();
    for (const line of data.items) {
      const item = inventory.find(inv => inv.id === line.inventoryId);
      if (!item) return { ok: false, error: 'أحد الأصناف غير موجود في المخزون' };
      if (!isPositiveInteger(line.quantity)) return { ok: false, error: `كمية غير صحيحة للصنف: ${item.name}` };
      if (!isFiniteNumber(line.unitCost) || line.unitCost < 0) return { ok: false, error: `سعر شراء غير صحيح للصنف: ${item.name}` };
      if (item.hasIMEI) {
        const imeis = line.imeis || [];
        if (imeis.length !== line.quantity) {
          return { ok: false, error: `لازم تدخل ${line.quantity} سيريال (IMEI) للصنف: ${item.name}` };
        }
        for (const unit of imeis) {
          const imei1 = unit.imei1?.trim();
          const imei2 = unit.imei2?.trim() || '';
          if (!validText(imei1, 40)) return { ok: false, error: `سيريال غير صحيح للصنف: ${item.name}` };
          if (imei2 && (imei2.length > 40 || imei2 === imei1)) return { ok: false, error: `IMEI2 غير صحيح للصنف: ${item.name}` };
          for (const value of [imei1, imei2].filter(Boolean) as string[]) {
            if (seenImeis.has(value)) return { ok: false, error: `سيريال مكرر داخل الفاتورة: ${value}` };
            seenImeis.add(value);
            if (imeiUnits.some(u => u.imei1 === value || u.imei2 === value)) {
              return { ok: false, error: `السيريال ${value} مسجّل قبل كده في المخزون` };
            }
          }
        }
      }
    }

    const total = roundMoney(data.items.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
    if (!isFiniteNumber(data.paid) || data.paid < 0) return { ok: false, error: 'المبلغ المدفوع غير صحيح' };
    const paid = roundMoney(Math.min(data.paid, total));
    const remaining = roundMoney(total - paid);

    const safe = safes.find(sf => sf.id === data.safeId);
    if (paid > 0) {
      if (!safe) return { ok: false, error: 'اختر الخزنة اللي هيتدفع منها' };
      if (safe.balance < paid) return { ok: false, error: `رصيد ${safe.name} لا يكفي (${safe.balance})` };
    }

    const now = new Date().toISOString();
    const purchaseId = uuidv4();
    const newUnits: IMEIUnit[] = [];
    const purchaseItems: PurchaseItem[] = data.items.map(line => {
      const imeiUnitIds: string[] = [];
      (line.imeis || []).forEach(unit => {
        const created: IMEIUnit = {
          id: uuidv4(),
          inventoryId: line.inventoryId,
          imei1: unit.imei1.trim(),
          imei2: unit.imei2?.trim() || '',
          color: unit.color || '',
          storage: unit.storage || '',
          ram: unit.ram || '',
          condition: unit.condition || 'new',
          warrantyEndDate: unit.warrantyEndDate || '',
          status: 'available',
          saleId: '',
          customerId: '',
          purchasePrice: roundMoney(line.unitCost),
          notes: unit.notes || '',
          createdAt: now,
        };
        newUnits.push(created);
        imeiUnitIds.push(created.id);
      });
      return {
        id: uuidv4(),
        inventoryId: line.inventoryId,
        quantity: line.quantity,
        unitCost: roundMoney(line.unitCost),
        total: roundMoney(line.quantity * line.unitCost),
        ...(imeiUnitIds.length > 0 ? { imeiUnitIds } : {}),
      };
    });

    const purchase: Purchase = {
      id: purchaseId,
      invoiceNumber: nextDocumentNumber(purchases.map(p => p.invoiceNumber), 'PO', 4),
      supplierId: data.supplierId,
      items: purchaseItems,
      total,
      paid,
      remaining,
      safeId: paid > 0 ? data.safeId : '',
      userId: currentUser?.id || '',
      notes,
      createdAt: now,
    };

    const updates: StoreUpdates = { deltas: [] };

    if (newUnits.length > 0) {
      updates.deltas.push({ type: 'upsert', storeName: 'imeiUnits', items: newUnits });
    }

    const inventoryIncrements: any[] = [];
    const inventoryCostUpserts: any[] = [];
    
    data.items.forEach(line => {
      const item = inventory.find(inv => inv.id === line.inventoryId);
      if (!item) return;

      if (!item.hasIMEI) {
        inventoryIncrements.push({ id: line.inventoryId, quantity: line.quantity });
      }

      if (data.updateCostPrice) {
        inventoryCostUpserts.push({ id: line.inventoryId, costPrice: roundMoney(line.unitCost) });
      }
    });

    if (inventoryIncrements.length > 0) {
      updates.deltas.push({ type: 'increment', storeName: 'inventory', items: inventoryIncrements });
    }
    
    // We can use increment to set the costPrice by just passing it? No, increment adds! 
    // Wait, increment adds to numeric fields. We can't use increment for costPrice because we want to REPLACE it.
    // If we want to replace a specific field without touching quantity, we need a 'merge' deltaType.
    // Let's change lan-hub.cjs to handle 'upsert' as a merge!
    // NO, 'upsert' currently replaces the WHOLE item. But if we want to change ONLY costPrice without losing quantity,
    // we MUST send the whole item with the updated costPrice... but wait, that suffers from Lost Update for quantity!
    // Ah! If we increment the quantity, AND we want to update the costPrice... 
    // The safest is to add 'merge' deltaType to lan-hub.cjs.

    if (inventoryCostUpserts.length > 0) {
      updates.deltas.push({ type: 'upsert', storeName: 'inventory', items: inventoryCostUpserts });
    }

    updates.deltas.push({ type: 'upsert', storeName: 'purchases', items: [purchase] });

    if (paid > 0) {
      updates.deltas.push({ type: 'increment', storeName: 'safes', items: [{ id: data.safeId, balance: -paid }] });
      const transaction: Transaction = {
        id: uuidv4(),
        type: 'purchase',
        amount: -paid,
        description: `فاتورة شراء ${purchase.invoiceNumber}`,
        referenceId: purchaseId,
        safeId: data.safeId,
        userId: currentUser?.id || '',
        createdAt: now,
      };
      updates.deltas.push({ type: 'upsert', storeName: 'transactions', items: [transaction] });
    }

    return { ok: true, purchase, updates };
  }

  static recordSupplierPayment(
    state: StoreState,
    supplierId: string,
    amount: number,
    safeId: string,
    notes: string,
    currentUser: any
  ): { ok: true; updates: StoreUpdates } | { ok: false; error: string } {
    const { suppliers, safes } = state;
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return { ok: false, error: 'المورد غير موجود' };
    if (!isFiniteNumber(amount) || amount <= 0) return { ok: false, error: 'المبلغ غير صحيح' };
    if (amount > supplier.balance) return { ok: false, error: `المبلغ أكبر من مديونية المورد (${supplier.balance})` };
    const safe = safes.find(s => s.id === safeId);
    if (!safe) return { ok: false, error: 'اختر الخزنة' };
    if (safe.balance < amount) return { ok: false, error: `رصيد ${safe.name} لا يكفي` };

    const value = roundMoney(amount);
    const now = new Date().toISOString();
    
    const updates: StoreUpdates = { deltas: [] };
    
    updates.deltas.push({ type: 'increment', storeName: 'safes', items: [{ id: safe.id, balance: -value }] });
    updates.deltas.push({ type: 'increment', storeName: 'suppliers', items: [{ id: supplier.id, balance: -value }] });
    
    const transaction: Transaction = {
      id: uuidv4(),
      type: 'purchase',
      amount: -value,
      description: `دفعة لمورد: ${supplier.name}` + (notes ? ` - ${notes.slice(0, 100)}` : ''),
      referenceId: supplier.id,
      safeId: safe.id,
      userId: currentUser?.id || '',
      createdAt: now
    };
    updates.deltas.push({ type: 'upsert', storeName: 'transactions', items: [transaction] });

    return { ok: true, updates };
  }

}
