// ============================================================
//  فهارس الكميات الجاهزة من وحدات IMEI — IMEI stock indexes
// ------------------------------------------------------------
//  المنتج اللي عليه IMEI بتكون كميته الحقيقية = عدد الوحدات
//  المتاحة (status === 'available') مش حقل quantity.
//  كل الشاشات كانت تحسبها بـ imeiUnits.filter(...) داخل الحلقة،
//  يعني O(عدد_المنتجات × عدد_وحدات_IMEI) في الريندر الواحد —
//  وده بيحصل 3 مرات لكل صف (الكمية + حد الطلب) وفي getStatistics
//  وفي محرك التنبيهات.
//
//  البديل: بناء الخريطة مرة واحدة لكل ريندر — O(M) بدل O(N×M)
//  وكل lookup بقى O(1).
// ============================================================

import type { IMEIUnit, InventoryItem } from '../types';

export interface ImeiStockIndex {
  /** عدد الوحدات المتاحة لكل منتج (inventoryId -> count) */
  availableCounts: ReadonlyMap<string, number>;
  /** الوحدات المتاحة نفسها لكل منتج، مرتبة بنفس ترتيب imeiUnits */
  availableUnits: ReadonlyMap<string, IMEIUnit[]>;
  /** الكمية المتاحة لأي منتج (IMEI أو عادي) */
  availableStockOf: (item: Pick<InventoryItem, 'id' | 'hasIMEI' | 'quantity'>) => number;
}

export function buildImeiStockIndex(imeiUnits: readonly IMEIUnit[]): ImeiStockIndex {
  const availableCounts = new Map<string, number>();
  const availableUnits = new Map<string, IMEIUnit[]>();

  for (const unit of imeiUnits) {
    if (unit.status !== 'available') continue;
    const id = unit.inventoryId;
    availableCounts.set(id, (availableCounts.get(id) || 0) + 1);
    const bucket = availableUnits.get(id);
    if (bucket) bucket.push(unit);
    else availableUnits.set(id, [unit]);
  }

  const availableStockOf = (item: Pick<InventoryItem, 'id' | 'hasIMEI' | 'quantity'>): number =>
    item.hasIMEI ? (availableCounts.get(item.id) || 0) : (item.quantity || 0);

  return { availableCounts, availableUnits, availableStockOf };
}

/**
 * خريطة مساعدة لأي شاشة تعرض قوائم مرتبطة بكيان آخر (فئة/عميل/خزنة):
 * بدل list.filter(x => x.parentId === id).length داخل الـ map، بنعدّ مرة واحدة.
 */
export function groupCountsBy<TItem, TKey>(
  items: readonly TItem[],
  keyOf: (item: TItem) => TKey
): Map<TKey, number> {
  const counts = new Map<TKey, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
