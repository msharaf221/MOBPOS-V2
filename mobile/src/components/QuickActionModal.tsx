import React, { useState } from 'react';
import {
  X,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  PackagePlus,
  Camera,
  Check,
  AlertCircle,
} from 'lucide-react';
import type { BranchConfig, BranchMetrics, Safe, InventoryItem } from '../types';
import { formatCurrency } from '../utils/format';
import { playCashRegister, triggerHaptic } from '../utils/sound';
import { multiBranchManager } from '../services/MultiBranchManager';
import { CameraScannerModal } from './CameraScannerModal';

interface QuickActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: BranchMetrics;
  branches: BranchConfig[];
  selectedBranchId: string;
  hideAmounts: boolean;
  onSuccess: () => void;
}

type ActionMode = 'expense' | 'deposit' | 'product';

export const QuickActionModal: React.FC<QuickActionModalProps> = ({
  isOpen,
  onClose,
  metrics,
  branches,
  selectedBranchId,
  hideAmounts,
  onSuccess,
}) => {
  const [mode, setMode] = useState<ActionMode>('expense');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Expense / Deposit form
  const [amount, setAmount] = useState<string>('');
  const [selectedSafeId, setSelectedSafeId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [category, setCategory] = useState<string>('مصروفات نثرية');

  // Product form
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodBarcode, setProdBarcode] = useState('');
  const [prodSellPrice, setProdSellPrice] = useState('');
  const [prodCostPrice, setProdCostPrice] = useState('');
  const [prodQty, setProdQty] = useState('1');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const activeBranch = branches.find(b => b.id === selectedBranchId) || branches[0];

  if (!isOpen) return null;

  const handleExpenseOrDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setErrorMessage('يرجى إدخال مبلغ صحيح');
      return;
    }
    if (!activeBranch) {
      setErrorMessage('يرجى تحديد فرع أولاً');
      return;
    }

    const safe = selectedSafeId
      ? metrics.safesList.find(s => s.id === selectedSafeId)
      : metrics.safesList[0];

    if (!safe) {
      setErrorMessage('لا توجد خزن أو محافظ متاحة للفرع');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await multiBranchManager.submitTransaction(activeBranch, {
        type: mode === 'expense' ? 'expense' : 'deposit',
        amount: Number(amount),
        safe,
        description: description.trim() || (mode === 'expense' ? 'مصروف عام' : 'إيداع نقدي'),
        category: category.trim(),
        userName: 'تطبيق الموبايل',
      });

      if (!res.success) {
        throw new Error(res.error || 'تعذر إتمام العملية');
      }

      playCashRegister();
      triggerHaptic('success');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[QuickAction] Error:', err);
      setErrorMessage(err.message || 'حدث خطأ أثناء حفظ الحركة');
      triggerHaptic('warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim()) {
      setErrorMessage('يرجى كتابة اسم المنتج');
      return;
    }
    if (!activeBranch) {
      setErrorMessage('يرجى تحديد فرع أولاً');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const newItem: InventoryItem = {
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: prodName.trim(),
        category: prodCategory.trim() || 'عام',
        barcode: prodBarcode.trim() || undefined,
        sellPrice: Number(prodSellPrice) || 0,
        costPrice: Number(prodCostPrice) || 0,
        quantity: Number(prodQty) || 1,
        minQuantity: 2,
        branchId: activeBranch.id,
        branchName: activeBranch.name,
      };

      const res = await multiBranchManager.submitInventoryItem(activeBranch, newItem);
      if (!res.success) {
        throw new Error(res.error || 'تعذر حفظ المنتج');
      }

      playCashRegister();
      triggerHaptic('success');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[QuickAction] Product Error:', err);
      setErrorMessage(err.message || 'حدث خطأ أثناء حفظ المنتج');
      triggerHaptic('warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-750 rounded-3xl p-5 space-y-4 shadow-2xl text-xs max-h-[90vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>إجراء سريع</span>
            {activeBranch && (
              <span className="text-[10px] text-cyan-400 font-mono">({activeBranch.name})</span>
            )}
          </h3>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-2xl border border-white/[0.06]">
          <button
            type="button"
            onClick={() => {
              setMode('expense');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
              mode === 'expense'
                ? 'bg-rose-500 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowUpRight size={13} />
            <span>مصروف</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('deposit');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
              mode === 'deposit'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowDownLeft size={13} />
            <span>إيداع</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('product');
              setErrorMessage(null);
            }}
            className={`py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
              mode === 'product'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <PackagePlus size={13} />
            <span>صنف سريع</span>
          </button>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Mode: Expense or Deposit */}
        {(mode === 'expense' || mode === 'deposit') && (
          <form onSubmit={handleExpenseOrDepositSubmit} className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">المبلغ (ج.م):</label>
              <input
                type="number"
                step="any"
                required
                autoFocus
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/[0.1] text-base font-black font-mono text-center text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">
                {mode === 'expense' ? 'الخزينة المخصوم منها:' : 'الخزينة المودع فيها:'}
              </label>
              <select
                value={selectedSafeId}
                onChange={e => setSelectedSafeId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                {metrics.safesList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatCurrency(s.balance, hideAmounts)})
                  </option>
                ))}
              </select>
            </div>

            {mode === 'expense' && (
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">بند المصروف:</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="مصروفات نثرية">نثريات وشاي ومأكولات ☕</option>
                  <option value="كهرباء وإنترنت">فواتير كهرباء وإنترنت 💡</option>
                  <option value="إيجار">إيجار المحل 🏢</option>
                  <option value="رواتب وسلف">سلف ومستحقات موظفين 👥</option>
                  <option value="صيانة ومعدات">صيانة وعدد 🛠️</option>
                  <option value="أخرى">أخرى 📝</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">البيان / ملاحظات:</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={mode === 'expense' ? 'مثال: شراء لمبات وشاي للكاشير' : 'مثال: توريد نقدية من صاحب المحل'}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 rounded-xl font-bold text-xs transition active:scale-95 shadow-lg flex items-center justify-center gap-1.5 ${
                mode === 'expense'
                  ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              <span>{isSubmitting ? 'جارٍ الحفظ...' : mode === 'expense' ? 'تأكيد تسجيل المصروف' : 'تأكيد الإيداع'}</span>
            </button>
          </form>
        )}

        {/* Mode: Quick Product Addition */}
        {mode === 'product' && (
          <form onSubmit={handleProductSubmit} className="space-y-2.5">
            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">اسم المنتج:</label>
              <input
                type="text"
                required
                value={prodName}
                onChange={e => setProdName(e.target.value)}
                placeholder="مثال: شاحن أنكر 20W أصلي"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">القسم:</label>
                <input
                  type="text"
                  value={prodCategory}
                  onChange={e => setProdCategory(e.target.value)}
                  placeholder="شواحن، سماعات..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">الكمية الأولية:</label>
                <input
                  type="number"
                  min="1"
                  value={prodQty}
                  onChange={e => setProdQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white text-center font-mono font-bold focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">الباركود:</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={prodBarcode}
                  onChange={e => setProdBarcode(e.target.value)}
                  placeholder="رقم الباركود..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/30"
                  title="مسح بالكاميرا"
                >
                  <Camera size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">سعر البيع (ج.م):</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={prodSellPrice}
                  onChange={e => setProdSellPrice(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white font-mono font-bold text-center focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">سعر التكلفة (ج.م):</label>
                <input
                  type="number"
                  step="any"
                  value={prodCostPrice}
                  onChange={e => setProdCostPrice(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/[0.1] text-xs text-white font-mono text-center focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition active:scale-95 shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-1.5"
            >
              <span>{isSubmitting ? 'جارٍ إضافة المنتج...' : 'حفظ المنتج وإدراجه بالمخزن'}</span>
            </button>
          </form>
        )}

        {/* Camera Scanner Modal for Barcode */}
        <CameraScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={code => setProdBarcode(code)}
        />
      </div>
    </div>
  );
};
