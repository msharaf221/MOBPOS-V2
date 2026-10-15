import React, { useState } from 'react';
import {
  Building2,
  ChevronDown,
  Eye,
  EyeOff,
  RefreshCw,
  Zap,
  Plus,
} from 'lucide-react';
import type { BranchConfig } from '../types';

interface HeaderProps {
  branches: BranchConfig[];
  selectedBranchId: string; // 'all' or branch id
  onSelectBranch: (id: string) => void;
  onOpenAddBranch: () => void;
  hideAmounts: boolean;
  onToggleHideAmounts: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  lastSyncedAt?: string;
}

export const Header: React.FC<HeaderProps> = ({
  branches,
  selectedBranchId,
  onSelectBranch,
  onOpenAddBranch,
  hideAmounts,
  onToggleHideAmounts,
  isRefreshing,
  onRefresh,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedBranch = selectedBranchId === 'all'
    ? null
    : branches.find(b => b.id === selectedBranchId);

  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 safe-top px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between gap-2">
        {/* Branch Switcher Button */}
        <div className="relative flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-1.5 pr-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-750/70 text-right transition-all w-full max-w-[260px] shadow-sm active:scale-98"
          >
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-inner"
              style={{
                backgroundColor: selectedBranch ? `${selectedBranch.color}20` : 'rgba(56, 189, 248, 0.15)',
                color: selectedBranch ? selectedBranch.color : '#38bdf8',
                border: `1px solid ${selectedBranch ? selectedBranch.color : '#38bdf8'}40`,
              }}
            >
              <Building2 size={15} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-slate-400 flex items-center gap-1 leading-tight">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{selectedBranchId === 'all' ? 'مجمع الفروع' : (selectedBranch?.city || 'فرع مستقل')}</span>
              </div>
              <div className="text-xs font-bold text-white truncate leading-normal">
                {selectedBranchId === 'all' ? 'جميع الفروع (شامل)' : selectedBranch?.name}
              </div>
            </div>

            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 shrink-0 ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute top-full right-0 mt-2 w-72 bg-slate-900 border border-slate-750 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-[11px] font-bold text-slate-400 px-3 py-1.5 mb-1">
                  اختر الفرع المراد متابعته:
                </div>

                {/* Option: All Branches */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectBranch('all');
                    setDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition ${
                    selectedBranchId === 'all'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                    <span>جميع الفروع مجمعة (الكل)</span>
                  </div>
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded-md text-slate-400">
                    {branches.filter(b => b.enabled).length} فروع
                  </span>
                </button>

                <div className="my-1.5 border-t border-slate-800" />

                {/* Individual Branches */}
                <div className="space-y-1 max-h-56 overflow-y-auto no-scrollbar">
                  {branches.map(branch => (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => {
                        onSelectBranch(branch.id);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-medium transition ${
                        selectedBranchId === branch.id
                          ? 'bg-slate-800 text-white font-bold border border-slate-700'
                          : 'text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: branch.color }}
                        />
                        <div className="truncate text-right">
                          <span className="block truncate">{branch.name}</span>
                          {branch.city && (
                            <span className="text-[10px] text-slate-500 block truncate">{branch.city}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {branch.enabled ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" title="نشط" />
                        ) : (
                          <span className="text-[10px] text-slate-500">معطل</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenAddBranch();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-sky-400 text-xs font-bold transition"
                  >
                    <Plus size={14} />
                    <span>إضافة فرع أو محل جديد</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Tools (Privacy Eye & Refresh) */}
        <div className="flex items-center gap-1.5">
          {/* Privacy Eye Toggle */}
          <button
            type="button"
            onClick={onToggleHideAmounts}
            aria-label="إخفاء الأرقام الحساسة"
            title={hideAmounts ? 'إظهار الأرقام والأرباح' : 'إخفاء الأرقام والأرباح (وضع الخصوصية)'}
            className={`p-2 rounded-xl border transition ${
              hideAmounts
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {hideAmounts ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="تحديث البيانات لحظياً"
            title="تحديث البيانات"
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin text-sky-400' : ''} />
          </button>
        </div>
      </div>
    </header>
  );
};
