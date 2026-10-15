import React, { useState, useMemo } from 'react';
import {
  Wallet,
  Building,
  Smartphone,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  User,
  ShieldCheck,
  Search,
} from 'lucide-react';
import type { Safe, Transaction } from '../types';
import { formatCurrency, formatTimeAgo } from '../utils/format';

interface SafesTabProps {
  safes: Safe[];
  transactions: Transaction[];
  hideAmounts: boolean;
}

export const SafesTab: React.FC<SafesTabProps> = ({
  safes,
  transactions,
  hideAmounts,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const totalBalance = useMemo(() => {
    return safes.reduce((acc, s) => acc + (Number(s.balance) || 0), 0);
  }, [safes]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filterType === 'expense' && t.type !== 'expense' && t.type !== 'withdrawal') return false;
      if (filterType === 'income' && t.type !== 'sale' && t.type !== 'deposit') return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.description.toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q) ||
        (t.userName || '').toLowerCase().includes(q)
      );
    });
  }, [transactions, filterType, searchQuery]);

  return (
    <div className="space-y-4 pb-24">
      {/* Total Liquid Cash Header Card */}
      <div className="p-4 rounded-3xl glass-panel relative overflow-hidden">
        <div className="flex items-center justify-between mb-1 text-slate-300 text-xs font-bold">
          <span className="flex items-center gap-1.5">
            <Wallet size={16} className="text-amber-400" />
            إجمالي السيولة النقدية المتاحة
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {safes.length} خزائن / أدراج
          </span>
        </div>

        <div className="text-3xl font-black text-white font-mono mt-2 tracking-tight">
          {formatCurrency(totalBalance, hideAmounts)}
        </div>

        <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
          <ShieldCheck size={13} className="text-emerald-400" />
          <span>مجموع أرصدة الأدراج والخزائن والمحافظ لجميع الفروع المختارة</span>
        </p>
      </div>

      {/* Safes Breakdown Grid */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-300 px-1">
          أرصدة الخزائن والأدراج بالتفصيل:
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {safes.map(safe => {
            const isWallet = safe.type === 'wallet';
            const isBank = safe.type === 'bank';
            return (
              <div
                key={safe.id}
                className="p-3.5 rounded-2xl glass-card flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isWallet
                        ? 'bg-rose-500/15 text-rose-400'
                        : isBank
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    {isWallet ? <Smartphone size={17} /> : isBank ? <Building size={17} /> : <Wallet size={17} />}
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {safe.name}
                    </div>
                    {safe.branchName && (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {safe.branchName}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-left font-mono">
                  <span className="text-sm font-bold text-white block">
                    {formatCurrency(safe.balance, hideAmounts)}
                  </span>
                  <span className="text-[9px] text-slate-500">
                    {isWallet ? 'محفظة إلكترونية' : isBank ? 'حساب بنكي' : 'كاش نقدي'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Cash Flow Transactions */}
      <div className="space-y-2.5 pt-2">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="font-bold text-slate-200">سجل حركات الصندوق والمصروفات</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                filterType === 'all' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              الكل
            </button>
            <button
              type="button"
              onClick={() => setFilterType('expense')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                filterType === 'expense' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              مصروفات
            </button>
            <button
              type="button"
              onClick={() => setFilterType('income')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                filterType === 'income' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              إيرادات
            </button>
          </div>
        </div>

        {/* Search inside transactions */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث في المصروفات أو أسماء المستلمين..."
            className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-900 border border-slate-750 text-white placeholder-slate-500 text-xs focus:outline-none"
          />
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
        </div>

        <div className="space-y-2">
          {filteredTransactions.map(tx => {
            const isOut = tx.type === 'expense' || tx.type === 'withdrawal' || tx.type === 'purchase';
            return (
              <div
                key={tx.id}
                className="p-3 rounded-2xl glass-card flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isOut ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'
                    }`}
                  >
                    {isOut ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {tx.description || (isOut ? 'مصروف نقدي' : 'إيراد نقدي')}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      {tx.safeName && <span>{tx.safeName}</span>}
                      {tx.category && (
                        <>
                          <span>•</span>
                          <span className="text-cyan-400/80">{tx.category}</span>
                        </>
                      )}
                      {tx.userName && (
                        <>
                          <span>•</span>
                          <span>بواسطة: {tx.userName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-left font-mono shrink-0">
                  <span
                    className={`text-xs font-bold block ${
                      isOut ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {isOut ? '-' : '+'} {formatCurrency(tx.amount, hideAmounts)}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {formatTimeAgo(tx.date)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
