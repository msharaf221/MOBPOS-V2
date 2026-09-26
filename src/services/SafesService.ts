import { v4 as uuidv4 } from 'uuid';
import { StoreState } from '../hooks/store/types';
import { StoreUpdates } from './types';
import { validText, isFiniteNumber, roundMoney } from '../hooks/store/helpers';
import { Safe, Transaction } from '../types';

export class SafesService {
  static transferBetweenSafes(
    state: StoreState,
    fromId: string,
    toId: string,
    amount: number,
    currentUser: any
  ): { ok: boolean; updates: StoreUpdates } {
    const { safes } = state;
    const from = safes.find(s => s.id === fromId);
    const to = safes.find(s => s.id === toId);
    if (!from || !to || fromId === toId || !isFiniteNumber(amount) || amount <= 0 || amount > from.balance) {
      return { ok: false, updates: { deltas: [] } };
    }
    
    const transferAmount = roundMoney(amount);
    const timestamp = new Date().toISOString();
    
    const updates: StoreUpdates = { deltas: [] };
    
    updates.deltas.push({
      type: 'increment',
      storeName: 'safes',
      items: [
        { id: fromId, balance: -transferAmount },
        { id: toId, balance: transferAmount }
      ]
    });
    
    const transactions: Transaction[] = [
      {
        id: uuidv4(),
        type: 'transfer',
        amount: -transferAmount,
        description: `تحويل إلى ${to.name}`,
        referenceId: toId,
        safeId: fromId,
        userId: currentUser?.id || '',
        createdAt: timestamp
      },
      {
        id: uuidv4(),
        type: 'transfer',
        amount: transferAmount,
        description: `تحويل من ${from.name}`,
        referenceId: fromId,
        safeId: toId,
        userId: currentUser?.id || '',
        createdAt: timestamp
      }
    ];
    
    updates.deltas.push({ type: 'upsert', storeName: 'transactions', items: transactions });
    
    return { ok: true, updates };
  }
}
