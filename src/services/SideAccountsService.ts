import { v4 as uuidv4 } from 'uuid';
import { StoreState } from '../hooks/store/types';
import { StoreUpdates } from './types';
import { validText, isFiniteNumber, roundMoney, MAX_TEXT_LENGTH } from '../hooks/store/helpers';
import { planSettlementReversal, settledThroughSafes } from '../utils/sideAccounts';
import { SideAccountEntryType, SideAccountImpact, Safe, Transaction, SideAccountEntry } from '../types';

export class SideAccountsService {
  static addSideAccountEntry(
    state: StoreState,
    input: {
      partyName: string;
      type: SideAccountEntryType;
      impact: SideAccountImpact;
      amount: number;
      paidAmount: number;
      description: string;
      notes: string;
      safeId: string;
      dueDate: string;
      newSafeName?: string;
    },
    currentUser: any
  ): { entry: SideAccountEntry | null; updates: StoreUpdates } {
    const { safes } = state;
    
    const sideTypes: SideAccountEntryType[] = ['receivable', 'payable', 'incoming', 'outgoing'];
    const impacts: SideAccountImpact[] = ['none', 'main_safe', 'capital', 'separate_safe'];
    const amount = input.amount;
    const paidAmount = input.paidAmount;
    if (!validText(input.partyName, 200) || !sideTypes.includes(input.type) || !impacts.includes(input.impact) ||
        !isFiniteNumber(amount) || amount <= 0 || !isFiniteNumber(paidAmount) || paidAmount < 0 || paidAmount > amount ||
        typeof input.description !== 'string' || input.description.length > MAX_TEXT_LENGTH ||
        typeof input.notes !== 'string' || input.notes.length > MAX_TEXT_LENGTH ||
        typeof input.dueDate !== 'string' || input.dueDate.length > 30 ||
        (input.newSafeName !== undefined && input.newSafeName.length > 200)) {
      return { entry: null, updates: { deltas: [] } };
    }

    let safeId = input.safeId;
    let createdSafe: Safe | null = null;
    const newName = input.newSafeName?.trim();
    if (input.impact === 'separate_safe' && newName) {
      const existingSafe = safes.find(s => s.name.trim().toLowerCase() === newName.toLowerCase());
      if (existingSafe) {
        safeId = existingSafe.id;
      } else {
        createdSafe = {
          id: uuidv4(),
          name: newName,
          balance: 0,
          isDefault: false,
          type: 'cash'
        };
        safeId = createdSafe.id;
      }
    }
    const cashMovement = input.type === 'incoming' || input.type === 'outgoing';
    if (cashMovement && input.impact !== 'none' && !createdSafe &&
        (!safeId || !safes.some(s => s.id === safeId))) {
      if (input.impact === 'separate_safe') return { entry: null, updates: { deltas: [] } };
      safeId = safes.find(s => s.isDefault)?.id || safes[0]?.id || '';
      if (!safeId) return { entry: null, updates: { deltas: [] } };
    }
    
    let safeDelta = 0;
    let transactionId = '';
    const nowIso = new Date().toISOString();
    
    const updates: StoreUpdates = { deltas: [] };

    if (createdSafe) {
      updates.deltas.push({ type: 'upsert', storeName: 'safes', items: [createdSafe] });
    }

    if (cashMovement && input.impact !== 'none') {
      safeDelta = input.type === 'incoming' ? amount : -amount;
      if (!safeId) {
        safeId = safes.find(s => s.isDefault)?.id || safes[0]?.id || '';
      }

      if (safeId) {
        updates.deltas.push({ type: 'increment', storeName: 'safes', items: [{ id: safeId, balance: safeDelta }] });
      }

      transactionId = uuidv4();
      const transaction: Transaction = {
        id: transactionId,
        type: input.impact === 'capital' ? 'capital' : 'side_account',
        amount: safeDelta,
        description: `${input.impact === 'capital' ? 'رأس مال' : 'حساب جانبي'} - ${input.description || input.partyName}`,
        referenceId: '',
        safeId,
        userId: currentUser?.id || '',
        createdAt: nowIso
      };
      updates.deltas.push({ type: 'upsert', storeName: 'transactions', items: [transaction] });
    }

    const safePaidAmount = roundMoney(paidAmount);
    const remaining = Math.max(0, roundMoney(amount - safePaidAmount));
    const newEntry: SideAccountEntry = {
      id: uuidv4(),
      partyName: input.partyName.trim(),
      type: input.type,
      impact: input.impact,
      amount: roundMoney(amount),
      paidAmount: safePaidAmount,
      status: input.type === 'receivable' || input.type === 'payable'
        ? (remaining <= 0 ? 'settled' : remaining < amount ? 'partial' : 'open')
        : 'settled',
      description: input.description,
      notes: input.notes,
      safeId,
      safeDelta,
      transactionId,
      userId: currentUser?.id || '',
      createdAt: nowIso,
      dueDate: input.dueDate
    };

    updates.deltas.push({ type: 'upsert', storeName: 'sideAccountEntries', items: [newEntry] });

    return { entry: newEntry, updates };
  }

