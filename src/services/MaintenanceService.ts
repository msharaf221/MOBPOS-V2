import { v4 as uuidv4 } from 'uuid';
import { StoreState } from '../hooks/store/types';
import { StoreUpdates } from './types';
import { validText, isFiniteNumber, isPositiveInteger, roundMoney } from '../hooks/store/helpers';
import { MaintenancePart } from '../types';

export class MaintenanceService {
  static addMaintenancePart(
    state: StoreState,
    maintenanceId: string,
    part: Omit<MaintenancePart, 'id'>
  ): { safePart: MaintenancePart | null; updates: StoreUpdates } {
    const { maintenance, inventory } = state;
    const maint = maintenance.find(m => m.id === maintenanceId);
    if (!maint || maint.status === 'delivered' || maint.status === 'cancelled' || typeof part.inventoryId !== 'string' ||
        !isPositiveInteger(part.quantity) || !validText(part.name, 200) || !isFiniteNumber(part.unitCost) || part.unitCost < 0) {
      return { safePart: null, updates: { deltas: [] } };
    }

    let safePart: MaintenancePart;
    if (part.inventoryId.startsWith('manual-')) {
      safePart = { ...part, name: part.name.trim(), unitCost: roundMoney(part.unitCost), total: roundMoney(part.unitCost * part.quantity), id: uuidv4() };
    } else {
      const inventoryItem = inventory.find(inv => inv.id === part.inventoryId);
      if (!inventoryItem || inventoryItem.hasIMEI || inventoryItem.quantity < part.quantity) {
        return { safePart: null, updates: { deltas: [] } };
      }
      safePart = {
        id: uuidv4(), inventoryId: inventoryItem.id, name: inventoryItem.name,
        quantity: part.quantity, unitCost: roundMoney(inventoryItem.costPrice),
        total: roundMoney(inventoryItem.costPrice * part.quantity)
      };
    }

    const updates: StoreUpdates = { deltas: [] };

    // To add an element to parts array, we need to replace the whole maintenance item 
    // OR we can make 'increment' handle array pushes?
    // Current 'upsert' does a deep merge (Object.assign basically). Array replacement works if we send the full array.
    const newMaint = { ...maint, parts: [...maint.parts, safePart] };
    updates.deltas.push({ type: 'upsert', storeName: 'maintenance', items: [newMaint] });

    if (!safePart.inventoryId.startsWith('manual-')) {
      updates.deltas.push({ type: 'increment', storeName: 'inventory', items: [{ id: safePart.inventoryId, quantity: -safePart.quantity }] });
    }

    return { safePart, updates };
  }

  static removeMaintenancePart(
    state: StoreState,
    maintenanceId: string,
    partId: string
  ): { ok: boolean; updates: StoreUpdates } {
    const { maintenance } = state;
    const maint = maintenance.find(m => m.id === maintenanceId);
    const part = maint?.parts.find(p => p.id === partId);
    if (!maint || !part || maint.status === 'delivered' || maint.status === 'cancelled') {
      return { ok: false, updates: { deltas: [] } };
    }
    
    const updates: StoreUpdates = { deltas: [] };

    if (!part.inventoryId.startsWith('manual-')) {
      updates.deltas.push({ type: 'increment', storeName: 'inventory', items: [{ id: part.inventoryId, quantity: part.quantity }] });
    }

    const newMaint = { ...maint, parts: maint.parts.filter(p => p.id !== partId) };
    updates.deltas.push({ type: 'upsert', storeName: 'maintenance', items: [newMaint] });

    return { ok: true, updates };
  }

  // ملاحظة: لم يعد هناك deliverMaintenance هنا. التنفيذ الوحيد الحيّ
  // موجود في useMaintenanceSlice (المسار الذي تستخدمه الواجهة فعلاً).
  // كانت نسخة هذه الخدمة ميتة — لا يستدعيها أحد — وتسجّل مصاريف الصيانة
  // الإضافية كنوع 'maintenance' بدل 'expense' وتتجاهل قيد تكلفة القطع
  // 'maintenance_cost'، فأي استدعاء مستقبلي لها كان سيغيّر تصنيف التقارير
  // بصمت عن السلوك الحالي. حُذفت ليبقى مصدر حساب واحد فقط.
}
