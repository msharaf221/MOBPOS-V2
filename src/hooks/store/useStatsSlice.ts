import { useCallback } from 'react';
import { StoreState } from './types';
import { summarizeReturns, returnsInPeriod } from '../../utils/returns';
import { buildImeiStockIndex, isSellableUnit } from '../../utils/stockCounts';
import { WARRANTY_ALERT_DAYS } from './helpers';
import { InventoryItem, Transaction } from '../../types';

export function useStatsSlice(state: StoreState) {
    const { inventory, imeiUnits, sales, saleReturns, maintenance, safes, stockWastes, transactions, customers } = state;

    const getStatistics = useCallback(() => {
      const today = new Date();
      // Compare by LOCAL calendar day — using toISOString() here would shift
      // the day boundary by the timezone offset and corrupt "today" stats.
      const isSameLocalDay = (iso: string) => {
        const d = new Date(iso);
        return (
          d.getFullYear() === today.getFullYear() &&
          d.getMonth() === today.getMonth() &&
          d.getDate() === today.getDate()
        );
      };
  
      // مبيعات وصيانة اليوم ومصروفاته
      const todaySales = sales.filter(s => isSameLocalDay(s.createdAt));
      const todaySalesRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
      const todaySalesProfit = todaySales.reduce((sum, s) => sum + s.profit, 0);

      const todayMaintenance = maintenance.filter(m => m.status === 'delivered' && m.deliveredAt && isSameLocalDay(m.deliveredAt));
      const todayMaintRevenue = todayMaintenance.reduce((sum, m) => sum + (m.collectedAmount || m.finalCost || 0), 0);
      const todayMaintProfit = todayMaintenance.reduce((sum, m) => sum + (m.profit || 0), 0);

      const nonPnlTypes: Transaction['type'][] = ['transfer', 'wallet_deposit', 'wallet_withdrawal', 'capital', 'side_account'];
      const todayExpenses = (transactions || [])
        .filter(t => isSameLocalDay(t.createdAt) && (t.type === 'expense' || (t.amount < 0 && !nonPnlTypes.includes(t.type))))
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const todayRevenue = todaySalesRevenue + todayMaintRevenue;
      const todayProfit = (todaySalesProfit + todayMaintProfit) - todayExpenses;
  
      // مبيعات وصيانة الشهر ومصروفاته
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthSales = sales.filter(s => new Date(s.createdAt) >= monthStart);
      const monthSalesRevenue = monthSales.reduce((sum, s) => sum + s.total, 0);
      const monthSalesProfit = monthSales.reduce((sum, s) => sum + s.profit, 0);

      const monthMaintenance = maintenance.filter(m => m.status === 'delivered' && m.deliveredAt && new Date(m.deliveredAt) >= monthStart);
      const monthMaintRevenue = monthMaintenance.reduce((sum, m) => sum + (m.collectedAmount || m.finalCost || 0), 0);
      const monthMaintProfit = monthMaintenance.reduce((sum, m) => sum + (m.profit || 0), 0);

      const monthExpenses = (transactions || [])
        .filter(t => new Date(t.createdAt) >= monthStart && (t.type === 'expense' || (t.amount < 0 && !nonPnlTypes.includes(t.type))))
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const monthRevenue = monthSalesRevenue + monthMaintRevenue;
      const monthProfit = (monthSalesProfit + monthMaintProfit) - monthExpenses;
  
      // المرتجعات بتتحسب بتاريخ المرتجع نفسه (أساس نقدي) — الفاتورة الأصلية
      // مابتتعدلش، فلازم نطرح أثر مرتجعات الشهر هنا عشان الصافي يبقى صح.
      const monthReturns = summarizeReturns(returnsInPeriod(saleReturns, monthStart));
      const allReturns = summarizeReturns(saleReturns);
      const returnRefunds = allReturns.cashRefunded;
      const wasteCost = stockWastes.reduce((sum, waste) => sum + waste.totalCost, 0);
      const monthWasteCost = stockWastes
        .filter(waste => new Date(waste.createdAt) >= monthStart)
        .reduce((sum, waste) => sum + waste.totalCost, 0);
  
      const totalSafesBalance = safes.reduce((sum, s) => sum + s.balance, 0);
  
      const availableIMEI = imeiUnits.filter(u => isSellableUnit(u)).length;
      const soldIMEI = imeiUnits.filter(u => u.status === 'sold').length;
  
      const pendingMaintenance = maintenance.filter(m => m.status === 'received' || m.status === 'in_progress').length;
      const completedMaintenance = maintenance.filter(m => m.status === 'delivered').length;
  
      // Low stock uses the same "real quantity" rule as the Inventory page: for
      // device templates the stock is the number of available IMEI units, not the
      // template's `quantity` field (which is 0 for IMEI products).
      // فهرس واحد O(imeiUnits) بدل مسح كامل لكل منتج — مرتين (كانت 4 مسحات).
      const { availableStockOf } = buildImeiStockIndex(imeiUnits);
      const lowStockItems = inventory.reduce<Array<InventoryItem & { realQuantity: number }>>((acc, i) => {
        const realQuantity = availableStockOf(i);
        if (realQuantity <= i.minQuantity) acc.push({ ...i, realQuantity });
        return acc;
      }, []);
  
      // تاريخ «بعد 30 يوم» كان بيتبني من الصفر لكل وحدة IMEI في كل إحصائية.
      const warrantyWindowEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + WARRANTY_ALERT_DAYS);
      const expiringWarranties = imeiUnits.filter(u => {
        if (!u.warrantyEndDate || u.status !== 'sold') return false;
        const warrantyDate = new Date(u.warrantyEndDate);
        if (Number.isNaN(warrantyDate.getTime())) return false;
        return warrantyDate <= warrantyWindowEnd && warrantyDate >= today;
      });
  
      return {
        todaySales: todaySales.length,
        todayRevenue,
        todayProfit,
        monthSales: monthSales.length,
        monthRevenue,
        monthProfit,
        // صافي الشهر = مبيعات الشهر − أثر مرتجعات الشهر − هالك الشهر.
        // (قبل كده كان بيطرح مرتجعات وهالك «كل العصور» من شهر واحد.)
        netMonthRevenue: monthRevenue - monthReturns.revenueReversed,
        netMonthProfit: monthProfit - monthReturns.profitReversed - monthWasteCost,
        monthReturnsValue: monthReturns.revenueReversed,
        monthReturnRefunds: monthReturns.cashRefunded,
        totalSafesBalance,
        availableIMEI,
        soldIMEI,
        pendingMaintenance,
        completedMaintenance,
        lowStockItems,
        expiringWarranties,
        totalCustomers: customers.length,
        returnRefunds,
        wasteCost,
        returnCount: saleReturns.length,
        wasteCount: stockWastes.length
      };
    }, [sales, saleReturns, stockWastes, safes, imeiUnits, maintenance, inventory, customers, transactions]);
  

  return { getStatistics };
}
