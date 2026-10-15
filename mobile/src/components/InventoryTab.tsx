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
    <div className="space-y-3 pb-24">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="ابحث عن موبايل، إكسسوار، سيريال، باركود..."
          className="w-full pr-10 pl-4 py-3 rounded-2xl bg-slate-900 border border-slate-750 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500/50 transition font-sans"
        />
        <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
        {[
          { id: 'all', label: `جميع البضاعة (${inventory.length})` },
          { id: 'lowStock', label: 'نواقص البضاعة فقط ⚠️' },
          { id: 'imei', label: 'موبايلات وسيريال (IMEI) 📱' },
        ].map(filter => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setFilterMode(filter.id as any)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-medium transition ${
              filterMode === filter.id
                ? 'bg-cyan-500 text-slate-950 font-bold'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Inventory List */}
      {filteredItems.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs glass-card rounded-2xl">
          لا توجد أصناف مطابقة للبحث الحالي
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map(item => {
            const isLow = (item.quantity || 0) <= (item.minQuantity || 2);
            const isOut = (item.quantity || 0) <= 0;
            const groupInfo = groupedByName.get(item.name.trim().toLowerCase());

            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-2xl glass-card space-y-2.5 transition border ${
                  isOut
                    ? 'border-rose-500/40 bg-rose-950/10'
                    : isLow
                    ? 'border-amber-500/30'
                    : 'border-slate-800/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        item.hasImei
                          ? 'bg-cyan-500/15 text-cyan-400'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.hasImei ? <Smartphone size={17} /> : <Package size={17} />}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {item.name}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        {item.category && <span>{item.category}</span>}
                        {item.branchName && (
                          <>
                            <span>•</span>
                            <span className="text-slate-300 font-medium">{item.branchName}</span>
                          </>
                        )}
                        {item.hasImei && (
                          <span className="px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-400 font-bold">
                            جهاز بسيريال
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-lg font-mono font-bold block ${
                        isOut
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
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
