import React, { useState, useMemo } from 'react';
import {
  Search,
  Package,
  AlertTriangle,
  Smartphone,
  CheckCircle2,
  Tag,
  Building2,
} from 'lucide-react';
import type { InventoryItem } from '../types';
import { formatCurrency, formatNumber } from '../utils/format';

interface InventoryTabProps {
  inventory: InventoryItem[];
  hideAmounts: boolean;
}

export const InventoryTab: React.FC<InventoryTabProps> = ({
  inventory,
  hideAmounts,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'lowStock' | 'imei'>('all');

  const filteredItems = useMemo(() => {
    return inventory.filter(item => {
      const isLow = (item.quantity || 0) <= (item.minQuantity || 2);
      if (filterMode === 'lowStock' && !isLow) return false;
      if (filterMode === 'imei' && !item.hasImei) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchCat = (item.category || '').toLowerCase().includes(q);
      const matchBarcode = (item.barcode || '').includes(q);
      return matchName || matchCat || matchBarcode;
    });
  }, [inventory, filterMode, searchQuery]);

  // Aggregate items with identical names across branches for multi-branch view
  const groupedByName = useMemo(() => {
    const map = new Map<string, { totalQty: number; branches: { name: string; qty: number; price: number }[]; item: InventoryItem }>();
    inventory.forEach(item => {
      const key = item.name.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          totalQty: 0,
          branches: [],
          item,
        });
      }
      const entry = map.get(key)!;
      entry.totalQty += item.quantity || 0;
      entry.branches.push({
        name: item.branchName || 'الفرع',
        qty: item.quantity || 0,
        price: item.sellPrice,
      });
    });
    return map;
  }, [inventory]);

  return (
    <div className="space-y-3.5 pb-28 animate-in fade-in duration-200">
      {/* Search Input with clear button */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="ابحث عن موبايل، إكسسوار، سيريال، باركود..."
          className="w-full pr-10 pl-10 py-3.5 rounded-2xl bg-slate-900/90 border border-white/[0.08] text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500/50 shadow-lg font-sans transition"
        />
        <Search size={17} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
          >
            <span className="text-xs">✕</span>
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
        {[
          { id: 'all', label: `جميع البضاعة (${inventory.length})` },
          { id: 'lowStock', label: 'نواقص البضاعة فقط ⚠️' },
          { id: 'imei', label: 'أجهزة بسيريال (IMEI) 📱' },
        ].map(filter => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setFilterMode(filter.id as any)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-bold transition-all text-xs flex items-center gap-1.5 active:scale-95 ${
              filterMode === filter.id
                ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-slate-950 shadow-md shadow-cyan-500/25'
                : 'bg-slate-900/80 border border-white/[0.06] text-slate-400 hover:text-white'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Inventory List */}
      {filteredItems.length === 0 ? (
        <div className="py-14 text-center text-slate-500 text-xs glass-card rounded-3xl space-y-2 border border-white/[0.05]">
          <Package size={32} className="mx-auto text-slate-600 stroke-[1.5]" />
          <p className="font-bold text-slate-400">لا توجد أصناف مطابقة للبحث الحالي</p>
          <p className="text-[10px] text-slate-500">جرب كتابة اسم مختلف أو إزالة الفلترة</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map(item => {
            const isLow = (item.quantity || 0) <= (item.minQuantity || 2);
            const isOut = (item.quantity || 0) <= 0;
            const groupInfo = groupedByName.get(item.name.trim().toLowerCase());
            const profitPerPiece = (Number(item.sellPrice) || 0) - (Number(item.costPrice) || 0);

            return (
              <div
                key={item.id}
                className={`p-4 rounded-3xl glass-card space-y-3 transition-all border shadow-sm ${
                  isOut
                    ? 'border-rose-500/40 bg-rose-950/20'
                    : isLow
                    ? 'border-amber-500/35 bg-amber-950/15'
                    : 'border-white/[0.06] hover:border-cyan-500/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
                        item.hasImei
                          ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25'
                          : 'bg-slate-800/80 text-slate-300 border border-white/[0.06]'
                      }`}
                    >
                      {item.hasImei ? <Smartphone size={18} /> : <Package size={18} />}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {item.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 flex-wrap">
                        {item.category && <span className="bg-slate-800 px-1.5 py-0.2 rounded text-slate-300">{item.category}</span>}
                        {item.branchName && (
                          <span className="text-cyan-400 font-medium">📍 {item.branchName}</span>
                        )}
                        {item.barcode && (
                          <span className="font-mono text-slate-500">[{item.barcode}]</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-xl font-mono font-black block shadow-sm ${
                        isOut
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                          : isLow
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {isOut ? 'نفدت الكمية!' : `الكمية: ${item.quantity}`}
                    </span>
                    <span className="text-[10px] text-slate-500 block font-mono mt-0.5">
                      حد أدنى: {item.minQuantity || 2}
                    </span>
                  </div>
                </div>

                {/* Pricing & Stock Details */}
                <div className="pt-2 border-t border-slate-850 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-[10px] text-slate-500 block">سعر البيع:</span>
                      <strong className="text-cyan-400 font-mono">{formatCurrency(item.sellPrice, hideAmounts)}</strong>
                    </div>
                    {item.costPrice !== undefined && (
                      <div>
                        <span className="text-[10px] text-slate-500 block">سعر التكلفة:</span>
                        <strong className="text-slate-400 font-mono">{formatCurrency(item.costPrice, hideAmounts)}</strong>
                      </div>
                    )}
                  </div>

                  {/* Multi-Branch stock breakdown badge if present across multiple branches */}
                  {groupInfo && groupInfo.branches.length > 1 && (
                    <div className="text-[10px] text-slate-400 bg-slate-900 px-2 py-1 rounded-lg border border-slate-750 flex items-center gap-1 font-mono">
                      <Building2 size={12} className="text-cyan-400" />
                      <span>متوفر بـ {groupInfo.branches.length} فروع (إجمالي {groupInfo.totalQty})</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
