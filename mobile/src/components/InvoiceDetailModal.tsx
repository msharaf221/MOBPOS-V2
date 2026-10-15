import React, { useState } from 'react';
import {
  X,
  Receipt,
  User,
  Clock,
  Share2,
  Check,
  Coins,
  CreditCard,
  Building2,
} from 'lucide-react';
import type { SaleRecord } from '../types';
import { formatCurrency, formatTimeAgo } from '../utils/format';

interface InvoiceDetailModalProps {
  sale: SaleRecord | null;
  isOpen: boolean;
  onClose: () => void;
  hideAmounts: boolean;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  sale,
  isOpen,
  onClose,
  hideAmounts,
}) => {
  if (!isOpen || !sale) return null;

  const [copied, setCopied] = useState(false);

  const generateShareText = () => {
    let text = `🧾 *فاتورة مبيعات — ${sale.branchName || 'محل الموبايلات'}*\n`;
    text += `رقم الفاتورة: ${sale.invoiceNumber || 'نقدي'}\n`;
    text += `التاريخ: ${new Date(sale.date).toLocaleString('ar-EG')}\n`;
    text += `العميل: ${sale.customerName || 'عميل نقدي'}\n`;
    text += `الكاشير: ${sale.cashierName || 'الفرع'}\n`;
    text += `------------------------------\n`;
    sale.items.forEach((item, idx) => {
      text += `${idx + 1}. *${item.name}*\n`;
      if (item.imei) text += `   سيريال: ${item.imei}\n`;
      text += `   الكمية: ${item.quantity} × ${formatCurrency(item.price, hideAmounts)}\n`;
    });
    text += `------------------------------\n`;
    text += `الإجمالي: *${formatCurrency(sale.finalTotal, hideAmounts)}*\n`;
    text += `طريقة الدفع: ${sale.paymentMethod || 'نقدي'}\n`;
    text += `\nشكراً لتعاملكم معنا! 🌟`;
    return text;
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(generateShareText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generateShareText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('تم النسخ بنجاح');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
              <Receipt size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white font-mono">
                  {sale.invoiceNumber || 'فاتورة نقدية'}
                </h3>
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
              <p className="text-[10px] text-slate-400 font-mono">
                {formatTimeAgo(sale.date)} • {new Date(sale.date).toLocaleDateString('ar-EG')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-850/80 border border-slate-750/60">
            <span className="text-[10px] text-slate-400 block mb-0.5">العميل:</span>
            <strong className="text-white block truncate">{sale.customerName || 'عميل نقدي'}</strong>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-850/80 border border-slate-750/60">
            <span className="text-[10px] text-slate-400 block mb-0.5">الكاشير المسؤول:</span>
            <strong className="text-white block truncate">{sale.cashierName || 'كاشير المحل'}</strong>
          </div>
        </div>

        {/* Items List */}
        <div className="space-y-1.5">
          <div className="text-xs font-bold text-slate-300">بنود الفاتورة:</div>
          <div className="bg-slate-950 rounded-2xl p-3 border border-slate-800 space-y-2">
            {sale.items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between gap-2 pb-2 border-b border-slate-850/60 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {item.name}
                  </div>
                  {item.imei && (
                    <div className="text-[10px] text-cyan-400 font-mono mt-0.5">
                      سيريال IMEI: {item.imei}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                    الكمية: {item.quantity}
                  </div>
                </div>

                <div className="text-left font-mono shrink-0">
                  <div className="text-xs font-bold text-white">
                    {formatCurrency(item.price * item.quantity, hideAmounts)}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {formatCurrency(item.price, hideAmounts)} / ق
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals Breakdown */}
        <div className="p-3.5 rounded-2xl bg-slate-850 border border-slate-750 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span>طريقة الدفع:</span>
            <span className="text-white font-bold">{sale.paymentMethod || 'نقدي (كاش)'}</span>
          </div>

          {sale.discount ? (
            <div className="flex items-center justify-between text-slate-400">
              <span>الخصم الممنوح:</span>
              <span className="text-rose-400 font-mono font-bold">- {formatCurrency(sale.discount, hideAmounts)}</span>
            </div>
          ) : null}

          <div className="pt-2 border-t border-slate-750 flex items-center justify-between">
            <span className="font-bold text-white">صافي الفاتورة:</span>
            <span className="text-base font-black text-cyan-400 font-mono">
              {formatCurrency(sale.finalTotal, hideAmounts)}
            </span>
          </div>

          {sale.profit !== undefined && !hideAmounts && (
            <div className="pt-1.5 border-t border-slate-750 flex items-center justify-between text-[11px] text-emerald-400 font-bold">
              <span className="flex items-center gap-1">
                <Coins size={13} />
                هامش ربح الفاتورة:
              </span>
              <span className="font-mono">+{formatCurrency(sale.profit, hideAmounts)}</span>
            </div>
          )}
        </div>

        {/* Share & Actions */}
        <div className="pt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
          >
            <Share2 size={14} />
            <span>إرسال واتساب للعميل</span>
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1 transition"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Receipt size={14} />}
            <span>{copied ? 'تم النسخ' : 'نسخ الفاتورة'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
