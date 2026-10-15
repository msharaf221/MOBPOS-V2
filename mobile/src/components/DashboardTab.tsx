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
  ArrowUpRight,
  CreditCard,
  Building2,
  Clock,
  Send,
  Zap,
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
  const avgOrderValue = metrics.todayInvoicesCount > 0
    ? Math.round(metrics.todaySalesTotal / metrics.todayInvoicesCount)
    : 0;

  const cashCollectionPct = metrics.todaySalesTotal > 0
    ? Math.min(100, Math.round((metrics.todayCashCollected / metrics.todaySalesTotal) * 100))
    : 100;

  const profitMarginPct = metrics.todaySalesTotal > 0
    ? Math.round((metrics.todayProfitTotal / metrics.todaySalesTotal) * 100)
    : 18;

  return (
    <div className="space-y-4 pb-28 animate-in fade-in duration-300">
      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
          <span className="text-xs font-bold text-slate-300">نظام المتابعة التنفيذي الحي</span>
          <span className="text-[10px] text-slate-500 font-mono">
            {new Date().toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black tracking-tight">
          <Zap size={11} className="fill-cyan-400" />
          <span>بث مباشر لحظي</span>
        </div>
      </div>

      {/* Hero Bento: Today's Total Sales */}
      <div
        onClick={() => onNavigateToTab('sales')}
        className="relative p-5 rounded-3xl overflow-hidden cursor-pointer transition-all duration-200 border border-cyan-500/25 active:scale-[0.985] group"
        style={{
          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.14) 0%, rgba(15, 23, 42, 0.95) 45%, rgba(15, 23, 42, 0.85) 100%)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 40px -15px rgba(6, 182, 212, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
        }}
      >
        {/* Ambient Decorative Blurs */}
        <div className="absolute -top-16 -left-16 w-40 h-40 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-40 h-40 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold">
              <span className="p-1.5 rounded-xl bg-cyan-500/20 text-cyan-400 shadow-sm border border-cyan-500/30">
                <TrendingUp size={16} />
              </span>
              <span>مبيعات اليوم الإجمالية</span>
            </div>

            <div className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 font-mono shadow-sm">
              <Receipt size={12} />
              <span>{formatNumber(metrics.todayInvoicesCount)} فواتير</span>
            </div>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <div className="space-y-0.5">
              <h1 className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight drop-shadow-md">
                {formatCurrency(metrics.todaySalesTotal, hideAmounts)}
              </h1>
              <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                <span>متوسط الفاتورة:</span>
                <strong className="text-slate-200 font-mono">{formatCurrency(avgOrderValue, hideAmounts)}</strong>
              </p>
            </div>

            <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-cyan-400 group-hover:-translate-x-1 transition-all">
              <ChevronLeft size={16} />
            </div>
          </div>

          {/* Cash Collection Progress Bar */}
          <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-300 font-medium flex items-center gap-1">
                <span>التحصيل النقدي:</span>
                <strong className="text-emerald-400 font-mono font-bold">
                  {formatCurrency(metrics.todayCashCollected, hideAmounts)}
                </strong>
              </span>
              <span className="text-slate-400 font-mono text-[10px]">
                {cashCollectionPct}% كاش فوري
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800/80 overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-700 shadow-sm shadow-emerald-500/50"
                style={{ width: `${cashCollectionPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Secondary KPI Grid (3 Bento Cards) */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Card 1: Today's Net Profit */}
        <div
          className="p-4 rounded-3xl glass-panel relative overflow-hidden space-y-2 border border-emerald-500/20"
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.85) 100%)',
          }}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-emerald-300">
              <Coins size={15} className="text-emerald-400" />
              صافي الأرباح
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-black font-mono">
              ~{profitMarginPct}%
            </span>
          </div>

          <div className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
            {formatCurrency(metrics.todayProfitTotal, hideAmounts)}
          </div>

          <p className="text-[10px] text-slate-400 leading-tight">
            بعد خصم تكاليف الشراء وهامش الصافي
          </p>
        </div>

        {/* Card 2: Liquid Cash in Safes */}
        <div
          onClick={() => onNavigateToTab('safes')}
          className="p-4 rounded-3xl glass-panel relative overflow-hidden space-y-2 border border-amber-500/20 cursor-pointer active:scale-95 transition group"
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.85) 100%)',
          }}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-amber-300">
              <Wallet size={15} className="text-amber-400" />
              السيولة بالخزن
            </span>
            <ChevronLeft size={13} className="text-slate-500 group-hover:-translate-x-0.5 transition-transform" />
          </div>

          <div className="text-2xl font-black text-amber-300 font-mono tracking-tight">
            {formatCurrency(metrics.totalSafesBalance, hideAmounts)}
          </div>

          <p className="text-[10px] text-slate-400 leading-tight">
            أدراج الكاشير + المحافظ الإلكترونية
          </p>
        </div>

        {/* Card 3: Expenses Today */}
        <div
          onClick={() => onNavigateToTab('safes')}
          className="p-3.5 rounded-2xl glass-card flex items-center justify-between cursor-pointer active:scale-95 transition"
        >
          <div className="space-y-0.5 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 block truncate">مصروفات اليوم</span>
            <span className="text-base font-black text-rose-400 font-mono block">
              {formatCurrency(metrics.todayExpensesTotal, hideAmounts)}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 bg-rose-500/10 px-2 py-1 rounded-lg text-rose-300 font-bold shrink-0">
            سحب ومصروف
          </span>
        </div>

        {/* Card 4: Debts in Market */}
        <div
          onClick={onOpenDebtsModal}
          className="p-3.5 rounded-2xl glass-card flex items-center justify-between cursor-pointer active:scale-95 transition"
        >
          <div className="space-y-0.5 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 block truncate">ديون العملاء</span>
            <span className="text-base font-black text-sky-400 font-mono block">
              {formatCurrency(metrics.totalCustomerDebts, hideAmounts)}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 bg-sky-500/10 px-2 py-1 rounded-lg text-sky-300 font-bold shrink-0">
            آجل بالسوق
          </span>
        </div>
      </div>

      {/* Quick Action Operations Strip */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-bold text-slate-400 px-1">الوصول السريع للعمليات:</span>
        <div className="grid grid-cols-3 gap-2">
          {/* Low Stock Quick Tile */}
          <button
            type="button"
            onClick={() => onNavigateToTab('inventory')}
            className="p-3 rounded-2xl glass-card-interactive flex flex-col items-center text-center gap-1.5 active:scale-95"
          >
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shadow-inner">
              <AlertTriangle size={16} />
            </div>
            <span className="text-base font-black font-mono text-white leading-none">
              {metrics.lowStockCount}
            </span>
            <span className="text-[10px] text-slate-400 font-bold">نواقص بضاعة</span>
          </button>

          {/* Maintenance Quick Tile */}
          <button
            type="button"
            onClick={onOpenMaintenanceModal}
            className="p-3 rounded-2xl glass-card-interactive flex flex-col items-center text-center gap-1.5 active:scale-95"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shadow-inner">
              <Wrench size={16} />
            </div>
            <span className="text-base font-black font-mono text-white leading-none">
              {metrics.activeMaintenanceCount}
            </span>
            <span className="text-[10px] text-slate-400 font-bold">قيد الصيانة</span>
          </button>

          {/* Cross Branch IMEI Lookup */}
          <button
            type="button"
            onClick={() => onNavigateToTab('inventory')}
            className="p-3 rounded-2xl glass-card-interactive flex flex-col items-center text-center gap-1.5 active:scale-95"
          >
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shadow-inner">
              <Sparkles size={16} />
            </div>
            <span className="text-base font-black font-mono text-white leading-none">
              IMEI
            </span>
            <span className="text-[10px] text-slate-400 font-bold">استعلام السيريال</span>
          </button>
        </div>
      </div>

      {/* Multi-Branch Contribution Breakdown (when viewing ALL branches) */}
      {isAllBranches && perBranchMetrics.length > 1 && (
        <div className="p-4 rounded-3xl glass-panel space-y-3.5 border border-white/[0.08]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-200">
            <span className="flex items-center gap-1.5">
              <Building2 size={15} className="text-cyan-400" />
              <span>مساهمة الفروع في مبيعات اليوم</span>
            </span>
            <span className="text-[10px] text-cyan-300 font-mono bg-cyan-500/10 px-2 py-0.5 rounded-lg border border-cyan-500/20">
              {perBranchMetrics.length} فروع
            </span>
          </div>

          {/* Multi-segment Combined Bar */}
          <div className="w-full h-3 rounded-full bg-slate-800/80 overflow-hidden flex p-0.5 gap-0.5">
            {perBranchMetrics.map(b => {
              const pct = metrics.todaySalesTotal > 0
                ? Math.round((b.todaySalesTotal / metrics.todaySalesTotal) * 100)
                : Math.round(100 / perBranchMetrics.length);
              if (pct <= 0) return null;
              return (
                <div
                  key={b.branchId}
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: b.branchColor || '#06b6d4',
                  }}
                  title={`${b.branchName}: ${pct}%`}
                />
              );
            })}
          </div>

          <div className="space-y-2">
            {perBranchMetrics.map(b => {
              const pct = metrics.todaySalesTotal > 0
                ? Math.round((b.todaySalesTotal / metrics.todaySalesTotal) * 100)
                : 0;
              return (
                <div key={b.branchId} className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-900/40 border border-white/[0.04]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: b.branchColor }} />
                    <span className="font-bold text-slate-200 truncate">{b.branchName}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-white font-bold">{formatCurrency(b.todaySalesTotal, hideAmounts)}</span>
                    <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded-md">
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hourly Sales Rhythm Chart */}
      <div className="p-4 rounded-3xl glass-panel space-y-3 border border-white/[0.08]">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-200 flex items-center gap-1.5">
            <Clock size={14} className="text-cyan-400" />
            <span>نبض المبيعات خلال ساعات اليوم</span>
          </span>
          <span className="text-[10px] text-slate-400 font-mono">توزيع ذروة الكاشير</span>
        </div>

        {/* Bar Chart with peak highlight */}
        <div className="flex items-end justify-between gap-1.5 h-28 pt-4 pb-1">
          {metrics.hourlySales.map(h => {
            const heightPct = Math.round((h.total / maxHourly) * 100);
            const isPeak = h.total === maxHourly && h.total > 0;
            return (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                <div
                  className={`w-full max-w-[28px] rounded-t-xl transition-all duration-300 relative ${
                    isPeak
                      ? 'bg-gradient-to-t from-cyan-500 to-emerald-400 shadow-[0_0_12px_rgba(6,182,212,0.6)]'
                      : 'bg-gradient-to-t from-slate-700 to-cyan-500/70 opacity-80 group-hover:opacity-100'
                  }`}
                  style={{ height: `${Math.max(heightPct, 8)}%` }}
                >
                  {isPeak && (
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-black text-emerald-400 font-mono">
                      ذروة
                    </span>
                  )}
                  {/* Tooltip */}
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[9px] px-2 py-0.5 rounded-lg shadow-xl pointer-events-none whitespace-nowrap z-20 font-mono border border-slate-700">
                    {formatCurrency(h.total, hideAmounts)}
                  </div>
                </div>
                <span className={`text-[9px] font-mono shrink-0 ${isPeak ? 'text-cyan-300 font-bold' : 'text-slate-500'}`}>
                  {h.hour}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Latest Sales Activity Feed */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="font-bold text-slate-200 flex items-center gap-1.5">
            <Receipt size={14} className="text-cyan-400" />
            <span>آخر الفواتير اللحظية المباشرة</span>
          </span>
          <button
            type="button"
            onClick={() => onNavigateToTab('sales')}
            className="text-cyan-400 hover:text-cyan-300 text-[11px] font-bold flex items-center gap-0.5 active:scale-95 transition"
          >
            <span>كل الفواتير ({metrics.recentSales.length})</span>
            <ChevronLeft size={13} />
          </button>
        </div>

        <div className="space-y-2">
          {metrics.recentSales.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs glass-card rounded-2xl">
              لا توجد مبيعات مسجلة حتى الآن اليوم
            </div>
          ) : (
            metrics.recentSales.slice(0, 6).map(sale => (
              <div
                key={sale.id}
                onClick={() => onSelectSale(sale)}
                className="p-3.5 rounded-2xl glass-card-interactive flex items-center justify-between gap-3 cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 group-hover:scale-105 transition-transform shadow-inner">
                    <Receipt size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white truncate">
                        {sale.customerName || 'عميل نقدي'}
                      </span>
                      {sale.branchName && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-md font-bold truncate max-w-[80px]"
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
                      {sale.items.length > 0 ? sale.items.map(i => i.name).join(' + ') : 'فاتورة كاشير'}
                    </div>
                  </div>
                </div>

                <div className="text-left shrink-0 space-y-0.5">
                  <div className="text-xs font-black text-white font-mono">
                    {formatCurrency(sale.finalTotal, hideAmounts)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono flex items-center justify-end gap-1">
                    <Clock size={10} />
                    <span>{formatTimeAgo(sale.date || sale.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
