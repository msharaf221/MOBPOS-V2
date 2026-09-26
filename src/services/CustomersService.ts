import { v4 as uuidv4 } from 'uuid';
import { StoreState } from '../hooks/store/types';
import { StoreUpdates } from './types';
import { validText, isFiniteNumber, roundMoney, MAX_TEXT_LENGTH } from '../hooks/store/helpers';
import { Customer, Transaction } from '../types';

export class CustomersService {
  static addCustomer(
    state: StoreState,
    customer: Omit<Customer, 'id' | 'createdAt' | 'balance'>
  ): { customer: Customer | null; updates: StoreUpdates } {
    const { customers } = state;
    const name = customer.name?.trim();
    const phone = customer.phone?.trim();
    if (!validText(name, 200) || !validText(phone, 50) || (customer.address || '').length > MAX_TEXT_LENGTH) {
      return { customer: null, updates: { deltas: [] } };
    }
    if (customers.some(c => c.phone.trim() === phone)) {
      return { customer: null, updates: { deltas: [] } };
    }
    
    const newCustomer: Customer = {
      name,
      phone,
      address: (customer.address || '').trim(),
      id: uuidv4(),
      balance: 0,
      createdAt: new Date().toISOString()
    };
    
    return {
      customer: newCustomer,
      updates: { deltas: [{ type: 'upsert', storeName: 'customers', items: [newCustomer] }] }
    };
  }

