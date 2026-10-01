import { useCallback } from 'react';
import { StoreState } from './types';
import { SalesService } from '../../services/SalesService';
import { useStoreDispatcher } from './useStoreDispatcher';
import { auditEvents } from '../../utils/auditLogger';
import { nextDocumentNumber } from '../../utils/sequence';
import { Sale, SaleItem } from '../../types';

export function useSalesSlice(state: StoreState) {
    const { customers, sales, safes, currentUser, addAuditLog } = state;

    const generateInvoiceNumber = useCallback(
      () => nextDocumentNumber(sales.map(s => s.invoiceNumber), 'INV', 4),
      [sales]
    );
  

    
    const dispatch = useStoreDispatcher(state);

    const createSale = useCallback((
      customerId: string,
      items: Omit<SaleItem, 'id' | 'returnedQuantity'>[],
      discount: number,
      paidAmount: number,
      paymentMethod: 'cash' | 'card' | 'installment',
      safeId: string,
      notes: string
    ): Sale | null => {
      const { sale, updates } = SalesService.createSale(
        state, customerId, items, discount, paidAmount, paymentMethod, safeId, notes, currentUser
      );
      if (sale) {
        dispatch(updates);
        addAuditLog(auditEvents.saleCreated(currentUser, sale.invoiceNumber, sale.total, sale.paid, customerId ? customers.find(c => c.id === customerId)?.name : undefined, safes.find(s => s.id === safeId)?.name));
      }
      return sale;
    }, [state, dispatch, currentUser, addAuditLog, customers, safes]);

  

    
    const processSaleReturn = useCallback((
      saleId: string,
      saleItemId: string,
      quantity: number,
      reason: string
    ) => {
      const { returnRecord, updates } = SalesService.processSaleReturn(
        state, saleId, saleItemId, quantity, reason, currentUser
      );
      if (returnRecord) {
        dispatch(updates);
        const sale = sales.find(s => s.id === saleId);
        const safeObj = safes.find(s => s.id === sale?.safeId);
        addAuditLog(auditEvents.saleReturnProcessed(currentUser, sale?.invoiceNumber || '', returnRecord.refundAmount, reason, safeObj?.name));
      }
      return returnRecord;
    }, [state, dispatch, currentUser, addAuditLog, sales, safes]);

  

  return { generateInvoiceNumber, createSale, processSaleReturn };
}
