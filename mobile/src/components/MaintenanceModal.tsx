import React, { useState } from 'react';
import {
  X,
  Wrench,
  Phone,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { MaintenanceOrder } from '../types';
import { formatCurrency, formatTimeAgo } from '../utils/format';

interface MaintenanceModalProps {
  orders: MaintenanceOrder[];
  isOpen: boolean;
  onClose: () => void;
  hideAmounts: boolean;
}

export const MaintenanceModal: React.FC<MaintenanceModalProps> = ({
  orders,
  isOpen,
  onClose,
  hideAmounts,
}) => {
  if (!isOpen) return null;

  const [statusFilter, setStatusFilter] = useState<string>('active');

  const filtered = orders.filter(o => {
    if (statusFilter === 'active') return o.status !== 'delivered' && o.status !== 'cancelled';
    if (statusFilter === 'ready') return o.status === 'ready' || (o.status as string) === 'completed';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Wrench size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">متابعة قسم الصيانة الحية</h3>
              <p className="text-[10px] text-slate-400">
                {orders.length} أجهزة مسجلة في الفروع
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

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${
              statusFilter === 'active' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
            }`}
          >
            قيد الفحص والإصلاح
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ready')}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${
              statusFilter === 'ready' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
            }`}
          >
            جاهزة للتسليم
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${
              statusFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            الكل
          </button>
        </div>

        {/* List */}
        <div className="space-y-2.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              لا توجد أجهزة مطابقة
            </div>
          ) : (
            filtered.map(order => (
              <div key={order.id} className="p-3.5 rounded-2xl glass-card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white">{order.deviceModel}</h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      تذكرة: {order.ticketNumber || 'بدون رقم'} {order.branchName && `• ${order.branchName}`}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                      order.status === 'ready' || (order.status as string) === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : order.status === 'delivered'
                        ? 'bg-blue-500/20 text-blue-400'
                        : order.status === 'cancelled'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {order.status === 'ready' || (order.status as string) === 'completed'
                      ? 'جاهز للاستلام ✅'
                      : order.status === 'delivered'
                      ? 'تم التسليم 📦'
                      : order.status === 'cancelled'
                      ? 'ملغاة ❌'
                      : 'قيد الصيانة ⏳'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-300 bg-slate-950/70 p-2 rounded-xl">
                  {order.problem}
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <User size={12} />
                    <span>{order.customerName}</span>
                    {order.customerPhone && (
                      <a
                        href={`tel:${order.customerPhone}`}
                        className="text-cyan-400 hover:underline flex items-center gap-0.5 mr-1"
                      >
                        <Phone size={10} />
                        <span className="font-mono text-[10px]">{order.customerPhone}</span>
                      </a>
                    )}
                  </div>
                  <div className="font-mono font-bold text-cyan-400">
                    {formatCurrency(order.finalPrice || order.expectedPrice || 0, hideAmounts)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
