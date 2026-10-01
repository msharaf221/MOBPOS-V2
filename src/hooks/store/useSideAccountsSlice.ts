import { useCallback } from 'react';
import { StoreState } from './types';
import { SideAccountsService } from '../../services/SideAccountsService';
import { useStoreDispatcher } from './useStoreDispatcher';
import { roundMoney } from './helpers';
import { SideAccountEntry, SideAccountEntryType, SideAccountImpact } from '../../types';

export function useSideAccountsSlice(state: StoreState) {
    const { setSafes, transactions, setTransactions, sideAccountEntries, setSideAccountEntries, currentUser } = state;
    
    const dispatch = useStoreDispatcher(state);

    const addSideAccountEntry = useCallback((input: {
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
    }) => {
      const { entry, updates } = SideAccountsService.addSideAccountEntry(state, input, currentUser);
      if (entry) {
        dispatch(updates);
      }
      return entry;
    }, [state, dispatch, currentUser]);

  

    
    const updateSideAccountEntry = useCallback((
      id: string,
      updates: Partial<Pick<SideAccountEntry, 'paidAmount' | 'status' | 'notes' | 'dueDate'>> & { safeId?: string }
    ) => {
      const { entry, storeUpdates } = SideAccountsService.updateSideAccountEntry(state, id, updates, currentUser);
      if (entry) {
        dispatch(storeUpdates);
      }
      return entry;
    }, [state, dispatch, currentUser]);

  

    const deleteSideAccountEntry = useCallback((id: string) => {
      const entry = sideAccountEntries.find(e => e.id === id);
      if (!entry) return;
  
      // Reverse every cash effect this entry ever had:
      //  - the original cash movement (capital / side_account transaction)
      //  - settlement transactions created for receivable/payable entries
      // The original transaction uses entry.transactionId, while each settlement
      // uses referenceId = entry.id, so both are matched here.
      const relatedTransactions = transactions.filter(t =>
        t.id === entry.transactionId || t.referenceId === entry.id
      );
      const deltasBySafe: Record<string, number> = {};
      relatedTransactions.forEach(t => {
        if (t.safeId) deltasBySafe[t.safeId] = (deltasBySafe[t.safeId] || 0) + t.amount;
      });
  
      if (Object.keys(deltasBySafe).length > 0) {
        setSafes(prev => prev.map(s =>
          deltasBySafe[s.id]
            ? { ...s, balance: roundMoney(s.balance - deltasBySafe[s.id]) }
            : s
        ));
      }
  
      if (relatedTransactions.length > 0) {
        const idsToRemove = new Set(relatedTransactions.map(t => t.id));
        setTransactions(prev => prev.filter(t => !idsToRemove.has(t.id)));
      }
  
      setSideAccountEntries(prev => prev.filter(e => e.id !== id));
    }, [sideAccountEntries, transactions, setSafes, setSideAccountEntries, setTransactions]);
  

  return { addSideAccountEntry, updateSideAccountEntry, deleteSideAccountEntry };
}