  static updateCustomer(
    state: StoreState,
    id: string,
    updates: Partial<Customer>
  ): { ok: boolean; updates: StoreUpdates } {
    const { customers } = state;
    const name = updates.name?.trim();
    const phone = updates.phone?.trim();
    if (updates.name !== undefined && !validText(name, 200)) return { ok: false, updates: { deltas: [] } };
    if (updates.phone !== undefined && !validText(phone, 50)) return { ok: false, updates: { deltas: [] } };
    if (updates.address !== undefined && updates.address.length > MAX_TEXT_LENGTH) return { ok: false, updates: { deltas: [] } };
    if (phone && customers.some(c => c.id !== id && c.phone.trim() === phone)) return { ok: false, updates: { deltas: [] } };

    const safeUpdates: Partial<Customer> = {
      ...(name !== undefined ? { name } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(updates.address !== undefined ? { address: updates.address.trim() } : {}),
    };
    
    const current = customers.find(c => c.id === id);
    if (!current) return { ok: false, updates: { deltas: [] } };

    return {
      ok: true,
      updates: { deltas: [{ type: 'upsert', storeName: 'customers', items: [{ ...current, ...safeUpdates }] }] }
    };
  }

  static deleteCustomer(
    state: StoreState,
    id: string
  ): { ok: boolean; error?: string; updates: StoreUpdates } {
    const { customers, sales, imeiUnits } = state;
    const customer = customers.find(c => c.id === id);
    if (!customer) return { ok: false, error: 'العميل غير موجود', updates: { deltas: [] } };
    if ((customer.balance || 0) !== 0 || sales.some(s => s.customerId === id) || imeiUnits.some(u => u.customerId === id)) {
      return { ok: false, error: 'لا يمكن حذف عميل له رصيد أو فواتير أو أجهزة مرتبطة؛ للحفاظ على السجل المالي', updates: { deltas: [] } };
    }
    
    return {
      ok: true,
      updates: { deltas: [{ type: 'delete', storeName: 'customers', items: [{ id }] }] }
    };
  }

  static recordCustomerPayment(
    state: StoreState,
    customerId: string,
    amount: number,
    safeId: string,
    notes: string,
    currentUser: any
  ): { transaction: Transaction | null; updates: StoreUpdates } {
    const { customers, safes } = state;
    const customer = customers.find(c => c.id === customerId);
    const safe = safes.find(s => s.id === safeId);
    if (!customer || !safe || !isFiniteNumber(amount) || amount <= 0 || amount > Math.max(0, customer.balance || 0)) {
      return { transaction: null, updates: { deltas: [] } };
    }
    const safeNotes = typeof notes === 'string' ? notes.slice(0, MAX_TEXT_LENGTH) : '';

    const transaction: Transaction = {
      id: uuidv4(),
      type: 'customer_payment',
      amount: roundMoney(amount),
      description: `دفعة من حساب العميل${safeNotes ? ` - ${safeNotes}` : ''}`,
      referenceId: customerId,
      safeId,
      userId: currentUser?.id || '',
      createdAt: new Date().toISOString()
    };

    const updates: StoreUpdates = { deltas: [] };
    updates.deltas.push({ type: 'increment', storeName: 'customers', items: [{ id: customerId, balance: -roundMoney(amount) }] });
    updates.deltas.push({ type: 'increment', storeName: 'safes', items: [{ id: safeId, balance: roundMoney(amount) }] });
    updates.deltas.push({ type: 'upsert', storeName: 'transactions', items: [transaction] });

    return { transaction, updates };
  }

  static recordWalletTransaction(
    state: StoreState,
    type: 'deposit' | 'withdrawal',
    amount: number,
    fee: number,
    cost: number,
    walletId: string,
    cashSafeId: string,
    notes: string,
    currentUser: any
  ): { transactions: Transaction[] | null; updates: StoreUpdates } {
    const { safes } = state;
    const wallet = safes.find(s => s.id === walletId);
    const cashSafe = safes.find(s => s.id === cashSafeId);
    if (!wallet || !cashSafe || !isFiniteNumber(amount) || amount <= 0 || !isFiniteNumber(fee) || fee < 0 ||
        fee > amount || !isFiniteNumber(cost) || cost < 0 || typeof notes !== 'string' || notes.length > MAX_TEXT_LENGTH) {
      return { transactions: null, updates: { deltas: [] } };
    }
    
    const walletOut = type === 'deposit' ? amount + cost : 0;
    const cashOut = type === 'withdrawal' ? amount - fee : 0;
    if ((type === 'deposit' && wallet.balance < walletOut) ||
        (type === 'withdrawal' && (wallet.balance < amount || cashSafe.balance < cashOut))) {
      return { transactions: null, updates: { deltas: [] } };
    }
    const profit = roundMoney(fee - cost);

    const updates: StoreUpdates = { deltas: [] };
    const safeIncrements: Record<string, number> = {};

    let walletInc = 0;
    let cashInc = 0;
    
    if (type === 'deposit') {
      walletInc = -(amount + cost);
      cashInc = (amount + fee);
    } else {
      walletInc = amount;
      cashInc = -(amount - fee);
    }

    if (walletId === cashSafeId) {
       updates.deltas.push({ type: 'increment', storeName: 'safes', items: [{ id: walletId, balance: roundMoney(walletInc + cashInc) }] });
    } else {
       updates.deltas.push({ type: 'increment', storeName: 'safes', items: [
         { id: walletId, balance: roundMoney(walletInc) },
         { id: cashSafeId, balance: roundMoney(cashInc) }
       ]});
    }

    const transactionId = uuidv4();
    const transactionsToAdd: Transaction[] = [];

    transactionsToAdd.push({
      id: transactionId,
      type: type === 'deposit' ? 'wallet_deposit' : 'wallet_withdrawal',
      amount,
      description: `عملية ${type === 'deposit' ? 'إيداع' : 'سحب'} محفظة${notes ? ` - ${notes}` : ''}`,
      referenceId: walletId,
      safeId: cashSafeId,
      userId: currentUser?.id || '',
      createdAt: new Date().toISOString()
    });

    if (profit > 0) {
      transactionsToAdd.push({
        id: uuidv4(),
        type: 'income',
        amount: profit,
        description: `أرباح عملية ${type === 'deposit' ? 'إيداع' : 'سحب'} محفظة`,
        referenceId: transactionId,
        safeId: cashSafeId,
        userId: currentUser?.id || '',
        createdAt: new Date().toISOString()
      });
    }
    
    updates.deltas.push({ type: 'upsert', storeName: 'transactions', items: transactionsToAdd });

    return { transactions: transactionsToAdd, updates };
  }
}
