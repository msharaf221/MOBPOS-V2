import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { useStoreDispatcher } from './useStoreDispatcher';
import { MaintenanceService } from '../../services/MaintenanceService';
import { validText, isFiniteNumber, roundMoney, MAX_TEXT_LENGTH } from './helpers';
import { auditEvents } from '../../utils/auditLogger';
import { nextDocumentNumber } from '../../utils/sequence';
import { Maintenance, MaintenancePart, Transaction } from '../../types';

export function useMaintenanceSlice(state: StoreState) {
    const { maintenance, setMaintenance, safes, setSafes, setTransactions, currentUser, addAuditLog } = state;

    const generateTicketNumber = useCallback(
      () => nextDocumentNumber(maintenance.map(m => m.ticketNumber), 'MNT', 3),
      [maintenance]
    );
  

    const createMaintenance = useCallback((data: Omit<Maintenance, 'id' | 'ticketNumber' | 'status' | 'finalCost' | 'collectedAmount' | 'parts' | 'additionalExpenses' | 'profit' | 'completedAt' | 'deliveredAt'>) => {
      if (!validText(data.customerName, 200) || !validText(data.customerPhone, 50) || !validText(data.deviceType, 200) ||
          typeof data.deviceModel !== 'string' || data.deviceModel.length > MAX_TEXT_LENGTH ||
          typeof data.imeiLink !== 'string' || data.imeiLink.length > 40 || typeof data.problem !== 'string' || data.problem.length > MAX_TEXT_LENGTH ||
          typeof data.diagnosis !== 'string' || data.diagnosis.length > MAX_TEXT_LENGTH ||
          !isFiniteNumber(data.estimatedCost) || data.estimatedCost < 0 || typeof data.technicianId !== 'string' || data.technicianId.length > 100 ||
          typeof data.safeId !== 'string' || data.safeId.length > 100 || typeof data.receivedAt !== 'string' ||
          typeof data.notes !== 'string' || data.notes.length > MAX_TEXT_LENGTH) return null;
      const newMaintenance: Maintenance = {
        ...data,
        customerName: data.customerName.trim(), customerPhone: data.customerPhone.trim(), deviceType: data.deviceType.trim(),
        estimatedCost: roundMoney(data.estimatedCost),
        id: uuidv4(),
        ticketNumber: generateTicketNumber(),
        status: 'received',
        finalCost: 0,
        collectedAmount: 0,
        parts: [],
        additionalExpenses: 0,
        profit: 0,
        completedAt: '',
        deliveredAt: ''
      };
      setMaintenance(prev => [...prev, newMaintenance]);
      return newMaintenance;
    }, [generateTicketNumber, setMaintenance]);
  

    const updateMaintenance = useCallback((id: string, updates: Partial<Maintenance>) => {
      const existing = maintenance.find(m => m.id === id);
      if (!existing || existing.status === 'delivered' || existing.status === 'cancelled') return;
      const validStatuses: Maintenance['status'][] = ['received', 'in_progress', 'completed', 'cancelled'];
      if (updates.status !== undefined && !validStatuses.includes(updates.status)) return;
      for (const value of [updates.estimatedCost, updates.additionalExpenses, updates.collectedAmount]) {
        if (value !== undefined && (!isFiniteNumber(value) || value < 0)) return;
      }
      for (const value of [updates.customerName, updates.customerPhone, updates.deviceType, updates.deviceModel, updates.imeiLink, updates.problem, updates.diagnosis, updates.notes]) {
        if (value !== undefined && (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH)) return;
      }
      const safeUpdates: Partial<Maintenance> = { ...updates };
      delete safeUpdates.id;
      delete safeUpdates.ticketNumber;
      delete safeUpdates.parts;
      delete safeUpdates.finalCost;
      delete safeUpdates.profit;
      delete safeUpdates.deliveredAt;
      if (safeUpdates.estimatedCost !== undefined) safeUpdates.estimatedCost = roundMoney(safeUpdates.estimatedCost);
      if (safeUpdates.additionalExpenses !== undefined) safeUpdates.additionalExpenses = roundMoney(safeUpdates.additionalExpenses);
      if (safeUpdates.collectedAmount !== undefined) safeUpdates.collectedAmount = roundMoney(safeUpdates.collectedAmount);
      setMaintenance(prev => prev.map(m => m.id === id ? { ...m, ...safeUpdates } : m));
    }, [maintenance, setMaintenance]);
  

    
    const dispatch = useStoreDispatcher(state);

    const addMaintenancePart = useCallback((maintenanceId: string, part: Omit<MaintenancePart, 'id'>) => {
      const { safePart, updates } = MaintenanceService.addMaintenancePart(state, maintenanceId, part);
      if (safePart) {
        dispatch(updates);
      }
      return safePart;
    }, [state, dispatch]);

  

    
    const removeMaintenancePart = useCallback((maintenanceId: string, partId: string) => {
      const { ok, updates } = MaintenanceService.removeMaintenancePart(state, maintenanceId, partId);
      if (ok) {
        dispatch(updates);
      }
    }, [state, dispatch]);

  

    const deliverMaintenance = useCallback((
      id: string,
      collectedAmount: number,
      safeId: string
    ): { ok: true } | { ok: false; error: string } => {
      const maint = maintenance.find(m => m.id === id);
      if (!maint) return { ok: false, error: 'تذكرة الصيانة غير موجودة' };
      if (maint.status === 'delivered') return { ok: false, error: 'التذكرة مسلّمة بالفعل' };
      if (maint.status === 'cancelled') return { ok: false, error: 'لا يمكن تسليم تذكرة ملغاة' };
      if (maint.status !== 'completed') {
        return { ok: false, error: 'لازم تحوّل التذكرة لحالة «مكتمل» قبل التسليم' };
      }
      const safe = safes.find(s => s.id === safeId);
      if (!safe) return { ok: false, error: 'اختر الخزنة اللي هيتحصّل فيها المبلغ' };
      if (!isFiniteNumber(collectedAmount) || collectedAmount < 0) {
        return { ok: false, error: 'المبلغ المحصّل غير صحيح' };
      }
  
      const partsCost = maint.parts.reduce((sum, p) => sum + (isFiniteNumber(p.total) && p.total >= 0 ? p.total : 0), 0);
      const additionalExpenses = roundMoney(
        isFiniteNumber(maint.additionalExpenses) && maint.additionalExpenses >= 0 ? maint.additionalExpenses : 0
      );
      const finalAmount = roundMoney(collectedAmount);
      const profit = roundMoney(finalAmount - partsCost - additionalExpenses);
  
      // المصاريف الإضافية بتتدفع كاش من نفس الخزنة، فلازم تكون مغطّاة
      // بالرصيد بعد إضافة المحصّل — غير كده الخزنة كانت هتروح سالب بصمت.
      if (additionalExpenses > 0 && roundMoney(safe.balance + finalAmount) < additionalExpenses) {
        return { ok: false, error: `رصيد ${safe.name} لا يكفي لصرف المصاريف الإضافية (${additionalExpenses})` };
      }
  
      const now = new Date().toISOString();
  
      setMaintenance(prev => prev.map(m => m.id === id ? {
        ...m,
        status: 'delivered', collectedAmount: finalAmount, finalCost: finalAmount,
        profit, deliveredAt: now, safeId
      } : m));
  
      // صافي الأثر على الخزنة: المحصّل − المصاريف الإضافية
      const safeDelta = roundMoney(finalAmount - additionalExpenses);
      if (safeDelta !== 0) {
        setSafes(prev => prev.map(s =>
          s.id === safeId ? { ...s, balance: roundMoney(s.balance + safeDelta) } : s
        ));
      }
  
      const newTransactions: Transaction[] = [];
      if (finalAmount > 0) {
        newTransactions.push({
          id: uuidv4(),
          type: 'maintenance',
          amount: finalAmount,
          description: `صيانة ${maint.ticketNumber}`,
          referenceId: id,
          safeId,
          userId: currentUser?.id || '',
          createdAt: now
        });
      }
      // تكلفة قطع الغيار: البضاعة خرجت من المخزون لكن مافيش كاش اتدفع دلوقتي
      // (اتدفع وقت الشراء). من غير القيد ده الصيانة بتبان ربحها = كل المحصّل،
      // والمصروفات في التقارير المالية بتقل بقيمة القطع. قيد دفتري بس (safeId فاضي).
      const partsCostRounded = roundMoney(partsCost);
      if (partsCostRounded > 0) {
        newTransactions.push({
          id: uuidv4(),
          type: 'maintenance_cost',
          amount: -partsCostRounded,
          description: `تكلفة قطع غيار - صيانة ${maint.ticketNumber}`,
          referenceId: id,
          safeId: '',
          userId: currentUser?.id || '',
          createdAt: now
        });
      }
      if (additionalExpenses > 0) {
        newTransactions.push({
          id: uuidv4(),
          type: 'expense',
          amount: -additionalExpenses,
          description: `مصاريف إضافية - صيانة ${maint.ticketNumber}`,
          referenceId: id,
          safeId,
          userId: currentUser?.id || '',
          createdAt: now
        });
      }
      if (newTransactions.length > 0) {
        setTransactions(prev => [...prev, ...newTransactions]);
      }
  
      addAuditLog(auditEvents.maintenanceDelivered(currentUser, maint.ticketNumber, maint.customerName, finalAmount, safe.name));
      return { ok: true };
    }, [currentUser, maintenance, setMaintenance, safes, setSafes, setTransactions, addAuditLog]);
  

  return { generateTicketNumber, createMaintenance, updateMaintenance, addMaintenancePart, removeMaintenancePart, deliverMaintenance };
}
