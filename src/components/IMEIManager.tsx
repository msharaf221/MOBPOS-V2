import { useState, useMemo } from 'react';
import {
  Search, Plus, Edit2, Trash2, Eye, History, AlertTriangle,
  X, Smartphone
} from 'lucide-react';
import { IMEIUnit, InventoryItem, Customer, Sale, Maintenance } from '../types';

interface IMEIManagerProps {
  imeiUnits: IMEIUnit[];
  inventory: InventoryItem[];
  customers: Customer[];
  onAddIMEI: (unit: Omit<IMEIUnit, 'id' | 'createdAt'>) => IMEIUnit | null;
  onUpdateIMEI: (id: string, updates: Partial<IMEIUnit>) => void;
  onDeleteIMEI: (id: string) => { ok: boolean; error?: string };
  getIMEIHistory: (imei: string) => { unit: IMEIUnit; sales: Sale[]; maintenance: Maintenance[] } | null;
}

export default function IMEIManager({
  imeiUnits,
  inventory,
  customers,
  onAddIMEI,
  onUpdateIMEI,
  onDeleteIMEI,
  getIMEIHistory
}: IMEIManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [conditionFilter, setConditionFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<IMEIUnit | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  const [formData, setFormData] = useState({
    inventoryId: '',
    imei1: '',
    imei2: '',
    color: '',
    storage: '',
    ram: '',
    condition: 'new' as 'new' | 'used' | 'refurbished',
    warrantyEndDate: '',
    purchasePrice: 0,
    notes: ''
  });

  // Get devices (products with IMEI)
  const devices = inventory.filter(i => i.hasIMEI);

  // Filter units
  const filteredUnits = useMemo(() => {
    return imeiUnits.filter(unit => {
      const matchesSearch = 
        unit.imei1.includes(searchTerm) ||
        unit.imei2.includes(searchTerm) ||
        unit.color.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || unit.status === statusFilter;
      const matchesProduct = productFilter === 'all' || unit.inventoryId === productFilter;
      const matchesCondition = conditionFilter === 'all' || unit.condition === conditionFilter;

      return matchesSearch && matchesStatus && matchesProduct && matchesCondition;
    });
  }, [imeiUnits, searchTerm, statusFilter, productFilter, conditionFilter]);

  // Check warranty status
  const getWarrantyStatus = (endDate: string) => {
    if (!endDate) return 'none';
    const today = new Date();
    const warranty = new Date(endDate);
    const daysLeft = Math.ceil((warranty.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysLeft < 0) return 'expired';
    if (daysLeft <= 30) return 'expiring';
    return 'active';
  };

  const handleAddSubmit = () => {
    if (!formData.inventoryId || !formData.imei1) {
      alert('المنتج و IMEI مطلوبان');
      return;
    }

    // Check IMEI uniqueness against both imei1 and imei2 of all existing units
    const exists = imeiUnits.find(u =>
      u.imei1 === formData.imei1 ||
      u.imei2 === formData.imei1 ||
      (formData.imei2 && (u.imei1 === formData.imei2 || u.imei2 === formData.imei2))
    );
    if (exists) {
      alert('رقم IMEI موجود بالفعل');
      return;
    }

    const created = onAddIMEI({
      inventoryId: formData.inventoryId,
      imei1: formData.imei1,
      imei2: formData.imei2,
      color: formData.color,
      storage: formData.storage,
      ram: formData.ram,
      condition: formData.condition,
      warrantyEndDate: formData.warrantyEndDate,
      status: 'available',
      saleId: '',
      customerId: '',
      purchasePrice: formData.purchasePrice,
      notes: formData.notes
    });
    if (!created) {
      alert('تعذر إضافة وحدة IMEI: تحقّق من المنتج والسعر وعدم تكرار الأرقام');
      return;
    }

    setShowAddModal(false);
    resetForm();
  };

  const handleEditSubmit = () => {
    if (!selectedUnit) return;
    
    onUpdateIMEI(selectedUnit.id, {
      color: formData.color,
      storage: formData.storage,
      ram: formData.ram,
      condition: formData.condition,
      warrantyEndDate: formData.warrantyEndDate,
      purchasePrice: formData.purchasePrice,
      notes: formData.notes
    });

    setShowEditModal(false);
    setSelectedUnit(null);
    resetForm();
  };

  const handleTransfer = (newCustomerId: string) => {
    if (!selectedUnit) return;
    
    onUpdateIMEI(selectedUnit.id, {
      customerId: newCustomerId,
      warrantyEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });

    setShowTransferModal(false);
    setSelectedUnit(null);
  };

  const resetForm = () => {
    setFormData({
      inventoryId: '',
      imei1: '',
      imei2: '',
      color: '',
      storage: '',
      ram: '',
      condition: 'new',
      warrantyEndDate: '',
      purchasePrice: 0,
      notes: ''
    });
  };

  const openEditModal = (unit: IMEIUnit) => {
    setSelectedUnit(unit);
    setFormData({
      inventoryId: unit.inventoryId,
      imei1: unit.imei1,
      imei2: unit.imei2,
      color: unit.color,
      storage: unit.storage,
      ram: unit.ram,
      condition: unit.condition,
      warrantyEndDate: unit.warrantyEndDate.split('T')[0],
      purchasePrice: unit.purchasePrice,
      notes: unit.notes
    });
    setShowEditModal(true);
  };

  const openHistoryModal = (unit: IMEIUnit) => {
    setSelectedUnit(unit);
    setShowHistoryModal(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(localStorage.getItem('app_locale') || 'ar-EG', {
      style: 'currency',
      currency: localStorage.getItem('app_currency') || 'EGP',
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(localStorage.getItem('app_locale') || 'ar-EG');
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      available: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      sold: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      returned: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      wasted: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    };
    const labels: Record<string, string> = {
      available: 'متاح',
      sold: 'مباع',
      maintenance: 'صيانة',
      returned: 'مرتجع',
      wasted: 'تالف'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const history = selectedUnit ? getIMEIHistory(selectedUnit.imei1) : null;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">إدارة IMEI</h1>
          <p className="text-gray-500 dark:text-gray-400">تتبع وإدارة جميع الأجهزة بأرقام IMEI</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          إضافة جهاز جديد
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Search */}
          <div className="md:col-span-2 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بـ IMEI أو اللون..."
              className="w-full py-2 pr-10 pl-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0"
          >
            <option value="all">جميع الحالات</option>
            <option value="available">متاح</option>
            <option value="sold">مباع</option>
            <option value="maintenance">صيانة</option>
            <option value="returned">مرتجع</option>
            <option value="wasted">تالف</option>
          </select>

          {/* Product Filter */}
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0"
          >
            <option value="all">جميع المنتجات</option>
            {devices.map(device => (
              <option key={device.id} value={device.id}>{device.name}</option>
            ))}
          </select>

          {/* Condition Filter */}
          <select
            value={conditionFilter}
            onChange={(e) => setConditionFilter(e.target.value)}
            className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0"
          >
            <option value="all">جميع الحالات</option>
            <option value="new">جديد</option>
            <option value="used">مستعمل</option>
            <option value="refurbished">مجدد</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">إجمالي الأجهزة</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{imeiUnits.length}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
          <p className="text-green-600 dark:text-green-400 text-sm">متاح</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">
            {imeiUnits.filter(u => u.status === 'available').length}
          </p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <p className="text-blue-600 dark:text-blue-400 text-sm">مباع</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
            {imeiUnits.filter(u => u.status === 'sold').length}
          </p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800">
          <p className="text-yellow-600 dark:text-yellow-400 text-sm">صيانة</p>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
            {imeiUnits.filter(u => u.status === 'maintenance').length}
          </p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400 text-sm">ضمان ينتهي قريباً</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">
            {imeiUnits.filter(u => getWarrantyStatus(u.warrantyEndDate) === 'expiring').length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">المنتج</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">IMEI</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">المواصفات</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الحالة</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الضمان</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">العميل</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredUnits.map(unit => {
                const product = inventory.find(i => i.id === unit.inventoryId);
                const customer = customers.find(c => c.id === unit.customerId);
                const warrantyStatus = getWarrantyStatus(unit.warrantyEndDate);

                return (
                  <tr key={unit.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Smartphone className="text-gray-400" size={20} />
                        <span className="font-medium text-gray-800 dark:text-white">
                          {product?.name || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono text-gray-800 dark:text-white">{unit.imei1}</p>
                      {unit.imei2 && (
                        <p className="text-xs font-mono text-gray-500">{unit.imei2}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-600 rounded text-xs text-gray-700 dark:text-gray-300">
                          {unit.color}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-600 rounded text-xs text-gray-700 dark:text-gray-300">
                          {unit.storage}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-600 rounded text-xs text-gray-700 dark:text-gray-300">
                          {unit.ram}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          unit.condition === 'new' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                          unit.condition === 'used' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        }`}>
                          {unit.condition === 'new' ? 'جديد' : unit.condition === 'used' ? 'مستعمل' : 'مجدد'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(unit.status)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {warrantyStatus === 'expiring' && (
                          <AlertTriangle className="text-orange-500" size={16} />
                        )}
                        {warrantyStatus === 'expired' && (
                          <AlertTriangle className="text-red-500" size={16} />
                        )}
                        <span className={`text-sm ${
                          warrantyStatus === 'expired' ? 'text-red-500' :
                          warrantyStatus === 'expiring' ? 'text-orange-500' :
                          'text-gray-600 dark:text-gray-400'
                        }`}>
                          {formatDate(unit.warrantyEndDate)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {customer?.name || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openHistoryModal(unit)}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                          title="سجل الجهاز"
                        >
                          <History size={18} />
                        </button>
                        <button
                          onClick={() => openEditModal(unit)}
                          className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                          title="تعديل"
                        >
                          <Edit2 size={18} />
                        </button>
                        {unit.status === 'sold' && (
                          <button
                            onClick={() => {
                              setSelectedUnit(unit);
                              setShowTransferModal(true);
                            }}
                            className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                            title="نقل ملكية"
                          >
                            <Eye size={18} />
                          </button>
                        )}
                        {unit.status === 'available' && (
                          <button
                            onClick={() => {
                              if (confirm('هل أنت متأكد من حذف هذا الجهاز؟')) {
                                const result = onDeleteIMEI(unit.id);
                                if (!result.ok) alert(result.error || 'تعذر حذف الجهاز');
                              }
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                            title="حذف"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredUnits.length === 0 && (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            لا توجد أجهزة مطابقة للبحث
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">إضافة جهاز جديد</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">المنتج *</label>
                <select
                  value={formData.inventoryId}
                  onChange={e => setFormData(prev => ({ ...prev, inventoryId: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  <option value="">اختر المنتج</option>
                  {devices.map(device => (
                    <option key={device.id} value={device.id}>{device.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IMEI 1 *</label>
                  <input
                    type="text"
                    value={formData.imei1}
                    onChange={e => setFormData(prev => ({ ...prev, imei1: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                    placeholder="15 رقم"
                    maxLength={15}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IMEI 2 (اختياري)</label>
                  <input
                    type="text"
                    value={formData.imei2}
                    onChange={e => setFormData(prev => ({ ...prev, imei2: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                    placeholder="15 رقم"
                    maxLength={15}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اللون</label>
                  <input
                    type="text"
                    value={formData.color}
                    onChange={e => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">التخزين</label>
                  <select
                    value={formData.storage}
                    onChange={e => setFormData(prev => ({ ...prev, storage: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  >
                    <option value="">اختر</option>
                    <option value="64GB">64GB</option>
                    <option value="128GB">128GB</option>
                    <option value="256GB">256GB</option>
                    <option value="512GB">512GB</option>
                    <option value="1TB">1TB</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الرام</label>
                  <select
                    value={formData.ram}
                    onChange={e => setFormData(prev => ({ ...prev, ram: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  >
                    <option value="">اختر</option>
                    <option value="4GB">4GB</option>
                    <option value="6GB">6GB</option>
                    <option value="8GB">8GB</option>
                    <option value="12GB">12GB</option>
                    <option value="16GB">16GB</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الحالة</label>
                  <select
                    value={formData.condition}
                    onChange={e => setFormData(prev => ({ ...prev, condition: e.target.value as 'new' | 'used' | 'refurbished' }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  >
                    <option value="new">جديد</option>
                    <option value="used">مستعمل</option>
                    <option value="refurbished">مجدد</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نهاية الضمان</label>
                  <input
                    type="date"
                    value={formData.warrantyEndDate}
                    onChange={e => setFormData(prev => ({ ...prev, warrantyEndDate: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">سعر الشراء</label>
                <input
                  type="number"
                  value={formData.purchasePrice}
                  onChange={e => setFormData(prev => ({ ...prev, purchasePrice: Number(e.target.value) }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ملاحظات</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                إضافة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedUnit && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">تعديل الجهاز</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">IMEI 1</p>
                <p className="font-mono text-gray-800 dark:text-white">{selectedUnit.imei1}</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اللون</label>
                  <input
                    type="text"
                    value={formData.color}
                    onChange={e => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">التخزين</label>
                  <input
                    type="text"
                    value={formData.storage}
                    onChange={e => setFormData(prev => ({ ...prev, storage: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الرام</label>
                  <input
                    type="text"
                    value={formData.ram}
                    onChange={e => setFormData(prev => ({ ...prev, ram: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الحالة</label>
                  <select
                    value={formData.condition}
                    onChange={e => setFormData(prev => ({ ...prev, condition: e.target.value as 'new' | 'used' | 'refurbished' }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  >
                    <option value="new">جديد</option>
                    <option value="used">مستعمل</option>
                    <option value="refurbished">مجدد</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نهاية الضمان</label>
                  <input
                    type="date"
                    value={formData.warrantyEndDate}
                    onChange={e => setFormData(prev => ({ ...prev, warrantyEndDate: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ملاحظات</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
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
                onClick={handleEditSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && selectedUnit && history && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">سجل الجهاز</h3>
                <p className="text-gray-500 dark:text-gray-400 font-mono">{selectedUnit.imei1}</p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Device Info */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                <h4 className="font-bold text-gray-800 dark:text-white mb-3">معلومات الجهاز</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">المنتج</p>
                    <p className="font-medium text-gray-800 dark:text-white">
                      {inventory.find(i => i.id === selectedUnit.inventoryId)?.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">اللون</p>
                    <p className="font-medium text-gray-800 dark:text-white">{selectedUnit.color}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">التخزين</p>
                    <p className="font-medium text-gray-800 dark:text-white">{selectedUnit.storage}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">الحالة</p>
                    {getStatusBadge(selectedUnit.status)}
                  </div>
                </div>
              </div>

              {/* Sales History */}
              <div>
                <h4 className="font-bold text-gray-800 dark:text-white mb-3">سجل المبيعات</h4>
                {history.sales.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">لا توجد مبيعات</p>
                ) : (
                  <div className="space-y-2">
                    {history.sales.map(sale => {
                      const customer = customers.find(c => c.id === sale.customerId);
                      return (
                        <div key={sale.id} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-gray-800 dark:text-white">{sale.invoiceNumber}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {customer?.name || 'عميل غير معروف'} - {formatDate(sale.createdAt)}
                              </p>
                            </div>
                            <p className="font-bold text-blue-600">{formatCurrency(sale.total)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Maintenance History */}
              <div>
                <h4 className="font-bold text-gray-800 dark:text-white mb-3">سجل الصيانة</h4>
                {history.maintenance.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">لا توجد عمليات صيانة</p>
                ) : (
                  <div className="space-y-2">
                    {history.maintenance.map(maint => (
                      <div key={maint.id} className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-800 dark:text-white">{maint.ticketNumber}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {maint.problem} - {formatDate(maint.receivedAt)}
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            maint.status === 'delivered' ? 'bg-green-100 text-green-700' :
                            maint.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {maint.status === 'delivered' ? 'تم التسليم' :
                             maint.status === 'completed' ? 'مكتمل' :
                             maint.status === 'in_progress' ? 'قيد الإصلاح' : 'قيد الاستلام'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Ownership Modal */}
      {showTransferModal && selectedUnit && (
        <div className="modal-overlay" onClick={() => setShowTransferModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">نقل ملكية الجهاز</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                اختر العميل الجديد لنقل ملكية الجهاز وتجديد الضمان
              </p>
            </div>

            <div className="p-6 max-h-96 overflow-y-auto">
              {customers.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => handleTransfer(customer.id)}
                  className="w-full p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-right flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-800 dark:text-white">{customer.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{customer.phone}</p>
                  </div>
                  {customer.id === selectedUnit.customerId && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                      المالك الحالي
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowTransferModal(false)}
                className="w-full py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
