import React from 'react';
import {
  X,
  Users,
  Phone,
  MessageCircle,
  AlertCircle,
} from 'lucide-react';
import type { Customer } from '../types';
import { formatCurrency } from '../utils/format';

interface DebtsModalProps {
  customers: Customer[];
  isOpen: boolean;
  onClose: () => void;
  hideAmounts: boolean;
}

export const DebtsModal: React.FC<DebtsModalProps> = ({
  customers,
  isOpen,
  onClose,
  hideAmounts,
}) => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
              <Users size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">العملاء والديون الآجلة بالسوق</h3>
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
              <div key={cust.id} className="p-3.5 rounded-2xl glass-card flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">{cust.name}</h4>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {cust.phone} {cust.branchName && `• ${cust.branchName}`}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-left font-mono">
                    <span className="text-xs font-black text-rose-400 block">
                      {formatCurrency(cust.balance, hideAmounts)}
                    </span>
                    <span className="text-[9px] text-slate-500 block">مستحق</span>
                  </div>

                  {cust.phone && (
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={`tel:${cust.phone}`}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 transition"
                        title="اتصال هاتفي"
                      >
                        <Phone size={13} />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleWhatsApp(cust.phone, cust.name, cust.balance)}
                        className="p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 transition"
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
    </div>
  );
};
