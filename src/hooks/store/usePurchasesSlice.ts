import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { PurchasesService } from '../../services/PurchasesService';
import { useStoreDispatcher } from './useStoreDispatcher';
import { validText, isFiniteNumber, isPositiveInteger, roundMoney, MAX_TEXT_LENGTH } from './helpers';
import { auditEvents } from '../../utils/auditLogger';
import { nextDocumentNumber } from '../../utils/sequence';
import { IMEIUnit, Purchase, PurchaseItem } from '../../types';

export function usePurchasesSlice(state: StoreState) {
    const dispatch = useStoreDispatcher(state);

    const { inventory, setInventory, imeiUnits, setImeiUnits, safes, setSafes, setTransactions, suppliers, setSuppliers, purchases, setPurchases, currentUser, addAuditLog } = state;

    const generatePurchaseNumber = useCallback(
      () => nextDocumentNumber(purchases.map(p => p.invoiceNumber), 'PUR', 4),
      [purchases]
    );
  

    const createPurchase = useCallback((data: {
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
    }): { ok: true; purchase: Purchase } | { ok: false; error: string } => {
      const supplier = suppliers.find(sup => sup.id === data.supplierId);
      if (!supplier) return { ok: false, error: 'المورد غير موجود' };
      if (!Array.isArray(data.items) || data.items.length === 0) return { ok: false, error: 'أضف صنف واحد على الأقل للفاتورة' };
      const notes = typeof data.notes === 'string' ? data.notes.slice(0, MAX_TEXT_LENGTH) : '';
  
      // ===== التحقق من البنود =====
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
        invoiceNumber: generatePurchaseNumber(),
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
  
      // ===== تطبيق الأثر على المخزون =====
      if (newUnits.length > 0) setImeiUnits(prev => [...prev, ...newUnits]);
  
      const costUpdates = new Map<string, number>();
      const quantityUpdates = new Map<string, number>();
      data.items.forEach(line => {
        const item = inventory.find(inv => inv.id === line.inventoryId);
        if (!item) return;
        // منتجات الـ IMEI كميتها محسوبة من الوحدات نفسها، فمش بنلمس quantity
        if (!item.hasIMEI) {
          quantityUpdates.set(line.inventoryId, (quantityUpdates.get(line.inventoryId) || 0) + line.quantity);
        }
        if (data.updateCostPrice) costUpdates.set(line.inventoryId, roundMoney(line.unitCost));
      });
  
      if (quantityUpdates.size > 0 || costUpdates.size > 0) {
        setInventory(prev => prev.map(item => {
          const addQty = quantityUpdates.get(item.id);
          const newCost = costUpdates.get(item.id);
          if (addQty === undefined && newCost === undefined) return item;
          return {
            ...item,
            quantity: addQty !== undefined ? item.quantity + addQty : item.quantity,
            costPrice: newCost !== undefined ? newCost : item.costPrice,
          };
        }));
      }
  
      // ===== النقدية + حساب المورد =====
      if (paid > 0 && safe) {
        setSafes(prev => prev.map(sf => sf.id === safe.id ? { ...sf, balance: roundMoney(sf.balance - paid) } : sf));
        setTransactions(prev => [...prev, {
          id: uuidv4(),
          type: 'purchase',
          amount: -paid,
          description: `فاتورة شراء ${purchase.invoiceNumber} - ${supplier.name}`,
          referenceId: purchase.id,
          safeId: safe.id,
          userId: currentUser?.id || '',
          createdAt: now,
        }]);
      }
  
      if (remaining > 0) {
        setSuppliers(prev => prev.map(sup => sup.id === supplier.id
          ? { ...sup, balance: roundMoney(sup.balance + remaining) }
          : sup));
      }
  
      setPurchases(prev => [...prev, purchase]);
      addAuditLog(auditEvents.purchaseCreated(currentUser, purchase.invoiceNumber, supplier.name, purchase.total, purchase.paid, safe?.name));
      return { ok: true, purchase };
    }, [currentUser, generatePurchaseNumber, imeiUnits, inventory, safes, setImeiUnits, setInventory,
        setPurchases, setSafes, setSuppliers, setTransactions, suppliers, addAuditLog]);
  

    
    const recordSupplierPayment = useCallback((
      supplierId: string,
      amount: number,
      safeId: string,
      notes = ''
    ) => {
      const res = PurchasesService.recordSupplierPayment(state, supplierId, amount, safeId, notes, currentUser);
      if (res.ok) {
        dispatch(res.updates);
      }
      return res;
    }, [state, dispatch, currentUser]);

  

  return { generatePurchaseNumber, createPurchase, recordSupplierPayment };
}
