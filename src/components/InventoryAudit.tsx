import { useMemo, useState } from 'react';
import { ClipboardCheck, Search, Save, CheckCircle2, Trash2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { Category, IMEIUnit, InventoryAudit as InventoryAuditType, InventoryItem, User } from '../types';
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
  ) => InventoryAuditType;
  onApplyAudit: (auditId: string) => InventoryAuditType | null;
  onDeleteAudit: (auditId: string) => void;
}

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
  const [searchTerm, setSearchTerm] = useState('');
  const [title, setTitle] = useState(`جرد ${new Date().toLocaleDateString('ar-EG')}`);
  const [notes, setNotes] = useState('');
  const [counts, setCounts] = useState<Record<string, { countedQuantity: number; notes: string }>>({});

  const formatCurrency = (value: number) => new Intl.NumberFormat(localStorage.getItem('app_locale') || 'ar-EG', {
    style: 'currency',
    currency: localStorage.getItem('app_currency') || 'EGP',
    maximumFractionDigits: 0
  }).format(value || 0);

  const getActualQuantity = (item: InventoryItem) => {
    if (item.hasIMEI) {
      return imeiUnits.filter(u => u.inventoryId === item.id && u.status === 'available').length;
    }
    return item.quantity;
  };

  const rows = useMemo(() => inventory.map(item => {
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
  }).filter(row => {
    const search = searchTerm.toLowerCase();
    return row.item.name.toLowerCase().includes(search) || row.item.code.toLowerCase().includes(search) || row.item.barcode.includes(search);
  }), [inventory, categories, imeiUnits, counts, searchTerm]);

  const allRows = useMemo(() => inventory.map(item => {
    const systemQuantity = getActualQuantity(item);
    return {
      inventoryId: item.id,
      countedQuantity: counts[item.id]?.countedQuantity ?? systemQuantity,
      notes: counts[item.id]?.notes || ''
    };
  }), [inventory, imeiUnits, counts]);

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

  const setCount = (id: string, countedQuantity: number) => {
    setCounts(prev => ({ ...prev, [id]: { countedQuantity: Math.max(0, countedQuantity || 0), notes: prev[id]?.notes || '' } }));
  };

  const setRowNotes = (id: string, rowNotes: string) => {
    const item = inventory.find(i => i.id === id);
    setCounts(prev => ({
      ...prev,
      [id]: { countedQuantity: prev[id]?.countedQuantity ?? (item ? getActualQuantity(item) : 0), notes: rowNotes }
    }));
  };

  const handleSave = (applyNow: boolean) => {
    if (inventory.length === 0) {
      alert('لا يوجد مخزون لعمل الجرد');
      return;
    }
    if (applyNow && !confirm('سيتم اعتماد الجرد وتحديث كميات المنتجات العادية. منتجات IMEI تظهر فروقاتها فقط وتحتاج ضبط من إدارة IMEI. هل تريد المتابعة؟')) return;
    const audit = onCreateAudit(title, allRows, notes, applyNow);
    alert(`تم حفظ الجرد رقم ${audit.auditNumber}${applyNow ? ' واعتماده' : ''}`);
    setActiveTab('history');
    setCounts({});
    setNotes('');
    setTitle(`جرد ${new Date().toLocaleDateString('ar-EG')}`);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">جرد المخزون</h1>
          <p className="text-gray-500 dark:text-gray-400">تسجيل الكميات الفعلية ومقارنة العجز والزيادة مع السيستم</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('new')} className={`px-4 py-2 rounded-lg ${activeTab === 'new' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700'}`}>جرد جديد</button>
          <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-lg ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700'}`}>سجل الجردات</button>
        </div>
      </div>

      {activeTab === 'new' ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat title="أصناف بها فرق" value={totals.changed} color="blue" />
            <Stat title="إجمالي العجز" value={totals.shortage} color="red" />
            <Stat title="إجمالي الزيادة" value={totals.surplus} color="green" />
            <Stat title="قيمة الفرق" value={formatCurrency(totals.netCost)} color={totals.netCost < 0 ? 'red' : 'green'} />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اسم الجرد</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ملاحظات عامة</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="مثلاً: جرد آخر الشهر" className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white" />
              </div>
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="بحث بالاسم أو الكود أو الباركود..." className="w-full py-2 pr-10 pl-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الصنف</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الفئة</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">كمية السيستم</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">الكمية الفعلية</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">الفرق</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.map(row => (
                    <tr key={row.item.id} className={row.difference !== 0 ? 'bg-yellow-50 dark:bg-yellow-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800 dark:text-white">{row.item.name}</div>
                        <div className="text-xs text-gray-500">{row.item.code} {row.item.hasIMEI ? '• IMEI' : ''}</div>
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
                      <td className="px-4 py-3"><input value={row.notes} onChange={e => setRowNotes(row.item.id, e.target.value)} className="w-48 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <div className="p-8 text-center text-gray-500">لا توجد أصناف</div>}
          </div>

          <div className="flex flex-col md:flex-row gap-3 justify-end">
            <button onClick={() => handleSave(false)} className="flex items-center justify-center gap-2 px-5 py-3 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"><Save size={20} />حفظ كمسودة</button>
            <button onClick={() => handleSave(true)} className="flex items-center justify-center gap-2 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"><CheckCircle2 size={20} />اعتماد الجرد وتحديث المخزون</button>
          </div>
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
