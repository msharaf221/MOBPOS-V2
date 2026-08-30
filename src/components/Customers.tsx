import { useState, useMemo, useEffect } from 'react';
import { formatCurrency, formatDate as formatIntlDate } from '../utils/format';
import { usePagination } from '../hooks/usePagination';
import PaginationBar from './PaginationBar';

import { Search, Plus, Edit2, Trash2, Eye, X, Phone, MapPin, Calendar } from 'lucide-react';
import { Customer, Sale, IMEIUnit, InventoryItem, Maintenance, Safe } from '../types';

interface CustomersProps {
  customers: Customer[];
  sales: Sale[];
  imeiUnits: IMEIUnit[];
  inventory: InventoryItem[];
  maintenance: Maintenance[];
  safes: Safe[];
  onAddCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'balance'>) => Customer | null;
  onUpdateCustomer: (id: string, updates: Partial<Customer>) => void;
  onDeleteCustomer: (id: string) => { ok: boolean; error?: string };
  onRecordPayment: (customerId: string, amount: number, safeId: string, notes: string) => void;
}

export default function Customers({
  customers,
  sales,
  imeiUnits,
  inventory,
  maintenance,
  safes,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onRecordPayment
}: CustomersProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '' });

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentSafeId, setPaymentSafeId] = useState(safes.find(s => s.isDefault)?.id || safes[0]?.id || '');
  const [paymentNotes, setPaymentNotes] = useState('');

  const handlePayment = () => {
    if (!selectedCustomer || paymentAmount <= 0 || !paymentSafeId) return;
    if (paymentAmount > (selectedCustomer.balance || 0)) {
      alert('لا يمكن أن يتجاوز مبلغ الدفع رصيد العميل');
      return;
    }
    onRecordPayment(selectedCustomer.id, paymentAmount, paymentSafeId, paymentNotes);
    
    setSelectedCustomer({
      ...selectedCustomer,
      balance: (selectedCustomer.balance || 0) - paymentAmount
    });
    
    setShowPaymentModal(false);
    setPaymentAmount(0);
    setPaymentNotes('');
  };

  // Filter customers
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm)
    );
  }, [customers, searchTerm]);

  const customersPage = usePagination(filteredCustomers, { defaultPageSize: 20, storageKey: 'mobpos_page_size_customers' });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    customersPage.resetPage();
  }, [searchTerm]);

  // Get customer stats — كانت كل كارت بيعمل مسح كامل لقائمتي المبيعات
  // والـ IMEI (Oالعملاء × المبيعات). بقى فهرس واحد يتبني مرة لكل تغيير بيانات.
  const getCustomerStats = useMemo(() => {
    const salesByCustomer = new Map<string, { count: number; total: number }>();
    for (const sale of sales) {
      if (!sale.customerId) continue;
      const current = salesByCustomer.get(sale.customerId) || { count: 0, total: 0 };
      current.count += 1;
      current.total += sale.total || 0;
      salesByCustomer.set(sale.customerId, current);
    }

    const devicesByCustomer = new Map<string, number>();
    for (const unit of imeiUnits) {
      if (!unit.customerId) continue;
      devicesByCustomer.set(unit.customerId, (devicesByCustomer.get(unit.customerId) || 0) + 1);
    }

    return (customerId: string) => {
      const saleInfo = salesByCustomer.get(customerId);
      return {
        salesCount: saleInfo?.count || 0,
        devicesCount: devicesByCustomer.get(customerId) || 0,
        totalSpent: saleInfo?.total || 0
      };
    };
  }, [sales, imeiUnits]);

  // Get customer details
  const getCustomerDetails = (customerId: string) => {
    const customerSales = sales.filter(s => s.customerId === customerId);
    const customerDevices = imeiUnits.filter(u => u.customerId === customerId);
    const customerMaintenance = maintenance.filter(m => {
      // Check if any device linked to maintenance belongs to this customer
      const device = imeiUnits.find(u => u.imei1 === m.imeiLink);
      return device?.customerId === customerId;
    });

    return {
      sales: customerSales,
      devices: customerDevices,
      maintenance: customerMaintenance
    };
  };

  const handleAdd = () => {
    if (!formData.name || !formData.phone) {
      alert('الاسم ورقم الهاتف مطلوبان');
      return;
    }

    const created = onAddCustomer(formData);
    if (!created) {
      alert('تعذر إضافة العميل: رقم الهاتف موجود أو البيانات غير صالحة');
      return;
    }
    setShowAddModal(false);
    setFormData({ name: '', phone: '', address: '' });
  };

  const handleEdit = () => {
    if (!selectedCustomer || !formData.name || !formData.phone) {
      alert('الاسم ورقم الهاتف مطلوبان');
      return;
    }

    onUpdateCustomer(selectedCustomer.id, formData);
    setShowEditModal(false);
    setSelectedCustomer(null);
    setFormData({ name: '', phone: '', address: '' });
  };

  const openEditModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      address: customer.address
    });
    setShowEditModal(true);
  };

  const openDetailModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetailModal(true);
  };

  const formatDate = (dateStr: string) => formatIntlDate(dateStr);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">العملاء</h1>
          <p className="text-gray-500 dark:text-gray-400">إدارة بيانات العملاء ومشترياتهم</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          إضافة عميل
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="relative max-w-md">
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">إجمالي العملاء</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{customers.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">عملاء لديهم أجهزة</p>
          <p className="text-2xl font-bold text-blue-600">
            {new Set(imeiUnits.filter(u => u.customerId).map(u => u.customerId)).size}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">إجمالي المبيعات</p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(sales.reduce((sum, s) => sum + s.total, 0))}
          </p>
        </div>
      </div>

      {/* Customers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customersPage.pageRows.map(customer => {
          const stats = getCustomerStats(customer.id);
          
          return (
            <div
              key={customer.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-white text-lg">{customer.name}</h3>
                  <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm mt-1">
                    <Phone size={14} />
                    <span>{customer.phone}</span>
                  </div>
                  {customer.address && (
                    <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm mt-1">
                      <MapPin size={14} />
                      <span>{customer.address}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openDetailModal(customer)}
                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                    title="عرض التفاصيل"
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    onClick={() => openEditModal(customer)}
                    className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    title="تعديل"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('هل أنت متأكد من حذف هذا العميل؟')) {
                        const result = onDeleteCustomer(customer.id);
                        if (!result.ok) alert(result.error || 'تعذر حذف العميل');
                      }
                    }}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    title="حذف"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-800 dark:text-white">{stats.salesCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">عمليات شراء</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-600">{stats.devicesCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">أجهزة</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-green-600">{formatCurrency(stats.totalSpent)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">إجمالي</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredCustomers.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          لا يوجد عملاء مطابقين للبحث
        </div>
      )}

              <PaginationBar
                total={customersPage.total}
                page={customersPage.page}
                pageSize={customersPage.pageSize}
                totalPages={customersPage.totalPages}
                from={customersPage.from}
                to={customersPage.to}
                canPrev={customersPage.canPrev}
                canNext={customersPage.canNext}
                onPageChange={customersPage.setPage}
                onPageSizeChange={customersPage.setPageSize}
                itemLabel="عميل"
              />

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">إضافة عميل جديد</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  الاسم *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  رقم الهاتف *
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  العنوان
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                إضافة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedCustomer && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">تعديل بيانات العميل</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  الاسم *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  رقم الهاتف *
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  العنوان
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedCustomer && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">{selectedCustomer.name}</h3>
                <div className="flex items-center gap-4 mt-1 text-gray-500 dark:text-gray-400 text-sm">
                  <span className="flex items-center gap-1">
                    <Phone size={14} />
                    {selectedCustomer.phone}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    عميل منذ {formatDate(selectedCustomer.createdAt)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Stats */}
              {(() => {
                const details = getCustomerDetails(selectedCustomer.id);
                const stats = getCustomerStats(selectedCustomer.id);
                
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-blue-600">{stats.salesCount}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">عمليات شراء</p>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-purple-600">{stats.devicesCount}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">أجهزة يملكها</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalSpent)}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">إجمالي المشتريات</p>
                      </div>
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center relative group">
                        <p className="text-2xl font-bold text-red-600">{formatCurrency(selectedCustomer.balance || 0)}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">المديونية</p>
                        {selectedCustomer.balance > 0 && (
                          <button
                            onClick={() => setShowPaymentModal(true)}
                            className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full shadow hover:bg-blue-700"
                          >
                            تسديد
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Devices */}
                    <div>
                      <h4 className="font-bold text-gray-800 dark:text-white mb-3">الأجهزة المملوكة</h4>
                      {details.devices.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-4">لا يملك أجهزة حالياً</p>
                      ) : (
                        <div className="grid gap-2">
                          {details.devices.map(device => {
                            const product = inventory.find(i => i.id === device.inventoryId);
                            return (
                              <div key={device.id} className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-gray-800 dark:text-white">{product?.name}</p>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {device.color} - {device.storage} | IMEI: {device.imei1.slice(-6)}
                                  </p>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  device.status === 'sold' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {device.status === 'sold' ? 'نشط' : device.status}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Purchase History */}
                    <div>
                      <h4 className="font-bold text-gray-800 dark:text-white mb-3">سجل المشتريات</h4>
                      {details.sales.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-4">لا توجد مشتريات</p>
                      ) : (
                        <div className="space-y-2">
                          {details.sales.map(sale => (
                            <div key={sale.id} className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-800 dark:text-white">{sale.invoiceNumber}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {formatDate(sale.createdAt)} - {sale.items.length} منتج
                                </p>
                              </div>
                              <span className="font-bold text-green-600">{formatCurrency(sale.total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedCustomer && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">تسديد دفعة مديونية</h3>
              <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg text-center mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">المديونية الحالية لـ {selectedCustomer.name}</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(selectedCustomer.balance || 0)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  المبلغ المدفوع *
                </label>
                <input
                  type="number"
                  min="0"
                  max={selectedCustomer.balance || 0}
                  value={paymentAmount || ''}
                  onChange={e => setPaymentAmount(Number(e.target.value))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  إلى خزينة *
                </label>
                <select
                  value={paymentSafeId}
                  onChange={e => setPaymentSafeId(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  <option value="">اختر الخزينة</option>
                  {safes.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({formatCurrency(s.balance)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ملاحظات
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  placeholder="مثال: دفعة كاش من الحساب القديم"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handlePayment}
                disabled={paymentAmount <= 0 || !paymentSafeId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                تأكيد الدفع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
