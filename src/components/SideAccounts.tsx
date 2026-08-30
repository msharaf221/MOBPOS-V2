import { useMemo, useState, useEffect } from 'react';
import { formatCurrency } from '../utils/format';
import { usePagination } from '../hooks/usePagination';
import PaginationBar from './PaginationBar';

import type React from 'react';
import { Plus, Search, Trash2, WalletCards, ArrowDownCircle, ArrowUpCircle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { Safe, SideAccountEntry, SideAccountEntryType, SideAccountImpact, SideAccountStatus } from '../types';
import { downloadExcel } from '../utils/reports';

interface SideAccountsProps {
  entries: SideAccountEntry[];
  safes: Safe[];
  onAddEntry: (input: {
    partyName: string;
    type: SideAccountEntryType;
    impact: SideAccountImpact;
    amount: number;
    paidAmount: number;
    description: string;
    notes: string;
    safeId: string;
    dueDate: string;
    newSafeName?: string;
  }) => SideAccountEntry | null;
  onUpdateEntry: (id: string, updates: Partial<Pick<SideAccountEntry, 'paidAmount' | 'status' | 'notes' | 'dueDate'>> & { safeId?: string }) => void;
  onDeleteEntry: (id: string) => void;
}

const typeLabels: Record<SideAccountEntryType, string> = {
  receivable: 'ليّا عنده',
  payable: 'عليّا له',
  incoming: 'فلوس داخلة',
  outgoing: 'فلوس خارجة'
};

const impactLabels: Record<SideAccountImpact, string> = {
  none: 'بدون تأثير على المحل',
  main_safe: 'الخزنة الرئيسية',
  capital: 'رأس المال',
  separate_safe: 'خزنة مستقلة'
};

const statusLabels: Record<SideAccountStatus, string> = {
  open: 'مفتوح',
  partial: 'مدفوع جزئي',
  settled: 'مقفل'
};

export default function SideAccounts({ entries, safes, onAddEntry, onUpdateEntry, onDeleteEntry }: SideAccountsProps) {
  const defaultSafe = safes.find(s => s.isDefault) || safes[0];
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | SideAccountStatus>('all');
  const [form, setForm] = useState({
    partyName: '',
    type: 'receivable' as SideAccountEntryType,
    impact: 'none' as SideAccountImpact,
    amount: 0,
    paidAmount: 0,
    description: '',
    notes: '',
    safeId: defaultSafe?.id || '',
    dueDate: '',
    newSafeName: ''
  });

  const filteredEntries = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return entries.filter(entry => {
      const matchesSearch = entry.partyName.toLowerCase().includes(term) || entry.description.toLowerCase().includes(term) || entry.notes.toLowerCase().includes(term);
      const matchesFilter = filter === 'all' || entry.status === filter;
      return matchesSearch && matchesFilter;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [entries, searchTerm, filter]);

  const entriesPage = usePagination(filteredEntries, { defaultPageSize: 50, storageKey: 'mobpos_page_size_side_accounts' });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    entriesPage.resetPage();
  }, [searchTerm, filter]);

  const stats = useMemo(() => {
    const receivable = entries.filter(e => e.type === 'receivable').reduce((sum, e) => sum + Math.max(0, e.amount - e.paidAmount), 0);
    const payable = entries.filter(e => e.type === 'payable').reduce((sum, e) => sum + Math.max(0, e.amount - e.paidAmount), 0);
    const incoming = entries.filter(e => e.type === 'incoming').reduce((sum, e) => sum + e.amount, 0);
    const outgoing = entries.filter(e => e.type === 'outgoing').reduce((sum, e) => sum + e.amount, 0);
    return { receivable, payable, net: receivable - payable, incoming, outgoing };
  }, [entries]);

  const handleAdd = () => {
    if (!form.partyName.trim()) {
      alert('اسم الشخص / الجهة مطلوب');
      return;
    }
    if (form.amount <= 0) {
      alert('المبلغ لازم يكون أكبر من صفر');
      return;
    }
    if ((form.type === 'incoming' || form.type === 'outgoing') && form.impact !== 'none' && form.impact !== 'separate_safe' && !form.safeId) {
      alert('اختر الخزنة');
      return;
    }
    const payload = (form.type === 'receivable' || form.type === 'payable')
      ? { ...form, impact: 'none' as SideAccountImpact, safeId: '', newSafeName: '' }
      : form;
    const result = onAddEntry(payload);
    if (!result) {
      alert('تعذر حفظ العملية');
      return;
    }
    setShowModal(false);
    setForm({ partyName: '', type: 'receivable', impact: 'none', amount: 0, paidAmount: 0, description: '', notes: '', safeId: defaultSafe?.id || '', dueDate: '', newSafeName: '' });
  };

  const [settleEntry, setSettleEntry] = useState<SideAccountEntry | null>(null);
  const [settleAmount, setSettleAmount] = useState(0);
  const [settleSafeId, setSettleSafeId] = useState('');

  const openSettle = (entry: SideAccountEntry) => {
    setSettleEntry(entry);
    setSettleAmount(entry.paidAmount || 0);
    setSettleSafeId(entry.safeId || defaultSafe?.id || '');
  };

  const handleSettle = () => {
    if (!settleEntry) return;
    const amount = Math.min(settleEntry.amount, Math.max(0, Number(settleAmount) || 0));
    if (amount !== settleEntry.paidAmount && !settleSafeId) {
      alert('اختر الخزنة التي تحصّل/تدفع منها المبلغ');
      return;
    }
    onUpdateEntry(settleEntry.id, { paidAmount: amount, safeId: settleSafeId });
    setSettleEntry(null);
  };

  const statusBadge = (status: SideAccountStatus) => {
    if (status === 'settled') return 'badge-success';
    if (status === 'partial') return 'badge-warning';
    return 'badge-danger';
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">الحسابات الجانبية</h1>
          <p className="text-gray-500 dark:text-gray-400">نوتة فلوس شخصية/جانبية مع اختيار تأثيرها على الخزنة أو رأس المال</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => downloadExcel(`side-accounts-${new Date().toISOString().slice(0, 10)}`, ['الشخص', 'النوع', 'التأثير', 'المبلغ', 'المدفوع', 'المتبقي', 'الحالة', 'الوصف', 'التاريخ'], entries.map(e => [e.partyName, typeLabels[e.type], impactLabels[e.impact], e.amount, e.paidAmount, Math.max(0, e.amount - e.paidAmount), statusLabels[e.status], e.description, new Date(e.createdAt).toLocaleString('ar-EG')]))}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition"
          ><FileSpreadsheet size={20} />تصدير</button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"><Plus size={20} />عملية جديدة</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat title="إجمالي اللي ليك" value={formatCurrency(stats.receivable)} icon="down" color="green" />
        <Stat title="إجمالي اللي عليك" value={formatCurrency(stats.payable)} icon="up" color="red" />
        <Stat title="الصافي" value={formatCurrency(stats.net)} icon="wallet" color={stats.net >= 0 ? 'green' : 'red'} />
        <Stat title="فلوس داخلة" value={formatCurrency(stats.incoming)} icon="down" color="blue" />
        <Stat title="فلوس خارجة" value={formatCurrency(stats.outgoing)} icon="up" color="orange" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="بحث باسم الشخص أو الوصف..." className="w-full py-2 pr-10 pl-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0" />
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value as 'all' | SideAccountStatus)} className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0">
            <option value="all">كل الحالات</option>
            <option value="open">مفتوح</option>
            <option value="partial">مدفوع جزئي</option>
            <option value="settled">مقفل</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الشخص / الجهة</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">النوع</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">التأثير</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">المبلغ</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">المتبقي</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الحالة</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">التاريخ</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {entriesPage.pageRows.map(entry => {
                const remaining = entry.type === 'receivable' || entry.type === 'payable' ? Math.max(0, entry.amount - entry.paidAmount) : 0;
                return (
                  <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 dark:text-white">{entry.partyName}</div>
                      <div className="text-xs text-gray-500">{entry.description || entry.notes || '-'}</div>
                    </td>
                    <td className="px-4 py-3"><span className={`badge ${entry.type === 'receivable' || entry.type === 'incoming' ? 'badge-success' : 'badge-danger'}`}>{typeLabels[entry.type]}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {impactLabels[entry.impact]}
                      {entry.safeId && <div className="text-xs text-gray-500">{safes.find(s => s.id === entry.safeId)?.name}</div>}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-800 dark:text-white">{formatCurrency(entry.amount)}</td>
                    <td className="px-4 py-3 font-bold text-gray-800 dark:text-white">{remaining ? formatCurrency(remaining) : '-'}</td>
                    <td className="px-4 py-3"><span className={`badge ${statusBadge(entry.status)}`}>{statusLabels[entry.status]}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(entry.createdAt).toLocaleDateString('ar-EG')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {(entry.type === 'receivable' || entry.type === 'payable') && <button onClick={() => openSettle(entry)} className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg" title="تحديث المدفوع"><CheckCircle2 size={18} /></button>}
                        <button onClick={() => { if (confirm('حذف العملية؟ لو العملية أثرت على خزنة سيتم عكس أثرها.')) onDeleteEntry(entry.id); }} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredEntries.length === 0 && <div className="p-8 text-center text-gray-500 dark:text-gray-400">لا توجد عمليات مطابقة</div>}

                <PaginationBar
                  total={entriesPage.total}
                  page={entriesPage.page}
                  pageSize={entriesPage.pageSize}
                  totalPages={entriesPage.totalPages}
                  from={entriesPage.from}
                  to={entriesPage.to}
                  canPrev={entriesPage.canPrev}
                  canNext={entriesPage.canNext}
                  onPageChange={entriesPage.setPage}
                  onPageSizeChange={entriesPage.setPageSize}
                  itemLabel="عملية"
                />
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">إضافة عملية جانبية</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="الشخص / الجهة *"><input value={form.partyName} onChange={e => setForm(prev => ({ ...prev, partyName: e.target.value }))} className="input" /></Field>
                <Field label="المبلغ *"><input type="number" min={0} value={form.amount} onChange={e => setForm(prev => ({ ...prev, amount: Number(e.target.value) }))} className="input" /></Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="نوع العملية">
                  <select value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value as SideAccountEntryType, impact: (e.target.value === 'incoming' || e.target.value === 'outgoing') ? prev.impact : 'none' }))} className="input">
                    <option value="receivable">ليّا عند الشخص / الجهة</option>
                    <option value="payable">عليّا للشخص / الجهة</option>
                    <option value="incoming">فلوس داخلة فعلاً</option>
                    <option value="outgoing">فلوس خارجة فعلاً</option>
                  </select>
                </Field>
                <Field label="التأثير المالي">
                  <select value={form.impact} onChange={e => setForm(prev => ({ ...prev, impact: e.target.value as SideAccountImpact }))} className="input">
                    <option value="none">بدون تأثير على حسابات المحل</option>
                    <option value="main_safe">تدخل/تخرج من الخزنة الرئيسية</option>
                    <option value="capital">تدخل/تخرج كرأس مال</option>
                    <option value="separate_safe">خزنة مستقلة</option>
                  </select>
                </Field>
              </div>

              {(form.type === 'incoming' || form.type === 'outgoing') && form.impact !== 'none' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <Field label={form.impact === 'separate_safe' ? 'اختر خزنة مستقلة موجودة' : 'الخزنة'}>
                    <select value={form.safeId} onChange={e => setForm(prev => ({ ...prev, safeId: e.target.value }))} className="input">
                      {safes.map(safe => <option key={safe.id} value={safe.id}>{safe.name} - {formatCurrency(safe.balance)}</option>)}
                    </select>
                  </Field>
                  {form.impact === 'separate_safe' && <Field label="أو اسم خزنة جديدة"><input value={form.newSafeName} onChange={e => setForm(prev => ({ ...prev, newSafeName: e.target.value }))} placeholder="مثلاً: خزنة الحسابات الجانبية" className="input" /></Field>}
                </div>
              )}

              {(form.type === 'receivable' || form.type === 'payable') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="المدفوع من المبلغ حتى الآن"><input type="number" min={0} value={form.paidAmount} onChange={e => setForm(prev => ({ ...prev, paidAmount: Number(e.target.value) }))} className="input" /></Field>
                  <Field label="تاريخ استحقاق اختياري"><input type="date" value={form.dueDate} onChange={e => setForm(prev => ({ ...prev, dueDate: e.target.value }))} className="input" /></Field>
                </div>
              )}

              <Field label="الوصف"><input value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="سبب العملية" className="input" /></Field>
              <Field label="ملاحظات"><textarea rows={3} value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} className="input" /></Field>

              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                لو اخترت "بدون تأثير" العملية هتفضل نوتة فقط. لو اخترت خزنة أو رأس مال، التأثير يتم فقط مع "فلوس داخلة" أو "فلوس خارجة".
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">إلغاء</button>
              <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ</button>
            </div>
          </div>
        </div>
      )}

      {settleEntry && (
        <div className="modal-overlay" onClick={() => setSettleEntry(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">تحديث المدفوع — {settleEntry.partyName}</h3>
              <button onClick={() => setSettleEntry(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {settleEntry.type === 'receivable' ? 'المبلغ المحصّل هيدخل كفلوس فعلاً في الخزنة المختارة.' : 'المبلغ المسدّد هيخرج فعلاً من الخزنة المختارة.'}
              </p>
              <Field label={`إجمالي المدفوع حتى الآن (من أصل ${formatCurrency(settleEntry.amount)})`}>
                <input
                  type="number"
                  min={0}
                  max={settleEntry.amount}
                  value={settleAmount}
                  onChange={e => setSettleAmount(Number(e.target.value))}
                  className="input"
                />
              </Field>
              {settleAmount !== settleEntry.paidAmount && (
                <Field label="الخزنة">
                  <select value={settleSafeId} onChange={e => setSettleSafeId(e.target.value)} className="input">
                    <option value="">— اختر الخزنة —</option>
                    {safes.map(safe => <option key={safe.id} value={safe.id}>{safe.name} - {formatCurrency(safe.balance)}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setSettleEntry(null)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300">إلغاء</button>
              <button onClick={handleSettle} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>{children}</div>;
}

function Stat({ title, value, icon, color }: { title: string; value: string; icon: 'down' | 'up' | 'wallet'; color: 'green' | 'red' | 'blue' | 'orange' }) {
  const colorMap = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
  };
  const Icon = icon === 'down' ? ArrowDownCircle : icon === 'up' ? ArrowUpCircle : WalletCards;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}><Icon size={20} /></div>
        <div><p className="text-gray-500 dark:text-gray-400 text-sm">{title}</p><p className="text-lg font-bold text-gray-800 dark:text-white">{value}</p></div>
      </div>
    </div>
  );
}
