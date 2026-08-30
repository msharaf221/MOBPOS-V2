import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ClipboardCheck,
  Search,
  Save,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  FileSpreadsheet,
  ChevronRight,
  ChevronLeft,
  Play,
  RotateCcw,
  Check,
  XCircle,
  CheckSquare,
  ListChecks
} from 'lucide-react';
import { Category, IMEIUnit, InventoryAudit as InventoryAuditType, InventoryItem, User } from '../types';
import { buildImeiStockIndex } from '../utils/stockCounts';
import { formatCurrency } from '../utils/format';
import { downloadExcel } from '../utils/reports';

interface InventoryAuditProps {
  inventory: InventoryItem[];
  categories: Category[];
  imeiUnits: IMEIUnit[];
  audits: InventoryAuditType[];
  users: User[];
  onCreateAudit: (
    title: string,
    rows: Array<{ inventoryId: string; countedQuantity: number; notes: string }>,
    notes: string,
    applyNow: boolean
  ) => InventoryAuditType | null;
  onApplyAudit: (auditId: string) => InventoryAuditType | null;
  onDeleteAudit: (auditId: string) => void;
}

type AuditStep = 'setup' | 'count' | 'review';
type TypeFilter = 'all' | 'regular' | 'imei';
type StatusFilter = 'all' | 'counted' | 'notCounted' | 'difference';

const STORAGE_KEY = 'mobpos_inventory_audit_draft_v1';
const PAGE_SIZES = [
  { value: 10, label: '10 صنف' },
  { value: 20, label: '20 صنف' },
  { value: 50, label: '50 صنف' },
  { value: 100, label: '100 صنف' },
  { value: 0, label: 'الكل' }
];

