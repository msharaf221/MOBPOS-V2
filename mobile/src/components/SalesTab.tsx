import React, { useState, useMemo } from 'react';
import {
  Search,
  Receipt,
  Filter,
  CreditCard,
  User,
  Clock,
  Sparkles,
  ChevronLeft,
  Share2,
  X,
  Calendar,
  Send,
  CheckCircle2,
} from 'lucide-react';
import type { SaleRecord } from '../types';
import { formatCurrency, formatTimeAgo } from '../utils/format';

interface SalesTabProps {
  sales: SaleRecord[];
  hideAmounts: boolean;
  onSelectSale: (sale: SaleRecord) => void;
}

export const SalesTab: React.FC<SalesTabProps> = ({
  sales,
  hideAmounts,
  onSelectSale,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'today' | 'cash' | 'instapay' | 'debt'>('all');

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const saleDate = (s.date || s.createdAt || '').slice(0, 10);

      // Preset filter
      if (selectedFilter === 'today' && saleDate !== todayStr) return false;
      if (selectedFilter === 'cash') {
        const method = (s.paymentMethod || '').toLowerCase();
        if (!method.includes('نقدي') && !method.includes('كاش')) return false;
      }
      if (selectedFilter === 'instapay') {
        const method = (s.paymentMethod || '').toLowerCase();
        if (!method.includes('إنستاباي') && !method.includes('تحويل') && !method.includes('محفظة')) return false;
      }
      if (selectedFilter === 'debt') {
        if ((Number(s.remainingAmount) || 0) <= 0) return false;
      }

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchInv = (s.invoiceNumber || '').toLowerCase().includes(q);
      const matchCust = (s.customerName || '').toLowerCase().includes(q);
      const matchPhone = (s.customerPhone || '').includes(q);
      const matchCashier = (s.cashierName || '').toLowerCase().includes(q);
      const matchItems = s.items.some(
        i => i.name.toLowerCase().includes(q) || (i.imei || '').toLowerCase().includes(q)
      );
      return matchInv || matchCust || matchPhone || matchCashier || matchItems;
    });
  }, [sales, searchQuery, selectedFilter, todayStr]);

  const totalFilteredSum = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + (Number(s.finalTotal) || 0), 0);
  }, [filteredSales]);

  const totalCashCollected = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + (Number(s.paidAmount || s.finalTotal) || 0), 0);
  }, [filteredSales]);

  const handleQuickWhatsApp = (e: React.MouseEvent, sale: SaleRecord) => {
    e.stopPropagation();
    const phone = (sale.customerPhone || '').replace(/\D/g, '');
    const itemsText = sale.items.map(i => `• ${i.name} (${i.quantity} × ${i.price} ج.م)`).join('\n');
    const msg = `مرحباً ${sale.customerName || 'عميلنا العزيز'} 👋\nفاتورة رقم: #${sale.invoiceNumber || sale.id.slice(0, 8)}\nالفرع: ${sale.branchName || 'MOBPOS'}\n---\n${itemsText}\n---\nالإجمالي: ${sale.finalTotal} ج.م\nالمدفوع: ${sale.paidAmount || sale.finalTotal} ج.م\nالمتبقي: ${sale.remainingAmount || 0} ج.م\n\nشكراً لتعاملكم معنا! 🌟`;

    const cleanPhone = phone.startsWith('01') ? `2${phone}` : phone;
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-3.5 pb-28 animate-in fade-in duration-200">
      {/* Top Search Input with clear button */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="ابحث باسم العميل، الهاتف، الفاتورة، أو السيريال IMEI..."
          className="w-full pr-10 pl-10 py-3.5 rounded-2xl bg-slate-900/90 border border-white/[0.08] text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500/50 shadow-lg font-sans transition"
        />
        <Search size={17} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Filter Chips with Count Badges */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
        {[
          { id: 'all' as const, label: 'الكل', count: sales.length },
          { id: 'today' as const, label: 'اليوم فقط ⚡', count: sales.filter(s => (s.date || s.createdAt || '').slice(0, 10) === todayStr).length },
          { id: 'cash' as const, label: 'كاش 💵' },
          { id: 'instapay' as const, label: 'إنستاباي / تحويل 📱' },
          { id: 'debt' as const, label: 'آجل / متبقي ⏳' },
        ].map(filter => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setSelectedFilter(filter.id)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-bold transition-all text-xs flex items-center gap-1.5 active:scale-95 ${
              selectedFilter === filter.id
                ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-slate-950 shadow-md shadow-cyan-500/25'
                : 'bg-slate-900/80 border border-white/[0.06] text-slate-400 hover:text-white'
            }`}
          >
            <span>{filter.label}</span>
            {filter.count !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                selectedFilter === filter.id ? 'bg-black/20 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
              }`}>
                {filter.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Summary Stat Banner */}
      <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl glass-panel border border-white/[0.08]">
        <div className="space-y-0.5">
          <span className="text-[10.5px] font-bold text-slate-400">إجمالي الفواتير المعروضة:</span>
          <div className="text-lg font-black text-white font-mono">
            {formatCurrency(totalFilteredSum, hideAmounts)}
          </div>
        </div>

        <div className="space-y-0.5 text-left border-r border-white/[0.06] pr-3">
          <span className="text-[10.5px] font-bold text-slate-400">العدد والتحصيل:</span>
          <div className="text-xs font-bold text-emerald-400 font-mono mt-1">
            {filteredSales.length} فواتير • {formatCurrency(totalCashCollected, hideAmounts)} كاش
          </div>
        </div>
      </div>

      {/* Sales List */}
      {filteredSales.length === 0 ? (
        <div className="py-14 text-center text-slate-500 text-xs glass-card rounded-3xl space-y-2 border border-white/[0.05]">
          <Receipt size={32} className="mx-auto text-slate-600 stroke-[1.5]" />
          <p className="font-bold text-slate-400">لا توجد فواتير مطابقة لبحثك</p>
          <p className="text-[10px] text-slate-500">جرب تغيير شروط الفلترة أو كتابة كلمة بحث أخرى</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredSales.map(sale => {
            const isRemaining = (Number(sale.remainingAmount) || 0) > 0;
            return (
              <div
                key={sale.id}
                onClick={() => onSelectSale(sale)}
                className="p-4 rounded-3xl glass-card-interactive space-y-3 cursor-pointer border border-white/[0.06] hover:border-cyan-500/30 transition group shadow-sm"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center text-cyan-400 shrink-0 font-mono font-bold text-xs shadow-inner">
                      <Receipt size={15} />
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-black text-white">
                          #{sale.invoiceNumber || sale.id.slice(0, 8)}
                        </span>
                        {sale.branchName && (
                          <span
                            className="text-[9px] px-2 py-0.5 rounded-md font-bold truncate max-w-[90px]"
                            style={{
                              backgroundColor: `${sale.branchColor || '#06b6d4'}20`,
                              color: sale.branchColor || '#06b6d4',
                              border: `1px solid ${sale.branchColor || '#06b6d4'}35`,
                            }}
                          >
                            {sale.branchName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleQuickWhatsApp(e, sale)}
                      title="مشاركة عبر واتساب"
                      className="p-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 active:scale-90 transition"
                    >
                      <Send size={13} className="rotate-180" />
                    </button>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                      <Clock size={11} />
                      <span>{formatTimeAgo(sale.date || sale.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Items preview box */}
                <div className="bg-slate-950/60 rounded-2xl p-2.5 border border-white/[0.04] space-y-1">
                  {sale.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs text-slate-300">
                      <div className="truncate flex-1 pl-2">
                        <span className="font-medium text-slate-200">{item.name}</span>
                        {item.imei && (
                          <span className="text-[10px] text-cyan-400 font-mono block truncate">
                            IMEI: {item.imei}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono shrink-0">
                        {item.quantity} × {formatCurrency(item.price, hideAmounts)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Card Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.05] text-xs">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-bold text-slate-300">
                      <User size={13} className="text-cyan-400" />
                      {sale.customerName || 'عميل نقدي'}
                    </span>
                    <span>•</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                      isRemaining
                        ? 'bg-rose-500/15 text-rose-300 border border-rose-500/20'
                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                    }`}>
                      {sale.paymentMethod || (isRemaining ? 'آجل ومتبقي' : 'كاش')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono">
                    <div className="text-left">
                      <div className="text-sm font-black text-white">
                        {formatCurrency(sale.finalTotal, hideAmounts)}
                      </div>
                      {isRemaining && (
                        <div className="text-[9px] text-rose-400 font-bold">
                          متبقي: {formatCurrency(sale.remainingAmount, hideAmounts)}
                        </div>
                      )}
                    </div>
                    <ChevronLeft size={15} className="text-slate-500 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
