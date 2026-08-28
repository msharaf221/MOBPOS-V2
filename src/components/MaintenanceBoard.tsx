import { useState, useMemo } from 'react';
import {
  Plus, Clock, Wrench, CheckCircle, Truck, X, Phone,
  Smartphone, DollarSign, Package, Printer
} from 'lucide-react';
import { Maintenance, MaintenancePart, InventoryItem, Safe, Customer, Category } from '../types';
import { printReceipt } from '../utils/print';

interface MaintenanceBoardProps {
  maintenance: Maintenance[];
  inventory: InventoryItem[];
  categories: Category[];
  safes: Safe[];
  customers: Customer[];
  onCreateMaintenance: (data: Omit<Maintenance, 'id' | 'ticketNumber' | 'status' | 'finalCost' | 'collectedAmount' | 'parts' | 'additionalExpenses' | 'profit' | 'completedAt' | 'deliveredAt'>) => void;
  onUpdateMaintenance: (id: string, updates: Partial<Maintenance>) => void;
  onAddPart: (maintenanceId: string, part: Omit<MaintenancePart, 'id'>) => void;
  onRemovePart: (maintenanceId: string, partId: string) => void;
  onDeliverMaintenance: (id: string, collectedAmount: number, safeId: string) => void;
}

type MaintenanceStatus = 'received' | 'in_progress' | 'completed' | 'delivered';

