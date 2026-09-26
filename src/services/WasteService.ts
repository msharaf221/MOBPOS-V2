import { v4 as uuidv4 } from 'uuid';
import { StoreState } from '../hooks/store/types';
import { StoreUpdates } from './types';
import { isPositiveInteger, MAX_TEXT_LENGTH } from '../hooks/store/helpers';
import { isSellableUnit } from '../utils/stockCounts';
import { IMEIUnit, StockWaste, Transaction } from '../types';

export class WasteService {
  static recordStockWaste(
    state: StoreState,
    inventoryId: string,
    quantity: number,
    supplierId: string,
    reason: string,
    notes: string,
    currentUser: any
  ): { wasteRecord: StockWaste | null; updates: StoreUpdates } {
    const { inventory, imeiUnits, suppliers } = state;
    const item = inventory.find(inv => inv.id === inventoryId);
    if (!item || !isPositiveInteger(quantity) || quantity > (item.hasIMEI ? imeiUnits.filter(u => u.inventoryId === inventoryId && isSellableUnit(u)).length : item.quantity) ||
        typeof supplierId !== 'string' || typeof reason !== 'string' || reason.length > MAX_TEXT_LENGTH ||
        typeof notes !== 'string' || notes.length > MAX_TEXT_LENGTH ||
        (supplierId && !suppliers.some(s => s.id === supplierId))) {
      return { wasteRecord: null, updates: { deltas: [] } };
    }
    
    const updates: StoreUpdates = { deltas: [] };

    if (item.hasIMEI) {
      const availableUnits = imeiUnits
        .filter(unit => unit.inventoryId === inventoryId && isSellableUnit(unit))
        .slice(0, quantity);

      if (availableUnits.length !== quantity) return { wasteRecord: null, updates: { deltas: [] } };

      const imeiUpdates: IMEIUnit[] = [];
      availableUnits.forEach(unit => {
        imeiUpdates.push({
          ...unit,
          status: 'wasted',
          saleId: '',
          customerId: '',
          notes: notes || unit.notes,
        });
      });
      
      updates.deltas.push({ type: 'upsert', storeName: 'imeiUnits', items: imeiUpdates });
    } else {
      if (item.quantity < quantity) return { wasteRecord: null, updates: { deltas: [] } };
      
      updates.deltas.push({ type: 'increment', storeName: 'inventory', items: [{ id: inventoryId, quantity: -quantity }] });
    }

    const totalCost = item.costPrice * quantity;
    const now = new Date().toISOString();
    const wasteRecord: StockWaste = {
      id: uuidv4(),
      inventoryId,
      supplierId,
      quantity,
      unitCost: item.costPrice,
      totalCost,
      reason,
      notes,
      createdAt: now,
      userId: currentUser?.id || ''
    };
    
    updates.deltas.push({ type: 'upsert', storeName: 'stockWastes', items: [wasteRecord] });

    if (totalCost > 0) {
      const transaction: Transaction = {
        id: uuidv4(),
        type: 'waste',
        amount: -totalCost,
        description: `هالك: ${item.name} ×${quantity}`,
        referenceId: wasteRecord.id,
        safeId: '',
        userId: currentUser?.id || '',
        createdAt: now
      };
      updates.deltas.push({ type: 'upsert', storeName: 'transactions', items: [transaction] });
    }

    return { wasteRecord, updates };
  }
}
