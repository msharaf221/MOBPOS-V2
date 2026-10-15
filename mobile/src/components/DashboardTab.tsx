import React from 'react';
import {
  TrendingUp,
  Receipt,
  Coins,
  Wallet,
  AlertTriangle,
  Wrench,
  Users,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';
import type { BranchMetrics, SaleRecord } from '../types';
import { formatCurrency, formatNumber, formatTimeAgo } from '../utils/format';

interface DashboardTabProps {
  metrics: BranchMetrics;
  perBranchMetrics: BranchMetrics[];
  isAllBranches: boolean;
  hideAmounts: boolean;
  onSelectSale: (sale: SaleRecord) => void;
  onNavigateToTab: (tab: 'sales' | 'safes' | 'inventory' | 'settings') => void;
  onOpenMaintenanceModal: () => void;
  onOpenDebtsModal: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  metrics,
  perBranchMetrics,
  isAllBranches,
  hideAmounts,
  onSelectSale,
  onNavigateToTab,
  onOpenMaintenanceModal,
  onOpenDebtsModal,
}) => {
  const maxHourly = Math.max(...metrics.hourlySales.map(h => h.total), 1);

  return (
    <div className="space-y-4 pb-20">
      {/* Top Welcome & Telemetry */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Sparkles size={14} className="text-cyan-400" />
          <span>ملخص اليومية المباشر</span>
          <span className="text-[10px] text-slate-500 font-mono">
            {new Date().toLocaleDateString('ar-EG', { weekday: 'short', month: 'numeric', day: 'numeric' })}
          </span>
        </div>

        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>رادار لحظي ⚡</span>
        </div>
      </div>

      {/* Primary KPI Bento Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Card 1: Today's Sales */}
        <div
          onClick={() => onNavigateToTab('sales')}
          className="col-span-2 p-4 rounded-3xl glass-panel relative overflow-hidden cursor-pointer hover:border-cyan-500/30 transition group active:scale-[0.99]"
        >
          <div className="absolute -top-12 -left-12 w-32 h-32 rounded-full bg-cyan-500/15 blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <TrendingUp size={15} className="text-cyan-400" />
              إجمالي مبيعات اليوم
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
              {formatNumber(metrics.todayInvoicesCount)} فواتير
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <h2 className="text-3xl font-black text-white font-mono tracking-tight">
              {formatCurrency(metrics.todaySalesTotal, hideAmounts)}
            </h2>
            <ChevronLeft size={16} className="text-slate-500 group-hover:-translate-x-1 transition-transform" />
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>التحصيل النقدي: <strong className="text-slate-200">{formatCurrency(metrics.todayCashCollected, hideAmounts)}</strong></span>
            <span className="text-emerald-400 font-bold">أداء ممتاز ⚡</span>
          </div>
        </div>

        {/* Card 2: Today's Net Profit */}
        <div className="p-3.5 rounded-2xl glass-card">
          <div className="flex items-center justify-between mb-1 text-slate-400 text-[11px] font-medium">
            <span className="flex items-center gap-1">
              <Coins size={14} className="text-emerald-400" />
              أرباح اليوم
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 font-bold">صافي</span>
          </div>
          <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
            {formatCurrency(metrics.todayProfitTotal, hideAmounts)}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            هامش ربح ~19%
          </div>
        </div>

        {/* Card 3: Total Safes Cash */}
        <div
          onClick={() => onNavigateToTab('safes')}
          className="p-3.5 rounded-2xl glass-card cursor-pointer hover:border-slate-650 transition active:scale-[0.98]"
        >
          <div className="flex items-center justify-between mb-1 text-slate-400 text-[11px] font-medium">
            <span className="flex items-center gap-1">
              <Wallet size={14} className="text-amber-400" />
              السيولة بالخزن
            </span>
            <ChevronLeft size={13} className="text-slate-500" />
          </div>
          <div className="text-xl font-bold text-amber-300 font-mono mt-1">
            {formatCurrency(metrics.totalSafesBalance, hideAmounts)}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
            <span>كاش حقيقي متاح</span>
            <span className="text-slate-300">{metrics.safesList.length} خزائن</span>
          </div>
        </div>
      </div>

      {/* Multi-Branch Contribution Breakdown (when viewing ALL branches) */}
      {isAllBranches && perBranchMetrics.length > 1 && (
        <div className="p-4 rounded-3xl glass-panel space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-200">
            <span>مساهمة كل فرع في مبيعات اليوم</span>
            <span className="text-[10px] text-slate-400 font-mono">
              {perBranchMetrics.length} فروع نشطة
            </span>
          </div>

          <div className="space-y-2.5">
            {perBranchMetrics.map(b => {
              const pct = metrics.todaySalesTotal > 0
                ? Math.round((b.todaySalesTotal / metrics.todaySalesTotal) * 100)
                : 0;
              return (
                <div key={b.branchId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.branchColor }} />
                      <span className="font-bold text-slate-200 truncate">{b.branchName}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="text-slate-300 font-bold">{formatCurrency(b.todaySalesTotal, hideAmounts)}</span>
                      <span className="text-[10px] text-slate-400">({pct}%)</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 3)}%`,
                        backgroundColor: b.branchColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hourly Sales Rhythm Chart */}
      <div className="p-4 rounded-3xl glass-panel space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300">حركة المبيعات خلال ساعات اليوم</span>
          <span className="text-[10px] text-slate-400 font-mono">تحديث مستمر</span>
        </div>

        {/* Bar/Flow Chart */}
        <div className="flex items-end justify-between gap-1.5 h-28 pt-4 pb-1">
          {metrics.hourlySales.map(h => {
            const heightPct = Math.round((h.total / maxHourly) * 100);
            return (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                <div
                  className="w-full max-w-[28px] rounded-t-lg bg-gradient-to-t from-cyan-600 to-cyan-400 opacity-80 group-hover:opacity-100 transition-all duration-300 relative"
                  style={{ height: `${Math.max(heightPct, 6)}%` }}
                >
                  {/* Hover tooltip */}
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-20 font-mono border border-slate-700">
                    {formatCurrency(h.total, hideAmounts)}
                  </div>
                </div>
                <span className="text-[9px] text-slate-400 font-mono shrink-0">{h.hour}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Action Operation Cards */}
      <div className="grid grid-cols-3 gap-2">
        {/* Low Stock Alert */}
        <button
          type="button"
          onClick={() => onNavigateToTab('inventory')}
          className="p-3 rounded-2xl glass-card flex flex-col items-center text-center gap-1 hover:border-rose-500/30 transition active:scale-95"
        >
          <div className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center">
            <AlertTriangle size={16} />
          </div>
          <span className="text-lg font-black font-mono text-white mt-0.5">
            {metrics.lowStockCount}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">نواقص بضاعة</span>
        </button>

        {/* Maintenance Tracker */}
        <button
          type="button"
          onClick={onOpenMaintenanceModal}
          className="p-3 rounded-2xl glass-card flex flex-col items-center text-center gap-1 hover:border-amber-500/30 transition active:scale-95"
        >
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <Wrench size={16} />
          </div>
          <span className="text-lg font-black font-mono text-white mt-0.5">
            {metrics.activeMaintenanceCount}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">قيد الصيانة</span>
        </button>

        {/* Customer Debts */}
        <button
          type="button"
          onClick={onOpenDebtsModal}
          className="p-3 rounded-2xl glass-card flex flex-col items-center text-center gap-1 hover:border-sky-500/30 transition active:scale-95"
        >
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
            <Users size={16} />
          </div>
          <span className="text-xs font-black font-mono text-white mt-1.5 truncate max-w-full">
            {formatCurrency(metrics.totalCustomerDebts, hideAmounts)}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">ديون بالسوق</span>
        </button>
      </div>

      {/* Latest Sales Activity Feed */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="font-bold text-slate-200">آخر فواتير تم إصدارها</span>
          <button
            type="button"
            onClick={() => onNavigateToTab('sales')}
            className="text-cyan-400 hover:text-cyan-300 text-[11px] font-bold flex items-center gap-0.5"
          >
            <span>عرض الكل ({metrics.recentSales.length})</span>
            <ChevronLeft size={13} />
          </button>
        </div>

        <div className="space-y-2">
          {metrics.recentSales.slice(0, 5).map(sale => (
            <div
              key={sale.id}
              onClick={() => onSelectSale(sale)}
              className="p-3 rounded-2xl glass-card flex items-center justify-between gap-2 cursor-pointer hover:border-slate-650 transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
                  <Receipt size={17} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white truncate">
                      {sale.customerName || 'عميل نقدي'}
                    </span>
                    {sale.branchName && (
                      <span
                        className="text-[9px] px-1.5 py-0.2 rounded-md font-bold truncate max-w-[80px]"
                        style={{
                          backgroundColor: `${sale.branchColor || '#38bdf8'}20`,
                          color: sale.branchColor || '#38bdf8',
                        }}
                      >
                        {sale.branchName}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {sale.items.length > 0 ? sale.items.map(i => i.name).join(' + ') : 'فاتورة مبيعات'}
                  </div>
                </div>
              </div>

              <div className="text-left shrink-0">
                <div className="text-xs font-bold text-white font-mono">
                  {formatCurrency(sale.finalTotal, hideAmounts)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {formatTimeAgo(sale.date)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