  static updateSideAccountEntry(
    state: StoreState,
    id: string,
    updates: Partial<Pick<SideAccountEntry, 'paidAmount' | 'status' | 'notes' | 'dueDate'>> & { safeId?: string },
    currentUser: any
  ): { entry: SideAccountEntry | null; storeUpdates: StoreUpdates } {
    const { safes, sideAccountEntries, transactions } = state;
    const entry = sideAccountEntries.find(e => e.id === id);
    if (!entry) return { entry: null, storeUpdates: { deltas: [] } };

    if (updates.notes !== undefined && (typeof updates.notes !== 'string' || updates.notes.length > MAX_TEXT_LENGTH)) {
      return { entry: null, storeUpdates: { deltas: [] } };
    }
    if (updates.dueDate !== undefined && (typeof updates.dueDate !== 'string' || updates.dueDate.length > 30)) {
      return { entry: null, storeUpdates: { deltas: [] } };
    }
    
    const requestedSafeId = updates.safeId && safes.some(s => s.id === updates.safeId) ? updates.safeId : undefined;

    let paidAmount = entry.paidAmount;
    let lastSettlementSafeId = entry.safeId;
    
    const storeUpdates: StoreUpdates = { deltas: [] };
    
    if (updates.paidAmount !== undefined) {
      if (!isFiniteNumber(updates.paidAmount) || updates.paidAmount < 0 || updates.paidAmount > entry.amount) {
        return { entry: null, storeUpdates: { deltas: [] } };
      }
      paidAmount = roundMoney(updates.paidAmount);
      const delta = roundMoney(paidAmount - entry.paidAmount);

      if (delta !== 0 && (entry.type === 'receivable' || entry.type === 'payable')) {
        const settlementTransactions = transactions.filter(t => t.referenceId === entry.id && t.safeId);
        const settledTotal = settledThroughSafes(settlementTransactions);
        const nowIso = new Date().toISOString();

        if (delta > 0) {
          const fallbackSafeId = entry.safeId && safes.some(s => s.id === entry.safeId)
            ? entry.safeId
            : safes.find(s => s.isDefault)?.id || safes[0]?.id || '';
          const targetSafeId = requestedSafeId || fallbackSafeId;
          if (!targetSafeId) return { entry: null, storeUpdates: { deltas: [] } };
          
          const safeDelta = entry.type === 'receivable' ? delta : -delta;
          
          storeUpdates.deltas.push({ type: 'increment', storeName: 'safes', items: [{ id: targetSafeId, balance: safeDelta }] });
          
          storeUpdates.deltas.push({
            type: 'upsert',
            storeName: 'transactions',
            items: [{
              id: uuidv4(),
              type: 'side_account',
              amount: safeDelta,
              description: `${entry.type === 'receivable' ? 'تحصيل' : 'سداد'} حساب جانبي - ${entry.partyName}`,
              referenceId: entry.id,
              safeId: targetSafeId,
              userId: currentUser?.id || '',
              createdAt: nowIso
            }]
          });
          lastSettlementSafeId = targetSafeId;
        } else {
          const direction = entry.type === 'receivable' ? 1 : -1;
          const reversible = direction === 1 ? Math.max(0, settledTotal) : Math.max(0, -settledTotal);
          const toReverse = roundMoney(Math.min(-delta, reversible));
          const reversalOps = planSettlementReversal(settlementTransactions, toReverse, direction);
          
          const newTransactions: Transaction[] = [];
          const safeIncrements: Record<string, number> = {};
          
          reversalOps.forEach(op => {
            safeIncrements[op.safeId] = (safeIncrements[op.safeId] || 0) + op.amount;
            newTransactions.push({
              id: uuidv4(),
              type: 'side_account',
              amount: op.amount,
              description: `${entry.type === 'receivable' ? 'تعديل تحصيل' : 'تعديل سداد'} حساب جانبي - ${entry.partyName}`,
              referenceId: entry.id,
              safeId: op.safeId,
              userId: currentUser?.id || '',
              createdAt: nowIso
            });
          });
          
          if (Object.keys(safeIncrements).length > 0) {
            const incArray = Object.entries(safeIncrements).map(([id, amount]) => ({ id, balance: roundMoney(amount) }));
            storeUpdates.deltas.push({ type: 'increment', storeName: 'safes', items: incArray });
          }
          if (newTransactions.length > 0) {
            storeUpdates.deltas.push({ type: 'upsert', storeName: 'transactions', items: newTransactions });
          }
          
          if (reversalOps.length > 0) {
            lastSettlementSafeId = reversalOps[0].safeId;
          }
        }
      }
    }

    const status = entry.type === 'receivable' || entry.type === 'payable'
      ? paidAmount >= entry.amount ? 'settled' : paidAmount > 0 ? 'partial' : 'open'
      : entry.status;
      
    const safeUpdates = {
      ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      ...(updates.dueDate !== undefined ? { dueDate: updates.dueDate } : {}),
      ...(lastSettlementSafeId ? { safeId: lastSettlementSafeId } : {}),
      paidAmount,
      status,
    };

    const updatedEntry: SideAccountEntry = { ...entry, ...safeUpdates };
    storeUpdates.deltas.push({ type: 'upsert', storeName: 'sideAccountEntries', items: [updatedEntry] });

    return { entry: updatedEntry, storeUpdates };
  }

