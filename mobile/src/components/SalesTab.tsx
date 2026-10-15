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
  const [selectedPayment, setSelectedPayment] = useState<string>('all');

  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      // Payment filter
      if (selectedPayment !== 'all') {
        const method = (s.paymentMethod || '').toLowerCase();
        if (selectedPayment === 'cash' && !method.includes('نقدي') && !method.includes('كاش')) return false;
        if (selectedPayment === 'instapay' && !method.includes('إنستاباي') && !method.includes('تحويل')) return false;
        if (selectedPayment === 'debt' && (Number(s.remainingAmount) || 0) <= 0) return false;
      }

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchInv = (s.invoiceNumber || '').toLowerCase().includes(q);
      const matchCust = (s.customerName || '').toLowerCase().includes(q);
      const matchCashier = (s.cashierName || '').toLowerCase().includes(q);
      const matchItems = s.items.some(
        i => i.name.toLowerCase().includes(q) || (i.imei || '').toLowerCase().includes(q)
      );
      return matchInv || matchCust || matchCashier || matchItems;
    });
  }, [sales, searchQuery, selectedPayment]);

  const totalFilteredSum = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + (Number(s.finalTotal) || 0), 0);
  }, [filteredSales]);

  return (
    <div className="space-y-3 pb-24">
      {/* Top Search Input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="ابحث باسم العميل، رقم الفاتورة، الصنف، أو السيريال IMEI..."
          className="w-full pr-10 pl-4 py-3 rounded-2xl bg-slate-900 border border-slate-750 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500/50 transition font-sans"
        />
        <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
        {[
          { id: 'all', label: 'الكل' },
          { id: 'cash', label: 'كاش فقط' },
          { id: 'instapay', label: 'إنستاباي / تحويل' },
          { id: 'debt', label: 'آجل / متبقي' },
        ].map(filter => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setSelectedPayment(filter.id)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-medium transition ${
              selectedPayment === filter.id
                ? 'bg-cyan-500 text-slate-950 font-bold'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Total Banner */}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
        <span className="text-slate-400">
          عدد الفواتير: <strong className="text-white">{filteredSales.length}</strong>
        </span>
        <span className="text-slate-400">
          المجموع: <strong className="text-cyan-400 font-mono">{formatCurrency(totalFilteredSum, hideAmounts)}</strong>
        </span>
      </div>

      {/* Sales List */}
      {filteredSales.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs glass-card rounded-2xl">
          لا توجد فواتير مطابقة لخيارات البحث
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredSales.map(sale => (
            <div
              key={sale.id}
              onClick={() => onSelectSale(sale)}
              className="p-3.5 rounded-2xl glass-card space-y-2.5 cursor-pointer hover:border-slate-650 transition active:scale-[0.99]"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-white flex items-center gap-1">
                    <Receipt size={14} className="text-cyan-400" />
                    {sale.invoiceNumber || 'فاتورة نقدية'}
                  </span>
                  {sale.branchName && (
                    <span
                      className="text-[9px] px-2 py-0.5 rounded-md font-bold"
                      style={{
                        backgroundColor: `${sale.branchColor || '#38bdf8'}20`,
                        color: sale.branchColor || '#38bdf8',
                      }}
                    >
                      {sale.branchName}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                  <Clock size={11} />
                  <span>{formatTimeAgo(sale.date)}</span>
                </div>
              </div>

              {/* Items summary */}
              <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-850 space-y-1">
                {sale.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-slate-300">
                    <div className="truncate flex-1 pl-2">
                      <span>{item.name}</span>
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

              {/* Footer */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <User size={12} />
                    {sale.customerName || 'عميل نقدي'}
                  </span>
                  <span>•</span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {sale.paymentMethod || 'كاش'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 font-mono">
                  <span className="text-sm font-black text-white">
                    {formatCurrency(sale.finalTotal, hideAmounts)}
                  </span>
                  <ChevronLeft size={14} className="text-slate-500" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
