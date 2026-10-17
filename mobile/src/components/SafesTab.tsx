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
  onOpenQuickAction?: () => void;
}

export const SafesTab: React.FC<SafesTabProps> = ({
  safes,
  transactions,
  hideAmounts,
  onOpenQuickAction,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const totalBalance = useMemo(() => {
    return safes.reduce((acc, s) => acc + (Number(s.balance) || 0), 0);
  }, [safes]);

  const isOutflowType = (type: string) =>
    type === 'expense' ||
    type === 'withdrawal' ||
    type === 'wallet_withdrawal' ||
    type === 'purchase' ||
    type === 'maintenance_cost' ||
    type === 'waste' ||
    type === 'return' ||
    type === 'sale_return';

  const isInflowType = (type: string) =>
    type === 'sale' ||
    type === 'deposit' ||
    type === 'wallet_deposit' ||
    type === 'income' ||
    type === 'customer_payment' ||
    type === 'maintenance' ||
    type === 'capital';

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filterType === 'expense' && !isOutflowType(t.type)) return false;
      if (filterType === 'income' && !isInflowType(t.type)) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.description.toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q) ||
        (t.userName || '').toLowerCase().includes(q) ||
        (t.safeName || '').toLowerCase().includes(q)
      );
    });
  }, [transactions, filterType, searchQuery]);

  return (
    <div className="space-y-4 pb-28 animate-in fade-in duration-200">
      {/* Total Liquid Cash Header Card */}
      <div
        className="p-5 rounded-3xl relative overflow-hidden border border-amber-500/25 space-y-3"
        style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.95) 45%, rgba(15, 23, 42, 0.85) 100%)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 40px -15px rgba(245, 158, 11, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        <div className="flex items-center justify-between text-slate-300 text-xs font-bold">
          <span className="flex items-center gap-2 text-amber-300">
            <span className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Wallet size={16} />
            </span>
            <span>إجمالي السيولة النقدية المتاحة</span>
          </span>
          <span className="text-[10px] text-amber-300 font-mono bg-amber-500/15 px-2.5 py-1 rounded-xl border border-amber-500/25">
            {safes.length} خزائن وأدراج
          </span>
        </div>

        <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight drop-shadow-md">
          {formatCurrency(totalBalance, hideAmounts)}
        </div>

        <p className="text-[11px] text-slate-400 pt-1 border-t border-white/[0.08] flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
          <span>مجموع النقدية الحقيقية في أدراج الكاشير والخزائن والمحافظ الإلكترونية</span>
        </p>
      </div>

      {/* Quick Action Button */}
      {onOpenQuickAction && (
        <button
          type="button"
          onClick={onOpenQuickAction}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:opacity-95 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-[0.985] transition flex items-center justify-center gap-2"
        >
          <ArrowDownLeft size={16} />
          <span>تسجيل مصروف أو توريد نقدية 💵</span>
        </button>
      )}

      {/* Safes Breakdown Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300 px-1">
          <span>أرصدة الخزائن والأدراج بالتفصيل:</span>
          <span className="text-[10px] text-slate-500 font-mono">{safes.length} حسابات</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {safes.map(safe => {
            const isWallet = safe.type === 'wallet' || (safe.type as string) === 'ewallet';
            const isBank = safe.type === 'bank';
            const pct = totalBalance > 0 ? Math.round((Number(safe.balance || 0) / totalBalance) * 100) : 0;
            return (
              <div
                key={safe.id}
                className="p-4 rounded-3xl glass-card space-y-2.5 border border-white/[0.06] hover:border-amber-500/30 transition shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
                        isWallet
                          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                          : isBank
                          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                      }`}
                    >
                      {isWallet ? <Smartphone size={18} /> : isBank ? <Building size={18} /> : <Wallet size={18} />}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {safe.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {safe.branchName || 'الفرع'} • {isWallet ? 'محفظة إلكترونية' : isBank ? 'حساب بنكي' : 'درج كاشير'}
                      </div>
                    </div>
                  </div>

                  <div className="text-left font-mono">
                    <span className="text-sm font-black text-white block">
                      {formatCurrency(safe.balance, hideAmounts)}
                    </span>
                    <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.2 rounded">
                      {pct}%
                    </span>
                  </div>
                </div>

                {/* Balance proportion bar */}
                <div className="w-full h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isWallet ? 'bg-rose-500' : isBank ? 'bg-blue-500' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Cash Flow Transactions */}
      <div className="space-y-3 pt-2">
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
            const isOut = isOutflowType(tx.type);
            const txDate = tx.date || (tx as any).createdAt || '';
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
                    {formatTimeAgo(txDate)}
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