  static deleteSideAccountEntry(
    state: StoreState,
    id: string
  ): { ok: boolean; storeUpdates: StoreUpdates } {
    const { sideAccountEntries, transactions } = state;
    const entry = sideAccountEntries.find(e => e.id === id);
    if (!entry) return { ok: false, storeUpdates: { deltas: [] } };

    const relatedTransactions = transactions.filter(t =>
      t.id === entry.transactionId || t.referenceId === entry.id
    );
    const deltasBySafe: Record<string, number> = {};
    relatedTransactions.forEach(t => {
      if (t.safeId) deltasBySafe[t.safeId] = (deltasBySafe[t.safeId] || 0) + t.amount;
    });

    const storeUpdates: StoreUpdates = { deltas: [] };

    if (Object.keys(deltasBySafe).length > 0) {
      // Reverse balance: if t.amount was positive, we deduct it (add -t.amount)
      const safeIncrements = Object.entries(deltasBySafe).map(([safeId, totalDelta]) => ({
        id: safeId,
        balance: roundMoney(-totalDelta)
      }));
      storeUpdates.deltas.push({ type: 'increment', storeName: 'safes', items: safeIncrements });
    }

    if (relatedTransactions.length > 0) {
      storeUpdates.deltas.push({ type: 'delete', storeName: 'transactions', items: relatedTransactions.map(t => ({ id: t.id })) });
    }

    storeUpdates.deltas.push({ type: 'delete', storeName: 'sideAccountEntries', items: [{ id }] });

    return { ok: true, storeUpdates };
  }
}
