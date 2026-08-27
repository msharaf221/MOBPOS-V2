import { useState } from 'react';
import { Plus, ArrowRightLeft, Wallet, TrendingUp, TrendingDown, X } from 'lucide-react';
import { Safe, Transaction } from '../types';

interface SafesProps {
  safes: Safe[];
  transactions: Transaction[];
  onAddSafe: (safe: Omit<Safe, 'id'>) => void;
  onTransfer: (fromId: string, toId: string, amount: number) => void;
}

export default function Safes({ safes, transactions, onAddSafe, onTransfer }: SafesProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [newSafe, setNewSafe] = useState({ name: '', balance: 0, isDefault: false });
  const [transfer, setTransfer] = useState({ fromId: '', toId: '', amount: 0 });

  const handleAddSafe = () => {
    if (!newSafe.name) {
      alert('اسم الخزنة مطلوب');
      return;
    }
    onAddSafe(newSafe);
    setShowAddModal(false);
    setNewSafe({ name: '', balance: 0, isDefault: false });
  };

  const handleTransfer = () => {
    if (!transfer.fromId || !transfer.toId || transfer.amount <= 0) {
      alert('يرجى ملء جميع الحقول');
      return;
    }
    if (transfer.fromId === transfer.toId) {
      alert('لا يمكن التحويل لنفس الخزنة');
      return;
    }
    const fromSafe = safes.find(s => s.id === transfer.fromId);
    if (fromSafe && fromSafe.balance < transfer.amount) {
      alert('الرصيد غير كافي');
      return;
    }
    onTransfer(transfer.fromId, transfer.toId, transfer.amount);
    setShowTransferModal(false);
    setTransfer({ fromId: '', toId: '', amount: 0 });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(localStorage.getItem('app_locale') || 'ar-EG', {
      style: 'currency',
      currency: localStorage.getItem('app_currency') || 'EGP',
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(localStorage.getItem('app_locale') || 'ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const totalBalance = safes.reduce((sum, s) => sum + s.balance, 0);

  // Get recent transactions
  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'sale':
      case 'maintenance':
      case 'income':
        return <TrendingUp className="text-green-500" size={18} />;
      case 'purchase':
      case 'expense':
        return <TrendingDown className="text-red-500" size={18} />;
      default:
        return <ArrowRightLeft className="text-blue-500" size={18} />;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">الخزائن</h1>
          <p className="text-gray-500 dark:text-gray-400">إدارة الخزائن والتحويلات</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
          >
            <ArrowRightLeft size={20} />
            تحويل
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={20} />
            خزنة جديدة
          </button>
        </div>
      </div>

      {/* Total Balance Card */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <Wallet size={28} />
          </div>
          <div>
            <p className="text-blue-100">إجمالي الرصيد</p>
            <p className="text-3xl font-bold">{formatCurrency(totalBalance)}</p>
          </div>
        </div>
      </div>

      {/* Safes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {safes.map(safe => (
          <div
            key={safe.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                  <Wallet className="text-blue-600 dark:text-blue-400" size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-white">{safe.name}</h3>
                  {safe.isDefault && (
                    <span className="text-xs text-blue-600 dark:text-blue-400">افتراضية</span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-800 dark:text-white">
              {formatCurrency(safe.balance)}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-bold text-gray-800 dark:text-white">آخر المعاملات</h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {recentTransactions.map(trans => {
            const safe = safes.find(s => s.id === trans.safeId);
            return (
              <div key={trans.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getTransactionIcon(trans.type)}
                  <div>
                    <p className="font-medium text-gray-800 dark:text-white">{trans.description}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {safe?.name} • {formatDate(trans.createdAt)}
                    </p>
                  </div>
                </div>
                <span className={`font-bold ${trans.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {trans.amount >= 0 ? '+' : ''}{formatCurrency(trans.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Safe Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">إضافة خزنة جديدة</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اسم الخزنة</label>
                <input
                  type="text"
                  value={newSafe.name}
                  onChange={e => setNewSafe(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الرصيد الافتتاحي</label>
                <input
                  type="number"
                  value={newSafe.balance}
                  onChange={e => setNewSafe(prev => ({ ...prev, balance: Number(e.target.value) }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                إلغاء
              </button>
              <button onClick={handleAddSafe} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                إضافة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="modal-overlay" onClick={() => setShowTransferModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">تحويل بين الخزائن</h3>
              <button onClick={() => setShowTransferModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">من خزنة</label>
                <select
                  value={transfer.fromId}
                  onChange={e => setTransfer(prev => ({ ...prev, fromId: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  <option value="">اختر</option>
                  {safes.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({formatCurrency(s.balance)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">إلى خزنة</label>
                <select
                  value={transfer.toId}
                  onChange={e => setTransfer(prev => ({ ...prev, toId: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  <option value="">اختر</option>
                  {safes.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">المبلغ</label>
                <input
                  type="number"
                  value={transfer.amount}
                  onChange={e => setTransfer(prev => ({ ...prev, amount: Number(e.target.value) }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowTransferModal(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                إلغاء
              </button>
              <button onClick={handleTransfer} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                تحويل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
