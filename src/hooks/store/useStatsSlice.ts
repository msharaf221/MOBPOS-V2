// @ts-nocheck
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { indexedDBUtils } from '../useIndexedDB';
import { validText, isFiniteNumber, isPositiveInteger, roundMoney, MAX_TEXT_LENGTH } from './helpers';
import { hashPasswordForStorage, verifyLoginPassword, needsRehash } from '../../utils/passwords';
import { authenticateLanUser, pushDelta } from '../../utils/lanSync';
import { auditEvents } from '../../utils/auditLogger';
import { buildAutoNotifications, mergeAutoNotifications } from '../../utils/alerts';
import { planSettlementReversal, settledThroughSafes } from '../../utils/sideAccounts';
import { summarizeReturns, returnsInPeriod } from '../../utils/returns';
import { buildImeiStockIndex, isSellableUnit } from '../../utils/stockCounts';
import { WARRANTY_ALERT_DAYS } from "./helpers";
import { formatDate } from '../../utils/format';
import { nextDocumentNumber } from '../../utils/sequence';
import { initialUsers, initialCustomers, initialCategories, initialInventory, initialIMEIUnits, initialSales, initialSaleReturns, initialMaintenance, initialSafes, initialTransactions, initialSuppliers, initialPurchases, initialStockWastes, initialInventoryAudits, initialSideAccountEntries, initialNotifications, initialAuditLogs } from '../../data/initialData';
import { User, Customer, Category, InventoryItem, IMEIUnit, Sale, SaleItem, SaleReturn, Maintenance, MaintenancePart, Safe, Transaction, Supplier, Notification, Purchase, PurchaseItem, StockWaste, InventoryAudit, InventoryAuditItem, SideAccountEntry, SideAccountEntryType, SideAccountImpact, AppSettings, AuditLogEntry } from '../../types';

export function useStatsSlice(state: StoreState) {
    const { customers, inventory, imeiUnits, sales, saleReturns, maintenance, safes, stockWastes } = state;

    const getStatistics = useMemo(() => {
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
  
      const todaySales = sales.filter(s => isSameLocalDay(s.createdAt));
      const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
      const todayProfit = todaySales.reduce((sum, s) => sum + s.profit, 0);
  
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthSales = sales.filter(s => new Date(s.createdAt) >= monthStart);
      const monthRevenue = monthSales.reduce((sum, s) => sum + s.total, 0);
      const monthProfit = monthSales.reduce((sum, s) => sum + s.profit, 0);
  
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
    }, [sales, saleReturns, stockWastes, safes, imeiUnits, maintenance, inventory, customers]);
  

  return { getStatistics };
}
