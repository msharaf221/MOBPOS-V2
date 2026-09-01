import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, X, Trash2, Truck, Printer, Eye, Package,
  Banknote, FileText, AlertTriangle
} from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';
import { usePagination } from '../hooks/usePagination';
import PaginationBar from './PaginationBar';
import { printReceipt } from '../utils/print';
import { InventoryItem, Purchase, Safe, Supplier, User, IMEIUnit } from '../types';

type ImeiDraft = Pick<IMEIUnit, 'imei1' | 'imei2' | 'color' | 'storage' | 'ram' | 'condition' | 'warrantyEndDate' | 'notes'>;

interface DraftLine {
  key: string;
  inventoryId: string;
  quantity: number;
  unitCost: number;
  imeis: ImeiDraft[];
}

interface PurchasesProps {
  purchases: Purchase[];
  suppliers: Supplier[];
  inventory: InventoryItem[];
  safes: Safe[];
  users: User[];
  shopName: string;
  onCreatePurchase: (data: {
    supplierId: string;
    items: { inventoryId: string; quantity: number; unitCost: number; imeis?: ImeiDraft[] }[];
    paid: number;
    safeId: string;
    notes?: string;
    updateCostPrice?: boolean;
  }) => { ok: true; purchase: Purchase } | { ok: false; error: string };
  onPaySupplier: (supplierId: string, amount: number, safeId: string, notes?: string) => { ok: true } | { ok: false; error: string };
}

const emptyImei = (): ImeiDraft => ({
  imei1: '', imei2: '', color: '', storage: '', ram: '',
  condition: 'new', warrantyEndDate: '', notes: ''
});

