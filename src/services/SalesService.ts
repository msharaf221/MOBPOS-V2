import { v4 as uuidv4 } from 'uuid';
import { StoreState } from '../hooks/store/types';
import { StoreUpdates } from './types';
import { roundMoney, isFiniteNumber, isPositiveInteger, MAX_TEXT_LENGTH } from '../hooks/store/helpers';
import { nextDocumentNumber } from '../utils/sequence';
import { isSellableUnit } from '../utils/stockCounts';
import { SaleItem, Sale, Transaction, IMEIUnit, SaleReturn } from '../types';

export class SalesService {
  static createSale(
    state: StoreState,
    customerId: string,
    items: Omit<SaleItem, 'id' | 'returnedQuantity'>[],
    discount: number,
    paidAmount: number,
    paymentMethod: 'cash' | 'card' | 'installment',
    safeId: string,
    notes: string,
    currentUser: any
  ): { sale: Sale | null; updates: StoreUpdates } {
    const { customers, inventory, imeiUnits, sales, safes } = state;

    if (!Array.isArray(items) || items.length === 0 || !isFiniteNumber(discount) || discount < 0 ||
        !isFiniteNumber(paidAmount) || paidAmount < 0 || !['cash', 'card', 'installment'].includes(paymentMethod)) {
      return { sale: null, updates: { deltas: [] } };
    }

    const customer = customerId ? customers.find(c => c.id === customerId) : undefined;
    const safe = safes.find(s => s.id === safeId);
    if ((customerId && !customer) || !safe || typeof notes !== 'string' || notes.length > MAX_TEXT_LENGTH) {
      return { sale: null, updates: { deltas: [] } };
    }

    const quantitiesToDeduct: Record<string, number> = {};
    const usedIMEI = new Set<string>();
    const saleItems: SaleItem[] = [];

    for (const item of items) {
      const inventoryItem = inventory.find(inv => inv.id === item.inventoryId);
      if (!inventoryItem || !isPositiveInteger(item.quantity) || !isFiniteNumber(item.unitPrice) || item.unitPrice < 0) {
        return { sale: null, updates: { deltas: [] } };
      }

      if (item.imeiUnitId) {
        const unit = imeiUnits.find(u => u.id === item.imeiUnitId);
        if (!inventoryItem.hasIMEI || item.quantity !== 1 || !unit || unit.inventoryId !== inventoryItem.id ||
            !isSellableUnit(unit) || usedIMEI.has(unit.id)) {
          return { sale: null, updates: { deltas: [] } };
        }
        usedIMEI.add(unit.id);
      } else {
        if (inventoryItem.hasIMEI) return { sale: null, updates: { deltas: [] } };
        quantitiesToDeduct[inventoryItem.id] = (quantitiesToDeduct[inventoryItem.id] || 0) + item.quantity;
      }

      const costPrice = item.imeiUnitId
        ? imeiUnits.find(u => u.id === item.imeiUnitId)?.purchasePrice || 0
        : inventoryItem.costPrice;
      const total = roundMoney(item.unitPrice * item.quantity);
      if (!isFiniteNumber(costPrice) || costPrice < 0 || !isFiniteNumber(total)) return { sale: null, updates: { deltas: [] } };
      
      saleItems.push({
        id: uuidv4(),
        inventoryId: inventoryItem.id,
        imeiUnitId: item.imeiUnitId,
        quantity: item.quantity,
        unitPrice: roundMoney(item.unitPrice),
        costPrice: roundMoney(costPrice),
        total,
        returnedQuantity: 0,
      });
    }

    for (const [inventoryId, quantity] of Object.entries(quantitiesToDeduct)) {
      const item = inventory.find(inv => inv.id === inventoryId);
      if (!item || quantity > item.quantity) return { sale: null, updates: { deltas: [] } };
    }

    const subtotal = roundMoney(saleItems.reduce((sum, item) => sum + item.total, 0));
    if (discount > subtotal) return { sale: null, updates: { deltas: [] } };
    const total = roundMoney(subtotal - discount);
    if (paidAmount > total) return { sale: null, updates: { deltas: [] } };
    const remaining = roundMoney(total - paidAmount);
    if (remaining > 0 && !customer) return { sale: null, updates: { deltas: [] } };
    const profit = roundMoney(saleItems.reduce((sum, item) => sum + (item.total - item.costPrice * item.quantity), 0) - discount);

    const newSale: Sale = {
      id: uuidv4(),
      invoiceNumber: nextDocumentNumber(sales.map(s => s.invoiceNumber), 'INV', 4),
      customerId,
      items: saleItems,
      subtotal,
      discount: roundMoney(discount),
      total,
      paid: roundMoney(paidAmount),
      remaining,
      profit,
      paymentMethod,
      cashierId: currentUser?.id || '',
      safeId,
      notes: notes.slice(0, MAX_TEXT_LENGTH),
      createdAt: new Date().toISOString()
    };

    const updates: StoreUpdates = { deltas: [] };

    // 1. IMEI Units updates (upsert)
    const imeiUpdates: IMEIUnit[] = [];
    saleItems.forEach(item => {
      if (item.imeiUnitId) {
        const u = imeiUnits.find(u => u.id === item.imeiUnitId);
        if (u) {
          imeiUpdates.push({ ...u, status: 'sold', saleId: newSale.id, customerId });
        }
      }
    });
    if (imeiUpdates.length > 0) {
      updates.deltas.push({ type: 'upsert', storeName: 'imeiUnits', items: imeiUpdates });
    }

    // 2. Inventory increments (negative deltas to deduct stock!) -> SOLVES LOST UPDATES
    const invIncrements = Object.entries(quantitiesToDeduct).map(([id, qty]) => ({
      id,
      quantity: -qty
    }));
    if (invIncrements.length > 0) {
      updates.deltas.push({ type: 'increment', storeName: 'inventory', items: invIncrements });
    }

    // 3. Safe increment
    updates.deltas.push({
      type: 'increment',
      storeName: 'safes',
      items: [{ id: safeId, balance: roundMoney(paidAmount) }]
    });

    // 4. Customer balance increment
    if (remaining > 0 && customerId) {
      updates.deltas.push({
        type: 'increment',
        storeName: 'customers',
        items: [{ id: customerId, balance: remaining }]
      });
    }

    // 5. Transaction upsert
    if (paidAmount > 0) {
      const transaction: Transaction = {
        id: uuidv4(), type: 'sale', amount: roundMoney(paidAmount),
        description: `فاتورة بيع ${newSale.invoiceNumber}`,
        referenceId: newSale.id, safeId, userId: currentUser?.id || '',
        createdAt: newSale.createdAt
      };
      updates.deltas.push({ type: 'upsert', storeName: 'transactions', items: [transaction] });
    }

    // 6. Sales upsert
    updates.deltas.push({ type: 'upsert', storeName: 'sales', items: [newSale] });

    return { sale: newSale, updates };
  }

