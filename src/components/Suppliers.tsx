import { useState, useMemo, useEffect } from 'react';
import { formatCurrency } from '../utils/format';
import { usePagination } from '../hooks/usePagination';
import PaginationBar from './PaginationBar';

import { Search, Plus, Edit2, Trash2, X, Phone, MapPin, Wallet } from 'lucide-react';
import { Supplier } from '../types';

interface SuppliersProps {
  suppliers: Supplier[];
  onUpdate: (suppliers: Supplier[]) => void;
}

export default function Suppliers({ suppliers, onUpdate }: SuppliersProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', balance: 0 });

  const filteredSuppliers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(term) ||
      s.phone.includes(searchTerm)
    );
  }, [suppliers, searchTerm]);

  const suppliersPage = usePagination(filteredSuppliers, { defaultPageSize: 20, storageKey: 'mobpos_page_size_suppliers' });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    suppliersPage.resetPage();
  }, [searchTerm]);

  const handleSave = () => {
    if (!formData.name || !formData.phone) {
      alert('الاسم والهاتف مطلوبان');
      return;
    }

    if (editingSupplier) {
      // Balance is derived from real transactions (e.g. stock-waste records) and
      // must not be overwritten from this form when editing an existing supplier.
      onUpdate(suppliers.map(s => s.id === editingSupplier.id ? { ...s, ...formData, balance: s.balance } : s));
    } else {
      onUpdate([...suppliers, { ...formData, id: `sup-${Date.now()}` }]);
    }

    setShowModal(false);
    setEditingSupplier(null);
    setFormData({ name: '', phone: '', address: '', balance: 0 });
  };

  const handleDelete = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا المورد؟')) {
      onUpdate(suppliers.filter(s => s.id !== id));
    }
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address,
      balance: supplier.balance
    });
    setShowModal(true);
  };

  const totalBalance = suppliers.reduce((sum, s) => sum + s.balance, 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">الموردين</h1>
          <p className="text-gray-500 dark:text-gray-400">إدارة بيانات الموردين</p>
        </div>
        <button
          onClick={() => {
            setEditingSupplier(null);
            setFormData({ name: '', phone: '', address: '', balance: 0 });
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          إضافة مورد
        </button>
      </div>

      {/* Search & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالاسم أو رقم الهاتف..."
              className="w-full py-2 pr-10 pl-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0"
            />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">إجمالي المستحقات</p>
          <p className={`text-2xl font-bold ${totalBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatCurrency(totalBalance)}
          </p>
        </div>
      </div>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliersPage.pageRows.map(supplier => (
          <div
            key={supplier.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800 dark:text-white text-lg">{supplier.name}</h3>
                <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm mt-1">
                  <Phone size={14} />
                  <span>{supplier.phone}</span>
                </div>
                {supplier.address && (
                  <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm mt-1">
                    <MapPin size={14} />
                    <span>{supplier.address}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openEditModal(supplier)}
                  className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <Edit2 size={18} />
                </button>
                <button
                  onClick={() => handleDelete(supplier.id)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">الرصيد المستحق</span>
                </div>
                <span className={`font-bold ${supplier.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(supplier.balance)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredSuppliers.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          لا يوجد موردين
        </div>
      )}

              <PaginationBar
                total={suppliersPage.total}
                page={suppliersPage.page}
                pageSize={suppliersPage.pageSize}
                totalPages={suppliersPage.totalPages}
                from={suppliersPage.from}
                to={suppliersPage.to}
                canPrev={suppliersPage.canPrev}
                canNext={suppliersPage.canNext}
                onPageChange={suppliersPage.setPage}
                onPageSizeChange={suppliersPage.setPageSize}
                itemLabel="مورد"
              />

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                {editingSupplier ? 'تعديل المورد' : 'إضافة مورد جديد'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الاسم *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">رقم الهاتف *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">العنوان</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الرصيد المستحق</label>
                <input
                  type="number"
                  value={formData.balance}
                  onChange={e => setFormData(prev => ({ ...prev, balance: Number(e.target.value) }))}
                  disabled={!!editingSupplier}
                  className={`w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-white ${editingSupplier ? 'bg-gray-100 dark:bg-gray-600 cursor-not-allowed text-gray-500 dark:text-gray-400' : 'bg-white dark:bg-gray-700'}`}
                />
                {editingSupplier && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    يُحسب تلقائياً من العمليات
                  </p>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                إلغاء
              </button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