export default function Purchases({
  purchases, suppliers, inventory, safes, users, shopName, onCreatePurchase, onPaySupplier
}: PurchasesProps) {
  const defaultSafe = safes.find(s => s.isDefault) || safes[0];

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [detail, setDetail] = useState<Purchase | null>(null);

  // ===== create form state =====
  const [supplierId, setSupplierId] = useState('');
  const [safeId, setSafeId] = useState(defaultSafe?.id || '');
  const [paid, setPaid] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [updateCostPrice, setUpdateCostPrice] = useState(true);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [formError, setFormError] = useState('');

  // ===== supplier payment state =====
  const [payForm, setPayForm] = useState({ supplierId: '', amount: 0, safeId: defaultSafe?.id || '', notes: '' });

  useEffect(() => {
    if (!safeId && defaultSafe) setSafeId(defaultSafe.id);
  }, [defaultSafe, safeId]);

  const supplierName = (id: string) => suppliers.find(s => s.id === id)?.name || 'مورد محذوف';
  const productName = (id: string) => inventory.find(i => i.id === id)?.name || 'صنف محذوف';
  const userName = (id: string) => users.find(u => u.id === id)?.name || '-';

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return purchases
      .filter(p => {
        const matchesTerm = !term
          || p.invoiceNumber.toLowerCase().includes(term)
          || supplierName(p.supplierId).toLowerCase().includes(term)
          || p.notes.toLowerCase().includes(term);
        const status = p.remaining <= 0 ? 'paid' : p.paid > 0 ? 'partial' : 'unpaid';
        return matchesTerm && (statusFilter === 'all' || statusFilter === status);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, searchTerm, statusFilter, suppliers]);

  const page = usePagination(filtered, { defaultPageSize: 20, storageKey: 'mobpos_page_size_purchases' });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    page.resetPage();
  }, [searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const total = purchases.reduce((sum, p) => sum + p.total, 0);
    const paidTotal = purchases.reduce((sum, p) => sum + p.paid, 0);
    const due = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance), 0);
    return { count: purchases.length, total, paidTotal, due };
  }, [purchases, suppliers]);

  const draftTotal = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0),
    [lines]
  );

  const productResults = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return [];
    return inventory
      .filter(i => i.name.toLowerCase().includes(term) || i.code.toLowerCase().includes(term) || i.barcode.includes(term))
      .slice(0, 8);
  }, [inventory, productSearch]);

  const resetForm = () => {
    setSupplierId('');
    setSafeId(defaultSafe?.id || '');
    setPaid('');
    setNotes('');
    setUpdateCostPrice(true);
    setLines([]);
    setProductSearch('');
    setFormError('');
  };

  const addLine = (item: InventoryItem) => {
    setLines(prev => {
      if (prev.some(l => l.inventoryId === item.id)) return prev;
      return [...prev, {
        key: `${item.id}-${Date.now()}`,
        inventoryId: item.id,
        quantity: 1,
        unitCost: item.costPrice || 0,
        imeis: item.hasIMEI ? [emptyImei()] : []
      }];
    });
    setProductSearch('');
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines(prev => prev.map(line => {
      if (line.key !== key) return line;
      const next = { ...line, ...patch };
      const item = inventory.find(i => i.id === next.inventoryId);
      if (item?.hasIMEI) {
        const qty = Math.max(1, Number(next.quantity) || 1);
        const imeis = [...next.imeis];
        while (imeis.length < qty) imeis.push(emptyImei());
        next.imeis = imeis.slice(0, qty);
      }
      return next;
    }));
  };

  const updateImei = (key: string, index: number, patch: Partial<ImeiDraft>) => {
    setLines(prev => prev.map(line => line.key === key
      ? { ...line, imeis: line.imeis.map((u, i) => i === index ? { ...u, ...patch } : u) }
      : line));
  };

  const handleSave = () => {
    setFormError('');
    if (!supplierId) { setFormError('اختر المورد'); return; }
    if (lines.length === 0) { setFormError('أضف صنف واحد على الأقل'); return; }
    const paidValue = Number(paid) || 0;
    const result = onCreatePurchase({
      supplierId,
      safeId,
      paid: paidValue,
      notes,
      updateCostPrice,
      items: lines.map(l => ({
        inventoryId: l.inventoryId,
        quantity: Number(l.quantity) || 0,
        unitCost: Number(l.unitCost) || 0,
        imeis: l.imeis.length ? l.imeis : undefined
      }))
    });
    if (!result.ok) { setFormError(result.error); return; }
    setShowCreate(false);
    resetForm();
    setDetail(result.purchase);
  };

  const handlePay = () => {
    const result = onPaySupplier(payForm.supplierId, Number(payForm.amount) || 0, payForm.safeId, payForm.notes);
    if (!result.ok) { alert(result.error); return; }
    setShowPayModal(false);
    setPayForm({ supplierId: '', amount: 0, safeId: defaultSafe?.id || '', notes: '' });
  };

  const statusBadge = (p: Purchase) => {
    if (p.remaining <= 0) return <span className="px-2 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">مدفوعة</span>;
    if (p.paid > 0) return <span className="px-2 py-1 rounded-lg text-xs font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">جزئي</span>;
    return <span className="px-2 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">آجل</span>;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">فواتير المشتريات</h1>
          <p className="text-gray-500 dark:text-gray-400">توريد البضاعة من الموردين وتحديث المخزون والمديونيات</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setPayForm({ supplierId: '', amount: 0, safeId: defaultSafe?.id || '', notes: '' }); setShowPayModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Banknote size={18} />
            سداد لمورد
          </button>
          <button
            onClick={() => { resetForm(); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            فاتورة شراء جديدة
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">عدد الفواتير</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.count}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">إجمالي المشتريات</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(stats.total)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">المدفوع</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.paidTotal)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">مستحق للموردين</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.due)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="بحث برقم الفاتورة أو اسم المورد..."
            className="w-full pr-10 pl-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
        >
          <option value="all">كل الحالات</option>
          <option value="paid">مدفوعة</option>
          <option value="partial">مدفوعة جزئياً</option>
          <option value="unpaid">آجل</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="p-3 text-right">رقم الفاتورة</th>
                <th className="p-3 text-right">المورد</th>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">الأصناف</th>
                <th className="p-3 text-right">الإجمالي</th>
                <th className="p-3 text-right">المدفوع</th>
                <th className="p-3 text-right">المتبقي</th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {page.pageRows.map(p => (
                <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="p-3 font-mono font-bold text-gray-800 dark:text-white">{p.invoiceNumber}</td>
                  <td className="p-3 text-gray-700 dark:text-gray-200">{supplierName(p.supplierId)}</td>
                  <td className="p-3 text-gray-500 dark:text-gray-400">{formatDate(p.createdAt)}</td>
                  <td className="p-3 text-gray-500 dark:text-gray-400">{p.items.length}</td>
                  <td className="p-3 font-bold text-gray-800 dark:text-white">{formatCurrency(p.total)}</td>
                  <td className="p-3 text-green-600">{formatCurrency(p.paid)}</td>
                  <td className="p-3 text-red-600">{formatCurrency(p.remaining)}</td>
                  <td className="p-3">{statusBadge(p)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => setDetail(p)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-blue-600"
                      title="عرض الفاتورة"
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="p-10 text-center text-gray-500 dark:text-gray-400">
            <Truck size={40} className="mx-auto mb-3 opacity-40" />
            لا توجد فواتير مشتريات
          </div>
        )}

        <PaginationBar
          total={page.total}
          page={page.page}
          pageSize={page.pageSize}
          totalPages={page.totalPages}
          from={page.from}
          to={page.to}
          canPrev={page.canPrev}
          canNext={page.canNext}
          onPageChange={page.setPage}
          onPageSizeChange={page.setPageSize}
          itemLabel="فاتورة"
        />
      </div>

      {/* ===== CREATE MODAL ===== */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <FileText size={20} className="text-blue-600" />
                فاتورة شراء جديدة
              </h3>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">المورد *</label>
                  <select
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  >
                    <option value="">اختر المورد</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {suppliers.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">لازم تضيف مورد الأول من صفحة الموردين</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">الخزنة (للمبلغ المدفوع)</label>
                  <select
                    value={safeId}
                    onChange={e => setSafeId(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  >
                    {safes.map(s => <option key={s.id} value={s.id}>{s.name} — {formatCurrency(s.balance)}</option>)}
                  </select>
                </div>
              </div>

              {/* product picker */}
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">إضافة صنف</label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الكود أو الباركود..."
                    className="w-full pr-10 pl-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                  {productResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {productResults.map(item => (
                        <button
                          key={item.id}
                          onClick={() => addLine(item)}
                          className="w-full text-right px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-between"
                        >
                          <span className="text-gray-800 dark:text-white">{item.name}</span>
                          <span className="text-xs text-gray-500">
                            {item.hasIMEI ? 'بسيريال' : `متاح: ${item.quantity}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* lines */}
              <div className="space-y-3">
                {lines.map(line => {
                  const item = inventory.find(i => i.id === line.inventoryId);
                  return (
                    <div key={line.key} className="border border-gray-200 dark:border-gray-600 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <Package size={18} className="text-blue-500" />
                          <span className="font-bold text-gray-800 dark:text-white">{item?.name}</span>
                          {item?.hasIMEI && <span className="text-[11px] px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">IMEI</span>}
                        </div>
                        <button
                          onClick={() => setLines(prev => prev.filter(l => l.key !== line.key))}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">الكمية</label>
                          <input
                            type="number" min={1}
                            value={line.quantity}
                            onChange={e => updateLine(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">سعر الشراء للوحدة</label>
                          <input
                            type="number" min={0}
                            value={line.unitCost}
                            onChange={e => updateLine(line.key, { unitCost: Number(e.target.value) || 0 })}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">الإجمالي</label>
                          <div className="p-2 font-bold text-gray-800 dark:text-white">
                            {formatCurrency((Number(line.quantity) || 0) * (Number(line.unitCost) || 0))}
                          </div>
                        </div>
                      </div>

                      {item?.hasIMEI && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs text-gray-500">سيريالات الأجهزة ({line.imeis.length})</p>
                          {line.imeis.map((unit, index) => (
                            <div key={index} className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <input
                                value={unit.imei1}
                                onChange={e => updateImei(line.key, index, { imei1: e.target.value })}
                                placeholder={`IMEI 1 - جهاز ${index + 1}`}
                                className="p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white font-mono"
                              />
                              <input
                                value={unit.imei2}
                                onChange={e => updateImei(line.key, index, { imei2: e.target.value })}
                                placeholder="IMEI 2 (اختياري)"
                                className="p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white font-mono"
                              />
                              <input
                                value={unit.color}
                                onChange={e => updateImei(line.key, index, { color: e.target.value })}
                                placeholder="اللون"
                                className="p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                              />
                              <input
                                value={unit.storage}
                                onChange={e => updateImei(line.key, index, { storage: e.target.value })}
                                placeholder="المساحة"
                                className="p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* totals */}
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-lg font-bold text-gray-800 dark:text-white">
                  <span>إجمالي الفاتورة:</span>
                  <span className="text-blue-600">{formatCurrency(draftTotal)}</span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">المدفوع الآن</label>
                    <input
                      type="number" min={0}
                      value={paid}
                      onChange={e => setPaid(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0"
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                    />
                    <button
                      onClick={() => setPaid(draftTotal)}
                      className="mt-1 text-xs text-blue-600 hover:underline"
                    >
                      دفع الإجمالي
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">المتبقي (على حساب المورد)</label>
                    <div className="p-2 font-bold text-red-600">
                      {formatCurrency(Math.max(0, draftTotal - (Number(paid) || 0)))}
                    </div>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={updateCostPrice}
                    onChange={e => setUpdateCostPrice(e.target.checked)}
                    className="w-4 h-4"
                  />
                  تحديث سعر التكلفة في المخزون بآخر سعر شراء
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="ملاحظات على الفاتورة"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 text-sm">
                  <AlertTriangle size={18} />
                  {formError}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-gray-800">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold"
              >
                حفظ الفاتورة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SUPPLIER PAYMENT MODAL ===== */}
      {showPayModal && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">سداد لمورد</h3>
              <button onClick={() => setShowPayModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">المورد</label>
                <select
                  value={payForm.supplierId}
                  onChange={e => setPayForm(prev => ({ ...prev, supplierId: e.target.value }))}
                  className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  <option value="">اختر المورد</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} — مستحق: {s.balance}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">المبلغ</label>
                <input
                  type="number" min={0}
                  value={payForm.amount || ''}
                  onChange={e => setPayForm(prev => ({ ...prev, amount: Number(e.target.value) || 0 }))}
                  className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">من خزنة</label>
                <select
                  value={payForm.safeId}
                  onChange={e => setPayForm(prev => ({ ...prev, safeId: e.target.value }))}
                  className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  {safes.map(s => <option key={s.id} value={s.id}>{s.name} — {formatCurrency(s.balance)}</option>)}
                </select>
              </div>
              <input
                value={payForm.notes}
                onChange={e => setPayForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="ملاحظات (اختياري)"
                className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
            <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowPayModal(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">
                إلغاء
              </button>
              <button onClick={handlePay} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold">
                تسجيل السداد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DETAIL / PRINT MODAL ===== */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div
            className="print-section bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6" id="purchase-invoice">
              <div className="text-center mb-5 pb-4 border-b border-dashed border-gray-300">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">{shopName}</h2>
                <p className="text-xs text-gray-500 mt-1">فاتورة مشتريات (نسخة داخلية)</p>
              </div>

              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300 pb-3 mb-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex justify-between">
                  <span>رقم الفاتورة:</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white">{detail.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>التاريخ:</span>
                  <span>{formatDateTime(detail.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>المورد:</span>
                  <span className="font-bold text-gray-900 dark:text-white">{supplierName(detail.supplierId)}</span>
                </div>
                <div className="flex justify-between">
                  <span>بواسطة:</span>
                  <span>{userName(detail.userId)}</span>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {detail.items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div className="flex-1 pl-2">
                      <p className="font-bold text-gray-900 dark:text-white">{productName(item.inventoryId)}</p>
                      <p className="text-xs text-gray-500">{item.quantity} × {formatCurrency(item.unitCost)}</p>
                      {item.imeiUnitIds && item.imeiUnitIds.length > 0 && (
                        <p className="text-[10px] text-gray-400">{item.imeiUnitIds.length} جهاز بسيريال</p>
                      )}
                    </div>
                    <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-gray-300 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between font-black text-base text-gray-900 dark:text-white">
                  <span>الإجمالي:</span>
                  <span className="text-blue-600">{formatCurrency(detail.total)}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>المدفوع:</span>
                  <span>{formatCurrency(detail.paid)}</span>
                </div>
                <div className="flex justify-between text-red-600 font-bold">
                  <span>المتبقي للمورد:</span>
                  <span>{formatCurrency(detail.remaining)}</span>
                </div>
              </div>

              {detail.notes && (
                <p className="mt-4 text-xs text-gray-500">ملاحظات: {detail.notes}</p>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 no-print">
              <button
                onClick={() => { printReceipt(); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700"
              >
                <Printer size={18} />
                طباعة
              </button>
              <button
                onClick={() => setDetail(null)}
                className="px-5 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-bold rounded-xl"
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