  static processSaleReturn(
    state: StoreState,
    saleId: string,
    saleItemId: string,
    quantity: number,
    reason: string,
    currentUser: any
  ): { returnRecord: SaleReturn | null; updates: StoreUpdates } {
    const { sales, saleReturns, safes, imeiUnits } = state;

    const sale = sales.find(s => s.id === saleId);
    const saleItem = sale?.items.find(item => item.id === saleItemId);
    if (!sale || !saleItem || !isPositiveInteger(quantity) || typeof reason !== 'string' || reason.length > MAX_TEXT_LENGTH ||
        !isFiniteNumber(sale.total) || sale.total < 0 || !isFiniteNumber(sale.subtotal) || sale.subtotal < 0 ||
        !isFiniteNumber(sale.discount) || sale.discount < 0 || !isFiniteNumber(sale.paid) || sale.paid < 0 ||
        !isFiniteNumber(saleItem.total) || saleItem.total < 0 || !isPositiveInteger(saleItem.quantity)) {
      return { returnRecord: null, updates: { deltas: [] } };
    }

    const previousReturns = saleReturns.filter(r => r.saleId === saleId && r.saleItemId === saleItemId);
    const alreadyReturned = Math.max(
      previousReturns.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0),
      Number(saleItem.returnedQuantity) || 0
    );
    if (!Number.isInteger(alreadyReturned) || alreadyReturned < 0 || alreadyReturned > saleItem.quantity) {
      return { returnRecord: null, updates: { deltas: [] } };
    }
    const returnableQuantity = saleItem.quantity - alreadyReturned;
    if (quantity > returnableQuantity) {
      return { returnRecord: null, updates: { deltas: [] } };
    }
    if (saleItem.imeiUnitId && quantity !== 1) {
      return { returnRecord: null, updates: { deltas: [] } };
    }