export default function InventoryAudit({
  inventory,
  categories,
  imeiUnits,
  audits,
  users,
  onCreateAudit,
  onApplyAudit,
  onDeleteAudit
}: InventoryAuditProps) {
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [step, setStep] = useState<AuditStep>('setup');
  const [searchTerm, setSearchTerm] = useState('');
  const [title, setTitle] = useState(`جرد ${new Date().toLocaleDateString('ar-EG')}`);
  const [notes, setNotes] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [preselectAll, setPreselectAll] = useState(true);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, { countedQuantity: number; notes: string }>>({});
  const [savedToast, setSavedToast] = useState('');

  // كمية IMEI المتاحة من فهرس واحد بدل مسح كامل لكل صنف: شاشة الجرد بتلف
  // على كل المنتجات مع كل ضغطة صفحة وكل تعديل كمية.
  const imeiStock = useMemo(() => buildImeiStockIndex(imeiUnits), [imeiUnits]);
  const getActualQuantity = (item: InventoryItem) => imeiStock.availableStockOf(item);
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  // ===== Local draft helpers (so a big count can be resumed page by page) =====
  const loadDraft = (): any | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const persistDraft = () => {
    if (activeTab !== 'new') return;
    const hasWorkingData = includedIds.size > 0 || Object.keys(counts).length > 0;
    if (step === 'setup' && !hasWorkingData) {
      clearDraft();
      return;
    }
    const draft = {
      step,
      title,
      notes,
      categoryFilter,
      typeFilter,
      statusFilter,
      searchTerm,
      pageSize,
      preselectAll,
      counts,
      includedIds: Array.from(includedIds),
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // storage unavailable — the count still works, just not resumable
    }
  };

  const clearDraft = () => localStorage.removeItem(STORAGE_KEY);

  const resetNewAudit = (message?: string) => {
    setCounts({});
    setIncludedIds(new Set());
    setNotes('');
    setTitle(`جرد ${new Date().toLocaleDateString('ar-EG')}`);
    setSearchTerm('');
    setCategoryFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
    setPage(1);
    setStep('setup');
    clearDraft();
    if (message) setSavedToast(message);
  };

  // Resume an unfinished count when the user returns to the page
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setTitle(draft.title || `جرد ${new Date().toLocaleDateString('ar-EG')}`);
      setNotes(draft.notes || '');
      setStep(draft.step === 'count' || draft.step === 'review' ? draft.step : 'setup');
      setCategoryFilter(draft.categoryFilter || 'all');
      setTypeFilter(draft.typeFilter || 'all');
      setStatusFilter(draft.statusFilter || 'all');
      setSearchTerm(draft.searchTerm || '');
      setPageSize(draft.pageSize ?? 20);
      setPreselectAll(draft.preselectAll !== false);
      setCounts(draft.counts || {});
      setIncludedIds(new Set(draft.includedIds || []));
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the local draft up to date while the user is counting
  useEffect(() => {
    persistDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, step, title, notes, categoryFilter, typeFilter, statusFilter, searchTerm, pageSize, preselectAll, counts, includedIds]);

  useEffect(() => {
    if (!savedToast) return;
    const t = setTimeout(() => setSavedToast(''), 4000);
    return () => clearTimeout(t);
  }, [savedToast]);

  // Reset to page 1 when a filter changes
  useEffect(() => {
    setPage(1);
  }, [searchTerm, categoryFilter, typeFilter, statusFilter, pageSize]);

  // ===== Rows =====
  const rows = useMemo(() => inventory.map(item => {
    const systemQuantity = getActualQuantity(item);
    const countedQuantity = counts[item.id]?.countedQuantity ?? systemQuantity;
    const difference = countedQuantity - systemQuantity;
    return {
      item,
      category: categoryById.get(item.categoryId),
      systemQuantity,
      countedQuantity,
      difference,
      differenceCost: difference * item.costPrice,
      notes: counts[item.id]?.notes || '',
      isCounted: includedIds.has(item.id)
    };
  }).filter(row => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = row.item.name.toLowerCase().includes(search)
      || (row.item.code || '').toLowerCase().includes(search)
      || (row.item.barcode || '').includes(search);
    const matchesCategory = categoryFilter === 'all' || row.item.categoryId === categoryFilter;
    const matchesType = typeFilter === 'all'
      || (typeFilter === 'imei' && row.item.hasIMEI)
      || (typeFilter === 'regular' && !row.item.hasIMEI);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'counted' && row.isCounted)
      || (statusFilter === 'notCounted' && !row.isCounted)
      || (statusFilter === 'difference' && row.difference !== 0);
    return matchesSearch && matchesCategory && matchesType && matchesStatus;
  }), [inventory, categoryById, imeiStock, counts, includedIds, searchTerm, categoryFilter, typeFilter, statusFilter]);

  // Rows that will actually be saved into the audit
  const allRows = useMemo(() => inventory
    .filter(item => includedIds.has(item.id))
    .map(item => ({
      inventoryId: item.id,
      countedQuantity: counts[item.id]?.countedQuantity ?? getActualQuantity(item),
      notes: counts[item.id]?.notes || ''
    })), [inventory, includedIds, counts, imeiUnits]);

  const totals = useMemo(() => {
    const full = inventory.map(item => {
      const systemQuantity = getActualQuantity(item);
      const countedQuantity = counts[item.id]?.countedQuantity ?? systemQuantity;
      const difference = countedQuantity - systemQuantity;
      return { difference, differenceCost: difference * item.costPrice };
    });
    return {
      shortage: full.filter(r => r.difference < 0).reduce((sum, r) => sum + Math.abs(r.difference), 0),
      surplus: full.filter(r => r.difference > 0).reduce((sum, r) => sum + r.difference, 0),
      netCost: full.reduce((sum, r) => sum + r.differenceCost, 0),
      changed: full.filter(r => r.difference !== 0).length
    };
  }, [inventory, imeiUnits, counts]);

  // Totals for the rows the user actually included in this audit
  const selectedTotals = useMemo(() => {
    const selected = inventory.filter(item => includedIds.has(item.id));
    const full = selected.map(item => {
      const systemQuantity = getActualQuantity(item);
      const countedQuantity = counts[item.id]?.countedQuantity ?? systemQuantity;
      const difference = countedQuantity - systemQuantity;
      return { difference, differenceCost: difference * item.costPrice };
    });
    return {
      shortage: full.filter(r => r.difference < 0).reduce((sum, r) => sum + Math.abs(r.difference), 0),
      surplus: full.filter(r => r.difference > 0).reduce((sum, r) => sum + r.difference, 0),
      netCost: full.reduce((sum, r) => sum + r.differenceCost, 0),
      changed: full.filter(r => r.difference !== 0).length
    };
  }, [inventory, includedIds, imeiUnits, counts]);

  // ===== Pagination =====
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = pageSize === 0
    ? rows
    : rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  // ===== Count handlers =====
  const setCount = (id: string, countedQuantity: number) => {
    setCounts(prev => ({
      ...prev,
      [id]: { countedQuantity: Math.max(0, countedQuantity || 0), notes: prev[id]?.notes || '' }
    }));
    // If the user types any value, include this item automatically
    setIncludedIds(prev => prev.has(id) ? prev : new Set(prev).add(id));
  };

  const setRowNotes = (id: string, rowNotes: string) => {
    const item = inventory.find(i => i.id === id);
    setCounts(prev => ({
      ...prev,
      [id]: { countedQuantity: prev[id]?.countedQuantity ?? (item ? getActualQuantity(item) : 0), notes: rowNotes }
    }));
  };

  const toggleInclude = (id: string, checked: boolean) => {
    setIncludedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleCurrentPage = (checked: boolean) => {
    const ids = pageRows.map(r => r.item.id);
    setIncludedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => checked ? next.add(id) : next.delete(id));
      return next;
    });
  };

  const markOnlyDifferences = () => {
    setIncludedIds(new Set(rows.filter(r => r.difference !== 0).map(r => r.item.id)));
    setStatusFilter('all');
  };

  const markAllVisible = () => {
    setIncludedIds(new Set(rows.map(r => r.item.id)));
    setStatusFilter('all');
  };

  const startCount = () => {
    if (inventory.length === 0) {
      alert('لا يوجد مخزون لعمل الجرد');
      return;
    }
    setIncludedIds(new Set(preselectAll ? inventory.map(i => i.id) : []));
    setPage(1);
    setStep('count');
    setSavedToast('');
  };

  // ===== Save / Review =====
  const handleSave = (applyNow: boolean) => {
    if (inventory.length === 0) {
      alert('لا يوجد مخزون لعمل الجرد');
      return;
    }
    if (includedIds.size === 0) {
      alert('لم تقم بتحديد الأصناف التي تم عدّها.\nاستخدم مربع الاختيار في كل صف أو زر "تحديد الكل في الصفحة".');
      return;
    }
    if (applyNow && !confirm('سيتم اعتماد الجرد وتحديث كميات المنتجات العادية. منتجات IMEI تظهر فروقاتها فقط وتحتاج ضبط من إدارة IMEI. هل تريد المتابعة؟')) return;
    const audit = onCreateAudit(title, allRows, notes, applyNow);
    if (!audit) {
      alert('تعذر حفظ الجرد: تحقق من الكميات والبيانات المدخلة.');
      return;
    }
    resetNewAudit(`✅ تم حفظ الجرد رقم ${audit.auditNumber}${applyNow ? ' واعتماده' : ''}`);
  };

  const handleSaveProgress = () => {
    persistDraft();
    setSavedToast('💾 تم حفظ التقدم محليًا — عدّل باقي الأصناف ولا تقلق، هتلاقيه محفوظ لما ترجع.');
  };

  const goReview = () => {
    if (includedIds.size === 0) {
      alert('اختر الأصناف التي تم عدّها أولًا (علّمها بعلامة ✓).');
      return;
    }
    setStatusFilter('all');
    setSearchTerm('');
    setStep('review');
  };

  const reviewRows = useMemo(() => inventory
    .filter(item => includedIds.has(item.id))
    .map(item => {
      const systemQuantity = getActualQuantity(item);
      const countedQuantity = counts[item.id]?.countedQuantity ?? systemQuantity;
      const difference = countedQuantity - systemQuantity;
      return {
        item,
        category: categories.find(c => c.id === item.categoryId),
        systemQuantity,
        countedQuantity,
        difference,
        differenceCost: difference * item.costPrice,
        notes: counts[item.id]?.notes || ''
      };
    })
    .filter(r => r.difference !== 0 || r.notes)
    .sort((a, b) => b.differenceCost - a.differenceCost), [inventory, includedIds, categories, imeiUnits, counts]);

  const reviewedCount = includedIds.size;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">جرد المخزون</h1>
          <p className="text-gray-500 dark:text-gray-400">قسم الجرد لصفحات صغيرة مع إمكانية العدّ صنفًا صنفًا ثم المراجعة والاعتماد</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('new')} className={`px-4 py-2 rounded-lg ${activeTab === 'new' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700'}`}>جرد جديد</button>
          <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-lg ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700'}`}>سجل الجردات</button>
        </div>
      </div>

      {savedToast && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-800 dark:text-green-200 text-sm">
          <CheckCircle2 size={18} />
          {savedToast}
        </div>
      )}

      {activeTab === 'new' ? (
        <>
          {step !== 'setup' && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <StepBadge active={false} done icon={<ClipboardCheck size={16} />} label="الإعداد" />
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <StepBadge active={step === 'count'} done={step === 'review'} icon={<ListChecks size={16} />} label="العد" />
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <StepBadge active={step === 'review'} icon={<CheckCircle2 size={16} />} label="المراجعة والاعتماد" />
            </div>
          )}

          {step === 'setup' && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اسم الجرد</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ملاحظات عامة</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="مثلاً: جرد آخر الشهر" className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white" />
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl space-y-3">
                <p className="text-sm font-bold text-gray-800 dark:text-white">طريقة إدارة الجرد</p>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={preselectAll} onChange={e => setPreselectAll(e.target.checked)} className="w-4 h-4" />
                  تحديد كل الأصناف تلقائيًا عند بدء الجرد (وراح تقدر تلغي أي صنف من صفحة العد)
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">لو فتحت جرد كبير، فعّل هذا الخيار لتبدأ بالجدول كله ثم تقدر تقسمه بالصفحات. لو تريد العد الهندي/المرحلة-بمرحلة، ألغِه وسجّل كل صفحة على حدة.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">حجم الصفحة أثناء العد</label>
                  <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                    {PAGE_SIZES.map(ps => <option key={ps.value} value={ps.value}>{ps.label}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    إجمالي الأصناف: <b className="text-gray-800 dark:text-white">{inventory.length}</b>
                    {localStorage.getItem(STORAGE_KEY) && ' • يوجد جرد سابق غير مكتمل وسيتم استكماله تلقائيًا'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={startCount} className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Play size={20} />
                  البدء في العد
                </button>
              </div>
            </div>
          )}

          {step === 'count' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Stat title="إجمالي الأصناف" value={inventory.length} color="blue" />
                <Stat title="تم عدّها" value={`${reviewedCount} / ${inventory.length}`} color={reviewedCount === inventory.length ? 'green' : 'blue'} />
                <Stat title="أصناف بها فرق" value={totals.changed} color="blue" />
                <Stat title="إجمالي العجز" value={totals.shortage} color="red" />
                <Stat title="قيمة الفرق" value={formatCurrency(totals.netCost)} color={totals.netCost < 0 ? 'red' : 'green'} />
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="بحث بالاسم أو الكود أو الباركود..." className="w-full py-2 pr-10 pl-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0" />
                </div>
                <div className="flex flex-col md:flex-row gap-3">
                  <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0">
                    <option value="all">جميع الفئات</option>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as TypeFilter)} className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0">
                    <option value="all">عادي + IMEI</option>
                    <option value="regular">منتجات عادية فقط</option>
                    <option value="imei">أجهزة IMEI فقط</option>
                  </select>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0">
                    <option value="all">كل الأصناف</option>
                    <option value="counted">التي تم عدّها فقط</option>
                    <option value="notCounted">التي لم يتم عدّها</option>
                    <option value="difference">فروقات فقط</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-500">أدوات سريعة:</span>
                  <button onClick={() => toggleCurrentPage(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold"><CheckSquare size={14} /> تحديد كل الصفحة</button>
                  <button onClick={() => toggleCurrentPage(false)} className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold"><XCircle size={14} /> إلغاء الصفحة</button>
                  <button onClick={markAllVisible} className="flex items-center gap-1 px-3 py-1.5 border border-blue-600 text-blue-600 rounded-lg text-xs font-bold"><CheckCircle2 size={14} /> تحديد كل النتائج</button>
                  <button onClick={markOnlyDifferences} className="flex items-center gap-1 px-3 py-1.5 border border-amber-500 text-amber-600 rounded-lg text-xs font-bold"><AlertTriangle size={14} /> تحديد فروقات فقط</button>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={pageRows.length > 0 && pageRows.every(r => r.isCounted)}
                            onChange={e => toggleCurrentPage(e.target.checked)}
                            title="تحديد جميع الصفحة"
                            className="w-4 h-4 accent-blue-600"
                          />
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الصنف</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الفئة</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">كمية السيستم</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">الكمية الفعلية</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">الفرق</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {pageRows.map(row => (
                        <tr key={row.item.id} className={row.difference !== 0 ? 'bg-yellow-50 dark:bg-yellow-900/10' : row.isCounted ? 'bg-green-50/50 dark:bg-green-900/5' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={row.isCounted}
                              onChange={e => toggleInclude(row.item.id, e.target.checked)}
                              title="تم عدّ هذا الصنف / ضمن الجرد"
                              className="w-4 h-4 accent-green-600"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800 dark:text-white">{row.item.name}</span>
                              {row.item.hasIMEI && <span className="text-[10px] font-bold text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded">IMEI</span>}
                              {row.isCounted && <Check size={14} className="text-green-600" />}
                            </div>
                            <div className="text-xs text-gray-500">{row.item.code} {row.item.barcode ? `• ${row.item.barcode}` : ''}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.category?.name || '-'}</td>
                          <td className="px-4 py-3 text-center font-bold text-gray-800 dark:text-white">{row.systemQuantity}</td>
                          <td className="px-4 py-3 text-center">
                            <input type="number" min={0} value={row.countedQuantity} onChange={e => setCount(row.item.id, Number(e.target.value))} className="w-24 p-2 text-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-bold ${row.difference < 0 ? 'text-red-600' : row.difference > 0 ? 'text-green-600' : 'text-gray-500'}`}>{row.difference > 0 ? `+${row.difference}` : row.difference}</span>
                            <div className="text-xs text-gray-500">{formatCurrency(row.differenceCost)}</div>
                          </td>
                          <td className="px-4 py-3"><input value={row.notes} onChange={e => setRowNotes(row.item.id, e.target.value)} className="w-40 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {rows.length === 0 && <div className="p-8 text-center text-gray-500">لا توجد أصناف مطابقة للفلتر</div>}

                <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    إجمالي النتائج: <b className="text-gray-800 dark:text-white">{rows.length}</b>
                    {pageSize !== 0 && <> • صفحة <b className="text-gray-800 dark:text-white">{safePage}</b> من {totalPages}</>}
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0 text-sm">
                      {PAGE_SIZES.map(ps => <option key={ps.value} value={ps.value}>{ps.label}</option>)}
                    </select>
                    <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight size={16} /> السابق</button>
                    <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed">التالي <ChevronLeft size={16} /></button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-3 justify-between">
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleSaveProgress} className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg"><Save size={20} /> حفظ التقدم مؤقتًا</button>
                  <button onClick={() => setStep('setup')} className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg"><RotateCcw size={20} /> رجوع للإعداد</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleSave(false)} className="flex items-center justify-center gap-2 px-5 py-3 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"><Save size={20} /> حفظ كمسودة</button>
                  <button onClick={goReview} className="flex items-center justify-center gap-2 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"><CheckCircle2 size={20} /> مراجعة الجرد</button>
                </div>
              </div>
            </>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">مراجعة الجرد قبل الاعتماد</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Stat title="أصناف تم عدّها" value={reviewedCount} color="blue" />
                  <Stat title="أصناف بها فرق" value={selectedTotals.changed} color="blue" />
                  <Stat title="إجمالي العجز" value={selectedTotals.shortage} color="red" />
                  <Stat title="قيمة الفرق" value={formatCurrency(selectedTotals.netCost)} color={selectedTotals.netCost < 0 ? 'red' : 'green'} />
                </div>
                {title && <p className="mt-4 text-sm text-gray-500">اسم الجرد: <b className="text-gray-800 dark:text-white">{title}</b></p>}
                {notes && <p className="text-sm text-gray-500">ملاحظات: {notes}</p>}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="font-bold text-gray-800 dark:text-white">فروقات الجرد المحدد</h4>
                  <p className="text-sm text-gray-500">لو معلومات من غير فرق مش هتظهر هنا عشان الصفحة تفضل مرتاحة.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الصنف</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">السيستم</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">الفعلي</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">الفرق</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {reviewRows.map(row => (
                        <tr key={row.item.id}>
                          <td className="px-4 py-3 text-gray-800 dark:text-white">{row.item.name} {row.item.hasIMEI && <span className="text-xs text-purple-600">IMEI</span>}</td>
                          <td className="px-4 py-3 text-center">{row.systemQuantity}</td>
                          <td className="px-4 py-3 text-center">{row.countedQuantity}</td>
                          <td className={`px-4 py-3 text-center font-bold ${row.difference < 0 ? 'text-red-600' : 'text-green-600'}`}>{row.difference > 0 ? `+${row.difference}` : row.difference}</td>
                          <td className="px-4 py-3 text-gray-500">{row.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {reviewRows.length === 0 && <div className="p-8 text-center text-gray-500">لا توجد فروقات في الأصناف المحددة — الجرد متطابق مع السيستم.</div>}
              </div>

              <div className="flex flex-col md:flex-row gap-3 justify-between">
                <button onClick={() => setStep('count')} className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg"><RotateCcw size={20} /> رجوع للعد</button>
                <div className="flex gap-2">
                  <button onClick={() => handleSave(false)} className="flex items-center justify-center gap-2 px-5 py-3 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"><Save size={20} /> حفظ كمسودة</button>
                  <button onClick={() => handleSave(true)} className="flex items-center justify-center gap-2 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"><CheckCircle2 size={20} /> اعتماد الجرد وتحديث المخزون</button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-bold text-gray-800 dark:text-white">سجل الجردات السابقة</h3>
            <button
              onClick={() => downloadExcel(`inventory-audits-${new Date().toISOString().slice(0, 10)}`, ['رقم الجرد', 'الاسم', 'الحالة', 'تاريخ الإنشاء', 'العجز', 'الزيادة', 'قيمة الفرق'], audits.map(a => [a.auditNumber, a.title, a.status === 'applied' ? 'معتمد' : 'مسودة', new Date(a.createdAt).toLocaleString('ar-EG'), a.totalShortage, a.totalSurplus, a.netDifferenceCost]))}
              className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            ><FileSpreadsheet size={18} />تصدير</button>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {audits.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(audit => (
              <details key={audit.id} className="p-4 group">
                <summary className="cursor-pointer flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="font-bold text-gray-800 dark:text-white">{audit.auditNumber} - {audit.title}</div>
                    <div className="text-sm text-gray-500">{new Date(audit.createdAt).toLocaleString('ar-EG')} • {users.find(u => u.id === audit.userId)?.name || 'مستخدم'}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${audit.status === 'applied' ? 'badge-success' : 'badge-warning'}`}>{audit.status === 'applied' ? 'معتمد' : 'مسودة'}</span>
                    <span className="badge badge-danger">عجز {audit.totalShortage}</span>
                    <span className="badge badge-success">زيادة {audit.totalSurplus}</span>
                    {audit.status === 'draft' && <button onClick={(e) => { e.preventDefault(); if (confirm('اعتماد الجرد سيحدث كميات المنتجات العادية. متابعة؟')) onApplyAudit(audit.id); }} className="px-3 py-1 bg-green-600 text-white rounded-lg">اعتماد</button>}
                    <button onClick={(e) => { e.preventDefault(); if (confirm('حذف سجل الجرد؟')) onDeleteAudit(audit.id); }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                  </div>
                </summary>
                <div className="mt-4 overflow-x-auto">
                  {audit.notes && <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">ملاحظات: {audit.notes}</p>}
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700"><tr><th className="px-3 py-2 text-right">الصنف</th><th className="px-3 py-2 text-center">السيستم</th><th className="px-3 py-2 text-center">الفعلي</th><th className="px-3 py-2 text-center">الفرق</th><th className="px-3 py-2 text-right">ملاحظات</th></tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {audit.items.filter(i => i.difference !== 0 || i.notes).map(item => (
                        <tr key={item.id}><td className="px-3 py-2 text-gray-800 dark:text-white">{item.productName} {item.hasIMEI && <span className="text-xs text-purple-600">IMEI</span>}</td><td className="px-3 py-2 text-center">{item.systemQuantity}</td><td className="px-3 py-2 text-center">{item.countedQuantity}</td><td className={`px-3 py-2 text-center font-bold ${item.difference < 0 ? 'text-red-600' : 'text-green-600'}`}>{item.difference > 0 ? `+${item.difference}` : item.difference}</td><td className="px-3 py-2 text-gray-500">{item.notes}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {audit.items.every(i => i.difference === 0 && !i.notes) && <div className="p-4 text-center text-gray-500">لا توجد فروقات في هذا الجرد</div>}
                </div>
              </details>
            ))}
            {audits.length === 0 && <div className="p-8 text-center text-gray-500"><ClipboardCheck className="mx-auto mb-2" />لا توجد جردات محفوظة</div>}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200">
        <AlertTriangle size={20} className="mt-0.5" />
        <p className="text-sm">ملاحظة: اعتماد الجرد يحدث كميات المنتجات العادية فقط. منتجات الأجهزة المرتبطة بـ IMEI يتم عرض فروقاتها للتوثيق، وتعديلها يكون من صفحة إدارة IMEI للحفاظ على أرقام الأجهزة.</p>
      </div>
    </div>
  );
}

function Stat({ title, value, color }: { title: string; value: string | number; color: 'blue' | 'red' | 'green' }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}><ClipboardCheck size={20} /></div>
        <div><p className="text-gray-500 dark:text-gray-400 text-sm">{title}</p><p className={`text-xl font-bold ${colors[color].split(' ')[1]}`}>{value}</p></div>
      </div>
    </div>
  );
}

function StepBadge({ active, done, icon, label }: { active: boolean; done?: boolean; icon: ReactNode; label: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${active ? 'bg-blue-600 text-white' : done ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'}`}>
      {done && !active ? <Check size={14} /> : icon}
      {label}
    </div>
  );
}