const statusConfig: Record<MaintenanceStatus, { label: string; color: string; bgColor: string; icon: typeof Clock }> = {
  received: { label: 'قيد الاستلام', color: 'text-yellow-600', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20', icon: Clock },
  in_progress: { label: 'تحت الإصلاح', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/20', icon: Wrench },
  completed: { label: 'مكتمل', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-900/20', icon: CheckCircle },
  delivered: { label: 'تم التسليم', color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-900/20', icon: Truck }
};

export default function MaintenanceBoard({
  maintenance,
  inventory,
  categories,
  safes,
  onCreateMaintenance,
  onUpdateMaintenance,
  onAddPart,
  onRemovePart,
  onDeliverMaintenance
}: MaintenanceBoardProps) {
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedMaintenanceId, setSelectedMaintenanceId] = useState<string | null>(null);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [deliverAmount, setDeliverAmount] = useState(0);
  const [deliverSafe, setDeliverSafe] = useState(safes.find(s => s.isDefault)?.id || '');
  const [showAddPartModal, setShowAddPartModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const [newTicket, setNewTicket] = useState({
    customerName: '',
    customerPhone: '',
    deviceType: '',
    deviceModel: '',
    imeiLink: '',
    problem: '',
    diagnosis: '',
    estimatedCost: 0,
    technicianId: '',
    safeId: safes.find(s => s.isDefault)?.id || '',
    notes: ''
  });

  const [newPart, setNewPart] = useState({
    inventoryId: '',
    quantity: 1,
    manualName: '',
    manualCost: 0,
    isManual: true // default to manual entry
  });

  // Derive selected maintenance LIVE from the array so it reflects
  // any updates (added parts, changed costs, profit) instantly
  const selectedMaintenance = useMemo(
    () => maintenance.find(m => m.id === selectedMaintenanceId) || null,
    [maintenance, selectedMaintenanceId]
  );

  // Get spare parts from inventory based on the category type so custom
  // spare-part categories are supported too (not only the default cat ids).
  const spareParts = inventory.filter(i =>
    categories.find(c => c.id === i.categoryId)?.type === 'spare_part'
  );

  // Group maintenance by status
  const groupedMaintenance = {
    received: maintenance.filter(m => m.status === 'received'),
    in_progress: maintenance.filter(m => m.status === 'in_progress'),
    completed: maintenance.filter(m => m.status === 'completed'),
    delivered: maintenance.filter(m => m.status === 'delivered').slice(0, 10) // Show only last 10 delivered
  };

  const calculateProfit = (maint: Maintenance) => {
    const partsCost = maint.parts.reduce((sum, p) => sum + p.total, 0);
    return maint.collectedAmount - partsCost - maint.additionalExpenses;
  };

  const getDaysSince = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  };

  const handleCreateTicket = () => {
    if (!newTicket.customerName || !newTicket.customerPhone || !newTicket.deviceType) {
      alert('الاسم والهاتف ونوع الجهاز مطلوبين');
      return;
    }

    onCreateMaintenance({
      customerName: newTicket.customerName,
      customerPhone: newTicket.customerPhone,
      deviceType: newTicket.deviceType,
      deviceModel: newTicket.deviceModel,
      imeiLink: newTicket.imeiLink,
      problem: newTicket.problem,
      diagnosis: newTicket.diagnosis,
      estimatedCost: newTicket.estimatedCost,
      technicianId: newTicket.technicianId,
      safeId: newTicket.safeId,
      receivedAt: new Date().toISOString(),
      notes: newTicket.notes
    });

    setShowNewModal(false);
    setNewTicket({
      customerName: '',
      customerPhone: '',
      deviceType: '',
      deviceModel: '',
      imeiLink: '',
      problem: '',
      diagnosis: '',
      estimatedCost: 0,
      technicianId: '',
      safeId: safes.find(s => s.isDefault)?.id || '',
      notes: ''
    });
  };

  const handleStatusChange = (maint: Maintenance, newStatus: MaintenanceStatus) => {
    if (newStatus === 'completed') {
      onUpdateMaintenance(maint.id, {
        status: newStatus,
        completedAt: new Date().toISOString()
      });
    } else {
      onUpdateMaintenance(maint.id, { status: newStatus });
    }
  };

  const handleAddPart = () => {
    if (!selectedMaintenance) return;

    if (newPart.isManual) {
      // Manual entry - user types the part name and cost
      if (!newPart.manualName) {
        alert('اسم القطعة مطلوب');
        return;
      }

      onAddPart(selectedMaintenance.id, {
        inventoryId: `manual-${Date.now()}`,
        name: newPart.manualName,
        quantity: newPart.quantity,
        unitCost: newPart.manualCost,
        total: newPart.manualCost * newPart.quantity
      });
    } else {
      // From inventory
      if (!newPart.inventoryId) return;

      const part = spareParts.find(p => p.id === newPart.inventoryId);
      if (!part) return;

      if (part.quantity < newPart.quantity) {
        alert('الكمية غير متاحة في المخزون');
        return;
      }

      onAddPart(selectedMaintenance.id, {
        inventoryId: part.id,
        name: part.name,
        quantity: newPart.quantity,
        unitCost: part.costPrice,
        total: part.costPrice * newPart.quantity
      });
    }

    setShowAddPartModal(false);
    setNewPart({ inventoryId: '', quantity: 1, manualName: '', manualCost: 0, isManual: true });
  };

  const handleDeliver = () => {
    if (!selectedMaintenance) return;
    
    onDeliverMaintenance(selectedMaintenance.id, deliverAmount, deliverSafe);
    setShowDeliverModal(false);
    setShowDetailModal(false);
    setSelectedMaintenanceId(null);
  };

  const openDetailModal = (maint: Maintenance) => {
    setSelectedMaintenanceId(maint.id);
    setShowDetailModal(true);
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

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col gap-4 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">الصيانة</h1>
          <p className="text-gray-500 dark:text-gray-400">إدارة تذاكر الصيانة وقطع الغيار</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          تذكرة جديدة
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
        {(['received', 'in_progress', 'completed', 'delivered'] as MaintenanceStatus[]).map(status => {
          const config = statusConfig[status];
          const tickets = groupedMaintenance[status];
          const Icon = config.icon;

          return (
            <div
              key={status}
              className="flex-1 min-w-[300px] flex flex-col bg-gray-100 dark:bg-gray-800 rounded-xl"
            >
              {/* Column Header */}
              <div className={`p-4 ${config.bgColor} rounded-t-xl border-b border-gray-200 dark:border-gray-700`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={config.color} size={20} />
                    <span className={`font-bold ${config.color}`}>{config.label}</span>
                  </div>
                  <span className="px-2 py-1 bg-white dark:bg-gray-700 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300">
                    {tickets.length}
                  </span>
                </div>
              </div>

              {/* Tickets */}
              <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                {tickets.map(ticket => {
                  const daysSince = getDaysSince(ticket.receivedAt);
                  const isDelayed = daysSince > 7 && status !== 'delivered';

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => openDetailModal(ticket)}
                      className={`
                        bg-white dark:bg-gray-700 rounded-xl p-4 shadow-sm border cursor-pointer
                        transition-all hover:shadow-md hover:scale-[1.02]
                        ${isDelayed ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-600'}
                      `}
                    >
                      {/* Ticket Number & Days */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                          {ticket.ticketNumber}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          isDelayed 
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                        }`}>
                          {daysSince} يوم
                        </span>
                      </div>

                      {/* Customer Info */}
                      <div className="flex items-center gap-2 mb-2">
                        <Phone size={14} className="text-gray-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{ticket.customerName}</span>
                      </div>

                      {/* Device */}
                      <div className="flex items-center gap-2 mb-2">
                        <Smartphone size={14} className="text-gray-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {ticket.deviceType} {ticket.deviceModel}
                        </span>
                      </div>

                      {/* Problem */}
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                        {ticket.problem}
                      </p>

                      {/* Parts & Cost */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-600">
                        <div className="flex items-center gap-1">
                          <Package size={14} className="text-gray-400" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {ticket.parts.length} قطعة
                          </span>
                        </div>
                        <span className="text-sm font-bold text-green-600 dark:text-green-400">
                          {formatCurrency(ticket.estimatedCost)}
                        </span>
                      </div>

                      {/* IMEI Badge */}
                      {ticket.imeiLink && (
                        <div className="mt-2">
                          <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                            IMEI مرتبط
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {tickets.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Wrench size={32} className="mx-auto mb-2 opacity-50" />
                    <p>لا توجد تذاكر</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Ticket Modal */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">تذكرة صيانة جديدة</h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    اسم العميل *
                  </label>
                  <input
                    type="text"
                    value={newTicket.customerName}
                    onChange={e => setNewTicket(prev => ({ ...prev, customerName: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    رقم الهاتف *
                  </label>
                  <input
                    type="tel"
                    value={newTicket.customerPhone}
                    onChange={e => setNewTicket(prev => ({ ...prev, customerPhone: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Device Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    نوع الجهاز *
                  </label>
                  <select
                    value={newTicket.deviceType}
                    onChange={e => setNewTicket(prev => ({ ...prev, deviceType: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  >
                    <option value="">اختر</option>
                    <option value="iPhone">iPhone</option>
                    <option value="Samsung">Samsung</option>
                    <option value="Xiaomi">Xiaomi</option>
                    <option value="OPPO">OPPO</option>
                    <option value="Realme">Realme</option>
                    <option value="Huawei">Huawei</option>
                    <option value="Other">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    الموديل
                  </label>
                  <input
                    type="text"
                    value={newTicket.deviceModel}
                    onChange={e => setNewTicket(prev => ({ ...prev, deviceModel: e.target.value }))}
                    placeholder="مثال: iPhone 14 Pro"
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
              </div>

              {/* IMEI Link */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ربط بـ IMEI (اختياري)
                </label>
                <input
                  type="text"
                  value={newTicket.imeiLink}
                  onChange={e => setNewTicket(prev => ({ ...prev, imeiLink: e.target.value }))}
                  placeholder="أدخل رقم IMEI إذا كان الجهاز من المحل"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              {/* Problem */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  المشكلة
                </label>
                <textarea
                  value={newTicket.problem}
                  onChange={e => setNewTicket(prev => ({ ...prev, problem: e.target.value }))}
                  rows={3}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              {/* Estimated Cost */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  التكلفة المبدئية
                </label>
                <input
                  type="number"
                  value={newTicket.estimatedCost}
                  onChange={e => setNewTicket(prev => ({ ...prev, estimatedCost: Number(e.target.value) }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreateTicket}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                إنشاء التذكرة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedMaintenance && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                  {selectedMaintenance.ticketNumber}
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  {selectedMaintenance.customerName} - {selectedMaintenance.customerPhone}
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status & Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(['received', 'in_progress', 'completed'] as MaintenanceStatus[]).map(status => {
                    const config = statusConfig[status];
                    const isActive = selectedMaintenance.status === status;
                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(selectedMaintenance, status)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                          isActive
                            ? `${config.bgColor} ${config.color}`
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
                {selectedMaintenance.status !== 'delivered' && selectedMaintenance.status !== 'cancelled' && (
                  <button
                    onClick={() => {
                      setDeliverAmount(selectedMaintenance.collectedAmount || selectedMaintenance.estimatedCost);
                      setShowDeliverModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Truck size={18} />
                    تسليم وحفظ
                  </button>
                )}
              </div>

              {/* Device Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">الجهاز</p>
                  <p className="font-medium text-gray-800 dark:text-white">
                    {selectedMaintenance.deviceType} {selectedMaintenance.deviceModel}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">تاريخ الاستلام</p>
                  <p className="font-medium text-gray-800 dark:text-white">
                    {formatDate(selectedMaintenance.receivedAt)}
                  </p>
                </div>
              </div>

              {/* Problem */}
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">المشكلة</p>
                <p className="text-gray-800 dark:text-white">{selectedMaintenance.problem}</p>
              </div>

              {/* Diagnosis */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  التشخيص
                </label>
                <textarea
                  value={selectedMaintenance.diagnosis}
                  onChange={e => onUpdateMaintenance(selectedMaintenance.id, { diagnosis: e.target.value })}
                  rows={2}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              {/* Parts Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-gray-800 dark:text-white">قطع الغيار</h4>
                  <button
                    onClick={() => setShowAddPartModal(true)}
                    className="flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 text-sm"
                  >
                    <Plus size={16} />
                    إضافة قطعة
                  </button>
                </div>
                
                {selectedMaintenance.parts.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">لم يتم إضافة قطع غيار</p>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-600 dark:text-gray-300">القطعة</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الكمية</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-600 dark:text-gray-300">التكلفة</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الإجمالي</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {selectedMaintenance.parts.map(part => (
                        <tr key={part.id}>
                          <td className="px-4 py-2 text-gray-800 dark:text-white">{part.name}</td>
                          <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{part.quantity}</td>
                          <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{formatCurrency(part.unitCost)}</td>
                          <td className="px-4 py-2 font-medium text-gray-800 dark:text-white">{formatCurrency(part.total)}</td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => onRemovePart(selectedMaintenance.id, part.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Profit Calculator */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-700 p-4 rounded-xl border-2 border-blue-100 dark:border-gray-600">
                <h4 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  💰 حاسبة الربح
                </h4>
                <div className="space-y-3">
                  {/* Parts Cost */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">🧩 تكلفة قطع الغيار:</span>
                    <span className="font-medium text-gray-800 dark:text-white">
                      {formatCurrency(selectedMaintenance.parts.reduce((sum, p) => sum + p.total, 0))}
                    </span>
                  </div>

                  {/* Additional Expenses */}
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-gray-600 dark:text-gray-400 whitespace-nowrap">➕ مصروفات إضافية:</label>
                    <input
                      type="number"
                      value={selectedMaintenance.additionalExpenses}
                      onChange={e => onUpdateMaintenance(selectedMaintenance.id, { 
                        additionalExpenses: Number(e.target.value) 
                      })}
                      placeholder="0"
                      className="w-32 p-2 text-left border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Total Cost */}
                  <div className="flex items-center justify-between pt-2 border-t border-blue-200 dark:border-gray-600">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">الإجمالي تكلفة عليك:</span>
                    <span className="font-bold text-red-600">
                      {formatCurrency(
                        selectedMaintenance.parts.reduce((sum, p) => sum + p.total, 0) +
                        selectedMaintenance.additionalExpenses
                      )}
                    </span>
                  </div>

                  {/* Collected Amount - ALWAYS visible */}
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <label className="text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                     💵 المبلغ المحصل من العميل:
                    </label>
                    <input
                      type="number"
                      value={selectedMaintenance.collectedAmount || ''}
                      onChange={e => onUpdateMaintenance(selectedMaintenance.id, { 
                        collectedAmount: Number(e.target.value) 
                      })}
                      placeholder="0"
                      className="w-32 p-2 text-left border-2 border-green-400 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-white font-bold text-sm focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  {/* Live Profit */}
                  <div className={`mt-2 p-3 rounded-lg flex items-center justify-between ${
                    calculateProfit(selectedMaintenance) >= 0 
                      ? 'bg-green-100 dark:bg-green-900/30' 
                      : 'bg-red-100 dark:bg-red-900/30'
                  }`}>
                    <span className="font-bold text-gray-800 dark:text-white">
                      🎯 صافي الربح:
                    </span>
                    <span className={`text-xl font-bold ${
                      calculateProfit(selectedMaintenance) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(calculateProfit(selectedMaintenance))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ملاحظات
                </label>
                <textarea
                  value={selectedMaintenance.notes}
                  onChange={e => onUpdateMaintenance(selectedMaintenance.id, { notes: e.target.value })}
                  rows={2}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between">
              <button
                onClick={() => {
                  setShowReceiptModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Printer size={18} />
                طباعة إيصال
              </button>
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Part Modal */}
      {showAddPartModal && (
        <div className="modal-overlay" onClick={() => setShowAddPartModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">إضافة قطعة غيار</h3>
            </div>

            <div className="p-6 space-y-4">
              {/* Mode Toggle */}
              <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <button
                  onClick={() => setNewPart(prev => ({ ...prev, isManual: false }))}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                    !newPart.isManual
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  📦 من المخزون
                </button>
                <button
                  onClick={() => setNewPart(prev => ({ ...prev, isManual: true }))}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                    newPart.isManual
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  ✍️ إدخال يدوي
                </button>
              </div>

              {!newPart.isManual ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    القطعة
                  </label>
                  <select
                    value={newPart.inventoryId}
                    onChange={e => setNewPart(prev => ({ ...prev, inventoryId: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  >
                    <option value="">اختر القطعة</option>
                    {spareParts.map(part => (
                      <option key={part.id} value={part.id}>
                        {part.name} ({part.quantity} متاح) - {formatCurrency(part.costPrice)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      اسم القطعة *
                    </label>
                    <input
                      type="text"
                      value={newPart.manualName}
                      onChange={e => setNewPart(prev => ({ ...prev, manualName: e.target.value }))}
                      placeholder="مثال: شاشة + لاصق"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      تكلفة القطعة (للوحدة)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newPart.manualCost}
                      onChange={e => setNewPart(prev => ({ ...prev, manualCost: Number(e.target.value) }))}
                      placeholder="0"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  الكمية
                </label>
                <input
                  type="number"
                  min="1"
                  value={newPart.quantity}
                  onChange={e => setNewPart(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              {/* Live Total */}
              {newPart.isManual ? (
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <span className="text-sm text-gray-600 dark:text-gray-400">إجمالي تكلفة القطعة:</span>
                  <span className="font-bold text-blue-600">
                    {formatCurrency(newPart.manualCost * newPart.quantity)}
                  </span>
                </div>
              ) : (
                newPart.inventoryId && (
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <span className="text-sm text-gray-600 dark:text-gray-400">إجمالي تكلفة القطعة:</span>
                    <span className="font-bold text-blue-600">
                      {formatCurrency(
                        (spareParts.find(p => p.id === newPart.inventoryId)?.costPrice || 0) * newPart.quantity
                      )}
                    </span>
                  </div>
                )
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowAddPartModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddPart}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                إضافة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deliver Modal */}
      {showDeliverModal && selectedMaintenance && (
        <div className="modal-overlay" onClick={() => setShowDeliverModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">تسليم الجهاز</h3>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">تكلفة قطع الغيار</p>
                <p className="text-xl font-bold text-gray-800 dark:text-white">
                  {formatCurrency(selectedMaintenance.parts.reduce((sum, p) => sum + p.total, 0))}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  المبلغ المحصل من العميل
                </label>
                <div className="relative">
                  <DollarSign className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="number"
                    value={deliverAmount}
                    onChange={e => setDeliverAmount(Number(e.target.value))}
                    className="w-full p-3 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  الخزنة
                </label>
                <select
                  value={deliverSafe}
                  onChange={e => setDeliverSafe(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  {safes.map(safe => (
                    <option key={safe.id} value={safe.id}>{safe.name}</option>
                  ))}
                </select>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">الربح المتوقع</p>
                <p className="text-xl font-bold text-green-600">
                  {formatCurrency(
                    deliverAmount - 
                    selectedMaintenance.parts.reduce((sum, p) => sum + p.total, 0) - 
                    selectedMaintenance.additionalExpenses
                  )}
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowDeliverModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleDeliver}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                تأكيد التسليم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceiptModal && selectedMaintenance && (
        <div className="modal-overlay" onClick={() => setShowReceiptModal(false)}>
          <div
            className="print-section bg-white rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6" id="maintenance-receipt">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold">MOBPOS</h2>
                <p className="text-gray-500">إيصال صيانة</p>
              </div>

              <div className="border-t border-b py-4 mb-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">رقم التذكرة:</span>
                  <span className="font-mono font-bold">{selectedMaintenance.ticketNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">التاريخ:</span>
                  <span>{formatDate(selectedMaintenance.receivedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">العميل:</span>
                  <span>{selectedMaintenance.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">الهاتف:</span>
                  <span>{selectedMaintenance.customerPhone}</span>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-gray-600 mb-1">الجهاز:</p>
                <p className="font-medium">{selectedMaintenance.deviceType} {selectedMaintenance.deviceModel}</p>
              </div>

              <div className="mb-4">
                <p className="text-gray-600 mb-1">المشكلة:</p>
                <p>{selectedMaintenance.problem}</p>
              </div>

              {selectedMaintenance.parts.length > 0 && (
                <div className="mb-4">
                  <p className="text-gray-600 mb-2">قطع الغيار:</p>
                  {selectedMaintenance.parts.map(part => (
                    <div key={part.id} className="flex justify-between text-sm">
                      <span>{part.name} × {part.quantity}</span>
                      <span>{formatCurrency(part.total)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4">
                <div className="flex justify-between font-bold text-lg">
                  <span>الإجمالي:</span>
                  <span className="text-blue-600">
                    {formatCurrency(selectedMaintenance.collectedAmount || selectedMaintenance.estimatedCost)}
                  </span>
                </div>
              </div>

              <div className="text-center mt-6 text-sm text-gray-500">
                <p>شكراً لثقتكم بنا</p>
              </div>
            </div>

            <div className="p-4 border-t flex gap-2 no-print">
              <button
                onClick={() => { printReceipt(); }}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <Printer size={18} />
                طباعة
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="flex-1 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
