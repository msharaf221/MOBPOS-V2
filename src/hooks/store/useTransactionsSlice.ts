import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { StoreUpdates } from '../../services/types';
import { useStoreDispatcher } from './useStoreDispatcher';
import { validText, isFiniteNumber, roundMoney, MAX_TEXT_LENGTH } from './helpers';
import { Transaction } from '../../types';

export function useTransactionsSlice(state: StoreState) {
    const { safes, transactions, currentUser } = state;
    const dispatch = useStoreDispatcher(state);

    
    const addTransaction = useCallback((
      type: 'income' | 'expense',
      amount: number,
      description: string,
      safeId: string
    ) => {
      if (!safes.some(s => s.id === safeId) || !isFiniteNumber(amount) || amount <= 0 || !validText(description, MAX_TEXT_LENGTH)) return null;
      const finalAmount = roundMoney(type === 'expense' ? -amount : amount);
      
      const transaction: Transaction = {
        id: uuidv4(),
        type,
        amount: finalAmount,
        description,
        referenceId: '',
        safeId,
        userId: currentUser?.id || '',
        createdAt: new Date().toISOString()
      };
      
      const updates: StoreUpdates = { deltas: [] };
      updates.deltas.push({ type: 'increment', storeName: 'safes', items: [{ id: safeId, balance: finalAmount }] });
      updates.deltas.push({ type: 'upsert', storeName: 'transactions', items: [transaction] });
      
      dispatch(updates);
  
      return transaction;
    }, [currentUser, safes, dispatch]);

  

    
    const deleteTransaction = useCallback((id: string): { ok: boolean; error?: string } => {
      const trans = transactions.find(t => t.id === id);
      if (!trans) return { ok: false, error: 'الحركة غير موجودة' };
      if (trans.type !== 'income' && trans.type !== 'expense') {
        return { ok: false, error: 'لا يمكن حذف حركة ناتجة عن عملية (بيع/شراء/صيانة/مرتجع) — سجّل عملية عكسية بدلاً من الحذف' };
      }
      
      const updates: StoreUpdates = { deltas: [] };
      updates.deltas.push({ type: 'increment', storeName: 'safes', items: [{ id: trans.safeId, balance: -trans.amount }] });
      updates.deltas.push({ type: 'delete', storeName: 'transactions', items: [{ id }] });
      
      dispatch(updates);
      
      return { ok: true };
    }, [transactions, dispatch]);

  

  return { addTransaction, deleteTransaction };
}
