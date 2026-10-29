import React, { useState } from 'react';
import {
  X,
  Wrench,
  User,
  CheckCircle2,
  Plus,
  Send,
  Coins,
} from 'lucide-react';
import type { BranchConfig, MaintenanceOrder, Safe } from '../types';
import { formatCurrency, formatTimeAgo } from '../utils/format';
import { playCashRegister, triggerHaptic } from '../utils/sound';
import { multiBranchManager } from '../services/MultiBranchManager';

interface MaintenanceModalProps {
  orders: MaintenanceOrder[];
  isOpen: boolean;
  onClose: () => void;
  hideAmounts: boolean;
  branches: BranchConfig[];
  selectedBranchId: string;
  safesList: Safe[];
  onRefresh: () => void;
}

export const MaintenanceModal: React.FC<MaintenanceModalProps> = ({
  orders,
  isOpen,
  onClose,
  hideAmounts,
  branches,
  selectedBranchId,
  safesList,
  onRefresh,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Ticket Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [problem, setProblem] = useState('');
  const [expectedPrice, setExpectedPrice] = useState('');

  // Deliver modal state
  const [deliveringOrder, setDeliveringOrder] = useState<MaintenanceOrder | null>(null);
  const [deliverCollectedAmount, setDeliverCollectedAmount] = useState('');
  const [deliverCostPrice, setDeliverCostPrice] = useState('');
  const [deliveredSafeId, setDeliveredSafeId] = useState<string>(safesList[0]?.id || '');

  const activeBranch = branches.find(b => b.id === selectedBranchId) || branches[0];

  const openDeliverModal = (order: MaintenanceOrder) => {
    setDeliveringOrder(order);
    setDeliverCollectedAmount(String(order.finalPrice || order.expectedPrice || ''));
    setDeliverCostPrice(String(order.costPrice || ''));
    if (!deliveredSafeId && safesList[0]) {
      setDeliveredSafeId(safesList[0].id);
    }
  };

  if (!isOpen) return null;

  const filtered = orders.filter(o => {
    if (statusFilter === 'active') return o.status !== 'delivered' && o.status !== 'cancelled';
    if (statusFilter === 'ready') return o.status === 'ready' || (o.status as string) === 'completed';
    return true;
  });

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceModel.trim() || !problem.trim() || !customerName.trim()) {
      alert('يرجى ملء اسم العميل وموديل الجهاز ووصف العطل');
      return;
    }
    if (!activeBranch) {
      alert('يرجى اختيار فرع أولاً');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const ticketNumber = `MNT-${now.getFullYear().toString().slice(-2)}${Math.floor(1000 + Math.random() * 9000)}`;

      const newOrder: MaintenanceOrder = {
        id: `mnt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ticketNumber,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deviceModel: deviceModel.trim(),
        problem: problem.trim(),
        status: 'received',
        expectedPrice: Number(expectedPrice) || 0,
        receivedDate: now.toISOString(),
        branchId: activeBranch.id,
        branchName: activeBranch.name,
      };

      const res = await multiBranchManager.submitMaintenanceOrder(activeBranch, newOrder);
      if (!res.success) {
        throw new Error(res.error || 'تعذر حفظ تذكرة الصيانة');
      }

      playCashRegister();
      triggerHaptic('success');
      setShowAddForm(false);
      setCustomerName('');
      setCustomerPhone('');
      setDeviceModel('');
      setProblem('');
      setExpectedPrice('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ التذكرة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (order: MaintenanceOrder, newStatus: MaintenanceOrder['status']) => {
    if (!activeBranch) return;
    try {
      const updated: MaintenanceOrder = {
        ...order,
        status: newStatus,
        deliveryDate: newStatus === 'delivered' ? new Date().toISOString() : order.deliveryDate,
      };

      const res = await multiBranchManager.submitMaintenanceOrder(activeBranch, updated);
      if (res.success) {
        triggerHaptic('medium');
        onRefresh();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmDeliver = async () => {
    if (!deliveringOrder || !activeBranch) return;
    const safe = safesList.find(s => s.id === deliveredSafeId) || safesList[0];

    const rawCollected = Number(deliverCollectedAmount);
    const collected = Number.isFinite(rawCollected) && rawCollected >= 0
      ? rawCollected
      : Number(deliveringOrder.finalPrice || deliveringOrder.expectedPrice || 0);

    const rawCost = Number(deliverCostPrice);
    const cost = Number.isFinite(rawCost) && rawCost >= 0
      ? rawCost
      : Number(deliveringOrder.costPrice || 0);

    const profit = Math.max(0, collected - cost);

    if (collected > 0 && !safe) {
      alert('تنبيه: لا توجد خزينة محددة لإيداع المبلغ المحصل، يرجى اختيار خزينة أولاً');
      return;
    }

    try {
      const updated: MaintenanceOrder = {
        ...deliveringOrder,
        status: 'delivered',
        finalPrice: collected,
        collectedAmount: collected,
        costPrice: cost,
        profit,
        deliveryDate: new Date().toISOString(),
        deliveredAt: new Date().toISOString(),
      };

      const res = await multiBranchManager.submitMaintenanceOrder(activeBranch, updated, safe);
      if (!res.success) {
        alert(res.error || 'تعذر تسليم الجهاز');
        return;
      }

      playCashRegister();
      triggerHaptic('success');
      setDeliveringOrder(null);
      onRefresh();
    } catch (e: any) {
      alert(e.message || 'حدث خطأ أثناء تسليم الجهاز');
    }
  };

  const handleSendWhatsApp = (order: MaintenanceOrder) => {
    const phone = (order.customerPhone || '').replace(/\D/g, '');
    const cleanPhone = phone.startsWith('0') ? `2${phone}` : phone;
    let statusText = 'قيد الفحص والإصلاح';
    if (order.status === 'ready') statusText = 'تم الانتهاء وجاهز للاستلام 🎉';
    else if (order.status === 'delivered') statusText = 'تم التسليم بنجاح';

    const msg = `مرحباً أ/ ${order.customerName} 👋\nبخصوص جهازك (${order.deviceModel})\nتذكرة صيانة: #${order.ticketNumber || order.id.slice(0, 8)}\nالحالة: ${statusText}\nالمبلغ المطلوب: ${formatCurrency(order.finalPrice || order.expectedPrice || 0)}\n\nمركز صيانة: ${order.branchName || 'MOBPOS'}`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Wrench size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">إدارة واستلام الصيانة الحية</h3>
              <p className="text-[10px] text-slate-400">
                {orders.length} أجهزة مسجلة في الفرع
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition shadow"
            >
              <Plus size={13} />
              <span>استلام جهاز</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* New Ticket Form Accordion */}
        {showAddForm && (
          <form onSubmit={handleCreateTicket} className="p-3.5 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-2.5 animate-in slide-in-from-top-2 duration-200">
            <div className="font-bold text-amber-400 text-xs flex items-center gap-1.5">
              <Wrench size={14} />
              <span>تسجيل جهاز صيانة جديد بالفرع</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="اسم العميل *"
                className="px-3 py-2 rounded-xl bg-slate-900 border border-white/[0.08] text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
              <input
                type="tel"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="رقم هاتف العميل"
                className="px-3 py-2 rounded-xl bg-slate-900 border border-white/[0.08] text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono text-left"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={deviceModel}
                onChange={e => setDeviceModel(e.target.value)}
                placeholder="موديل الجهاز (مثال: iPhone 13 Pro) *"
                className="px-3 py-2 rounded-xl bg-slate-900 border border-white/[0.08] text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
              <input
                type="number"
                value={expectedPrice}
                onChange={e => setExpectedPrice(e.target.value)}
                placeholder="التكلفة المتوقعة (ج.م)"
                className="px-3 py-2 rounded-xl bg-slate-900 border border-white/[0.08] text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono text-center font-bold"
              />
            </div>

            <input
              type="text"
              required
              value={problem}
              onChange={e => setProblem(e.target.value)}
              placeholder="وصف المشكلة / العطل (مثال: تغيير باغة شاشة وشحن) *"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/[0.08] text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition active:scale-95 shadow"
              >
                {isSubmitting ? 'جارٍ الحفظ...' : 'تأكيد تسجيل التذكرة'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-400"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 text-xs">
          {[
            { id: 'active', label: 'قيد الصيانة ⏳' },
            { id: 'ready', label: 'جاهز للتسليم ✅' },
            { id: 'all', label: `الكل (${orders.length})` },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl font-bold transition ${
                statusFilter === f.id
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="space-y-2.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              لا توجد أجهزة مطابقة في هذا التصنيف
            </div>
          ) : (
            filtered.map(order => (
              <div key={order.id} className="p-3.5 rounded-2xl glass-card space-y-2.5 border border-white/[0.07]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{order.deviceModel}</span>
                      {order.branchName && (
                        <span className="text-[10px] text-slate-400 font-mono">({order.branchName})</span>
                      )}
                    </h4>
                    <span className="text-[10px] text-amber-400/80 font-mono">
                      تذكرة: #{order.ticketNumber || order.id.slice(0, 8)} • {formatTimeAgo(order.receivedDate)}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                      order.status === 'ready' || (order.status as string) === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : order.status === 'delivered'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {order.status === 'ready' || (order.status as string) === 'completed'
                      ? 'جاهز للاستلام ✅'
                      : order.status === 'delivered'
                      ? 'تم التسليم 📦'
                      : 'قيد الصيانة ⏳'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-300 bg-slate-950/70 p-2.5 rounded-xl border border-white/[0.05]">
                  <span className="text-slate-500 block text-[10px]">العطل:</span>
                  {order.problem}
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                    <User size={12} className="text-cyan-400" />
                    <span>{order.customerName}</span>
                    {order.customerPhone && (
                      <span className="font-mono text-slate-400 text-[10px]">({order.customerPhone})</span>
                    )}
                  </div>
                  <div className="font-mono font-black text-amber-400 text-xs">
                    {formatCurrency(order.finalPrice || order.expectedPrice || 0, hideAmounts)}
                  </div>
                </div>

                {/* Action Buttons for each Ticket */}
                <div className="flex items-center gap-1.5 pt-1">
                  {order.status !== 'ready' && order.status !== 'delivered' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(order, 'ready')}
                      className="flex-1 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[11px] transition flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 size={13} />
                      <span>تحديد كجاهز</span>
                    </button>
                  )}

                  {order.status !== 'delivered' && (
                    <button
                      type="button"
                      onClick={() => openDeliverModal(order)}
                      className="flex-1 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-[11px] transition flex items-center justify-center gap-1"
                    >
                      <Coins size={13} />
                      <span>تسليم وتحصيل</span>
                    </button>
                  )}

                  {order.customerPhone && (
                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(order)}
                      className="p-1.5 rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition"
                      title="واتساب"
                    >
                      <Send size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Deliver & Collect Modal */}
      {deliveringOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-750 rounded-3xl p-5 space-y-3.5 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                <Coins size={15} className="text-cyan-400" />
                <span>تسليم الجهاز وتحصيل النقدية</span>
              </h4>
              <button
                type="button"
                onClick={() => setDeliveringOrder(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/[0.06] space-y-1">
              <div className="font-bold text-white text-xs">{deliveringOrder.deviceModel}</div>
              <div className="text-[11px] text-slate-400">العميل: {deliveringOrder.customerName}</div>
              <div className="text-[10px] text-amber-400/90">العطل: {deliveringOrder.problem}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-300 block mb-1">المبلغ المحصل (ج.م) *</label>
                <input
                  type="number"
                  value={deliverCollectedAmount}
                  onChange={e => setDeliverCollectedAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/[0.1] text-emerald-400 font-bold font-mono text-center focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-300 block mb-1">تكلفة القطع / الصيانة</label>
                <input
                  type="number"
                  value={deliverCostPrice}
                  onChange={e => setDeliverCostPrice(e.target.value)}
                  placeholder="0 (اختياري)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/[0.1] text-rose-300 font-bold font-mono text-center focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Profit preview */}
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-[11px]">
              <span className="text-slate-300 font-medium">صافي ربح الصيانة:</span>
              <strong className="text-emerald-400 font-mono font-bold">
                +{formatCurrency(
                  Math.max(0, (Number(deliverCollectedAmount) || 0) - (Number(deliverCostPrice) || 0)),
                  hideAmounts
                )}
              </strong>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">الخزينة المودع فيها الإيراد:</label>
              <select
                value={deliveredSafeId}
                onChange={e => setDeliveredSafeId(e.target.value)}
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
                onClick={handleConfirmDeliver}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold transition shadow-lg shadow-emerald-500/20"
              >
                تأكيد التسليم والإيداع
              </button>
              <button
                type="button"
                onClick={() => setDeliveringOrder(null)}
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
