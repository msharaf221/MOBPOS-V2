import React, { useState } from 'react';
import {
  X,
  Users,
  Phone,
  MessageCircle,
  Coins,
  Check,
  AlertCircle,
} from 'lucide-react';
import type { BranchConfig, Customer, Safe } from '../types';
import { formatCurrency } from '../utils/format';
import { playCashRegister, triggerHaptic } from '../utils/sound';
import { multiBranchManager } from '../services/MultiBranchManager';

interface DebtsModalProps {
  customers: Customer[];
  isOpen: boolean;
  onClose: () => void;
  hideAmounts: boolean;
  branches: BranchConfig[];
  selectedBranchId: string;
  safesList: Safe[];
  onRefresh: () => void;
}

export const DebtsModal: React.FC<DebtsModalProps> = ({
  customers,
  isOpen,
  onClose,
  hideAmounts,
  branches,
  selectedBranchId,
  safesList,
  onRefresh,
}) => {
  const [collectingCust, setCollectingCust] = useState<Customer | null>(null);
  const [collectAmount, setCollectAmount] = useState<string>('');
  const [targetSafeId, setTargetSafeId] = useState<string>(safesList[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeBranch = branches.find(b => b.id === selectedBranchId) || branches[0];

  if (!isOpen) return null;

  const debtCustomers = customers.filter(c => (Number(c.balance) || 0) > 0);
  const totalDebt = debtCustomers.reduce((acc, c) => acc + Number(c.balance), 0);

  const handleWhatsApp = (phone: string, name: string, balance: number) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('0') ? `2${cleanPhone}` : cleanPhone;
    const msg = encodeURIComponent(
      `مرحباً أ/ ${name}، نود تذكير سيادتكم بوجود رصيد آجل مستحق بقيمة (${formatCurrency(balance)}) لدى المحل. شاكرين ومقدرين حسن تعاونكم معنا!`
    );
    window.open(`https://wa.me/${formattedPhone}?text=${msg}`, '_blank');
  };

  const handleConfirmCollection = async () => {
    if (!collectingCust || !activeBranch) return;
    const amountVal = Number(collectAmount) || 0;
    if (amountVal <= 0) {
      alert('يرجى إدخال مبلغ تحصيل صحيح');
      return;
    }

    const safe = safesList.find(s => s.id === targetSafeId) || safesList[0];
    if (!safe) {
      alert('لا توجد خزينة لاستلام النقدية');
      return;
    }

    setIsSubmitting(true);
    try {
      const newCustomerBalance = Math.max(0, (Number(collectingCust.balance) || 0) - amountVal);
      const newSafeBalance = (Number(safe.balance) || 0) + amountVal;
      const txId = `tx_debt_${Date.now()}`;
      const nowIso = new Date().toISOString();

      const records = [
        {
          store: 'customers',
          recordId: collectingCust.id,
          data: {
            ...collectingCust,
            balance: newCustomerBalance,
          },
        },
        {
          store: 'safes',
          recordId: safe.id,
          data: {
            ...safe,
            balance: newSafeBalance,
          },
        },
        {
          store: 'transactions',
          recordId: txId,
          data: {
            id: txId,
            type: 'customer_payment',
            amount: amountVal,
            safeId: safe.id,
            safeName: safe.name,
            description: `سداد آجل من العميل ${collectingCust.name}`,
            category: 'سداد ديون',
            date: nowIso,
            userName: 'تطبيق الموبايل',
            branchId: activeBranch.id,
            branchName: activeBranch.name,
          },
        },
      ];

      const res = await multiBranchManager.pushRecordsToBranch(activeBranch, records);
      if (!res.success) {
        throw new Error(res.error || 'تعذر تسجيل السداد');
      }

      playCashRegister();
      triggerHaptic('success');
      setCollectingCust(null);
      setCollectAmount('');
      onRefresh();
    } catch (e: any) {
      alert(e.message || 'حدث خطأ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
              <Users size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">العملاء والديون والتحصيل</h3>
              <p className="text-[10px] text-slate-400">
                إجمالي ديون السوق: <strong className="text-sky-300 font-mono">{formatCurrency(totalDebt, hideAmounts)}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* List of Customers with Debt */}
        <div className="space-y-2.5">
          {debtCustomers.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              لا توجد ديون مستحقة على العملاء 🎉
            </div>
          ) : (
            debtCustomers.map(cust => (
              <div key={cust.id} className="p-3.5 rounded-2xl glass-card space-y-2 border border-white/[0.07]">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white truncate">{cust.name}</h4>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {cust.phone} {cust.branchName && `• ${cust.branchName}`}
                    </div>
                  </div>

                  <div className="text-left font-mono">
                    <span className="text-xs font-black text-rose-400 block">
                      {formatCurrency(cust.balance, hideAmounts)}
                    </span>
                    <span className="text-[9px] text-slate-500 block">مستحق</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => {
                      setCollectingCust(cust);
                      setCollectAmount(String(cust.balance || ''));
                    }}
                    className="flex-1 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[11px] transition flex items-center justify-center gap-1"
                  >
                    <Coins size={13} />
                    <span>تحصيل دفعة 💵</span>
                  </button>

                  {cust.phone && (
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={`tel:${cust.phone}`}
                        className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 transition"
                        title="اتصال هاتفي"
                      >
                        <Phone size={13} />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleWhatsApp(cust.phone, cust.name, cust.balance)}
                        className="p-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 transition"
                        title="إرسال تذكير عبر واتساب"
                      >
                        <MessageCircle size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Collect Modal */}
      {collectingCust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-750 rounded-3xl p-5 space-y-3.5 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <h4 className="font-bold text-white text-xs">تحصيل دفعة نقدية من الحساب</h4>
              <button
                type="button"
                onClick={() => setCollectingCust(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>

            <div>
              <span className="text-slate-400 block text-[11px]">العميل:</span>
              <strong className="text-white text-sm">{collectingCust.name}</strong>
              <span className="text-rose-400 font-mono block text-xs mt-0.5">
                إجمالي الدين المستحق: {formatCurrency(collectingCust.balance, hideAmounts)}
              </span>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">المبلغ المحصل (ج.م):</label>
              <input
                type="number"
                step="any"
                required
                autoFocus
                value={collectAmount}
                onChange={e => setCollectAmount(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/[0.1] text-base font-black font-mono text-center text-emerald-400 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">الخزينة المودع فيها المبلغ:</label>
              <select
                value={targetSafeId}
                onChange={e => setTargetSafeId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white"
              >
                {safesList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatCurrency(s.balance, hideAmounts)})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmCollection}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold transition shadow"
              >
                {isSubmitting ? 'جارٍ الحفظ...' : 'تأكيد استلام المبلغ'}
              </button>
              <button
                type="button"
                onClick={() => setCollectingCust(null)}
                className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-400"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
