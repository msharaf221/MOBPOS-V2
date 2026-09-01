// ============================================================
//  أثر المرتجعات — Sale returns impact
// ------------------------------------------------------------
//  الفاتورة بقت **مستند ثابت**: المرتجع مابيعدلش أرقامها (كان بيعدلها
//  بأثر رجعي فأي تقرير قديم يطلع مختلف لو اتطبع تاني). عشان كده أي شاشة
//  عايزة «الصافي» بتطرح المرتجعات من هنا.
//
//  ⚠️ توافق رجعي مهم:
//  المرتجعات اللي اتسجلت **قبل** الإصلاح مالهاش `netValue`، ووقتها كانت
//  الفاتورة نفسها بتتخصم. فلو حسبناها هنا كمان الخصم هيتكرر مرتين.
//  عشان كده أي سجل من غير `netValue` بياخد صفر في قيمة الإيراد/الربح
//  الملغي (الكاش المرتجع بيفضل محسوب لأنه حركة خزنة حقيقية ومستقلة).
// ============================================================

import type { Sale, SaleReturn } from '../types';

export interface ReturnsSummary {
  /** عدد عمليات المرتجع. */
  count: number;
  /** إجمالي القطع المرتجعة. */
  quantity: number;
  /** الكاش اللي خرج من الخزنة فعلاً. */
  cashRefunded: number;
  /** قيمة المبيعات اللي اتلغت (بعد نصيبها من الخصم). */
  revenueReversed: number;
  /** تكلفة البضاعة اللي رجعت للمخزون. */
  costReturned: number;
  /** الربح اللي اتلغى. */
  profitReversed: number;
  /** الدين اللي اتشال من على العملاء. */
  debtForgiven: number;
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const EMPTY: ReturnsSummary = {
  count: 0, quantity: 0, cashRefunded: 0,
  revenueReversed: 0, costReturned: 0, profitReversed: 0, debtForgiven: 0,
};

/** تجميع أثر مجموعة مرتجعات (المفروض تكون مفلترة بالفترة أو بالفاتورة قبل النداء). */
export function summarizeReturns(returns: readonly SaleReturn[]): ReturnsSummary {
  if (!Array.isArray(returns) || returns.length === 0) return { ...EMPTY };

  return returns.reduce<ReturnsSummary>((acc, record) => {
    // السجلات القديمة (قبل الإصلاح) الفاتورة اتخصمت بيها بالفعل.
    const isLedgerComplete = record.netValue !== undefined;
    acc.count += 1;
    acc.quantity += num(record.quantity);
    acc.cashRefunded += num(record.refundAmount);
    if (isLedgerComplete) {
      acc.revenueReversed += num(record.netValue);
      acc.costReturned += num(record.costValue);
      acc.profitReversed += num(record.profitImpact);
      acc.debtForgiven += num(record.debtForgiven);
    }
    return acc;
  }, { ...EMPTY });
}

/** فلترة المرتجعات على فترة زمنية (بتاريخ المرتجع نفسه، مش تاريخ الفاتورة). */
export function returnsInPeriod(returns: readonly SaleReturn[], from: Date | number): SaleReturn[] {
  const start = from instanceof Date ? from.getTime() : from;
  return returns.filter(record => {
    const time = new Date(record.createdAt).getTime();
    return !Number.isNaN(time) && time >= start;
  });
}

export interface SaleNetTotals {
  /** قيمة المرتجعات على الفاتورة دي. */
  returnedValue: number;
  /** صافي الفاتورة بعد المرتجعات. */
  netTotal: number;
  /** صافي الربح بعد المرتجعات. */
  netProfit: number;
  /** المتبقي على العميل بعد شطب جزء الدين المرتجع. */
  netRemaining: number;
  /** الكاش اللي رجع للعميل من الفاتورة دي. */
  cashRefunded: number;
  /** فيه مرتجعات على الفاتورة؟ */
  hasReturns: boolean;
}

/** أرقام فاتورة واحدة بعد طرح مرتجعاتها — من غير ما نلمس الفاتورة نفسها. */
export function saleNetTotals(sale: Sale, allReturns: readonly SaleReturn[]): SaleNetTotals {
  const own = allReturns.filter(record => record.saleId === sale.id);
  const summary = summarizeReturns(own);
  return {
    returnedValue: round(summary.revenueReversed),
    netTotal: round(Math.max(0, num(sale.total) - summary.revenueReversed)),
    netProfit: round(num(sale.profit) - summary.profitReversed),
    netRemaining: round(Math.max(0, num(sale.remaining) - summary.debtForgiven)),
    cashRefunded: round(summary.cashRefunded),
    hasReturns: own.length > 0,
  };
}

/** الكمية المرتجعة فعليًا من بند معيّن (سجلات المرتجعات هي مصدر الحقيقة). */
export function returnedQuantityOf(
  allReturns: readonly SaleReturn[],
  saleId: string,
  saleItemId: string,
  legacyFallback = 0
): number {
  const fromRecords = allReturns
    .filter(record => record.saleId === saleId && record.saleItemId === saleItemId)
    .reduce((sum, record) => sum + num(record.quantity), 0);
  return Math.max(fromRecords, num(legacyFallback));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