    const grossRefund = roundMoney((saleItem.total / saleItem.quantity) * quantity);
    const discountShare = sale.subtotal > 0 ? roundMoney(sale.discount * grossRefund / sale.subtotal) : 0;
    const netValue = roundMoney(Math.max(0, grossRefund - discountShare));

    const paidRatio = sale.total > 0 ? Math.min(1, Math.max(0, sale.paid / sale.total)) : 0;
    const cashAlreadyRefunded = previousReturns
      .filter(r => r.netValue !== undefined)
      .reduce((sum, r) => sum + (Number(r.refundAmount) || 0), 0);
    const cashRefundCap = roundMoney(Math.max(0, sale.paid - cashAlreadyRefunded));
    const cashRefund = roundMoney(Math.min(netValue * paidRatio, cashRefundCap));
    const debtForgiven = roundMoney(Math.max(0, netValue - cashRefund));
    const costValue = roundMoney((Number(saleItem.costPrice) || 0) * quantity);

    if (cashRefund > 0 && !safes.some(s => s.id === sale.safeId)) {
      return { returnRecord: null, updates: { deltas: [] } };
    }

    const now = new Date().toISOString();
    const returnRecord = {
      id: uuidv4(), saleId, saleItemId, inventoryId: saleItem.inventoryId,
      imeiUnitId: saleItem.imeiUnitId, quantity, refundAmount: cashRefund,
      reason: reason.trim(), createdAt: now, processedBy: currentUser?.id || '',
      netValue, debtForgiven, costValue, profitImpact: roundMoney(netValue - costValue)
    };

    const updates: StoreUpdates = { deltas: [] };
    
    // 1. Upsert saleReturns
    updates.deltas.push({ type: 'upsert', storeName: 'saleReturns', items: [returnRecord] });

    // 2. Inventory / IMEI
    if (saleItem.imeiUnitId) {
      const u = imeiUnits.find(u => u.id === saleItem.imeiUnitId);
      if (u) {
        updates.deltas.push({ type: 'upsert', storeName: 'imeiUnits', items: [{ ...u, status: 'returned', saleId: '', customerId: '' }] });
      }
    } else {
      updates.deltas.push({ type: 'increment', storeName: 'inventory', items: [{ id: saleItem.inventoryId, quantity }] });
    }

    // 3. Safes & Transactions
    if (cashRefund > 0) {
      updates.deltas.push({ type: 'increment', storeName: 'safes', items: [{ id: sale.safeId, balance: -cashRefund }] });
      updates.deltas.push({
        type: 'upsert',
        storeName: 'transactions',
        items: [{
          id: uuidv4(), type: 'return', amount: -cashRefund,
          description: `مرتجع ${sale.invoiceNumber}`, referenceId: returnRecord.id,
          safeId: sale.safeId, userId: currentUser?.id || '', createdAt: now
        }]
      });
    }

    // 4. Customers
    if (debtForgiven > 0 && sale.customerId) {
      updates.deltas.push({ type: 'increment', storeName: 'customers', items: [{ id: sale.customerId, balance: -debtForgiven }] });
    }

    return { returnRecord, updates };
  }

}
