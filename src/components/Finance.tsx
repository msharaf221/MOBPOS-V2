import { useState, useMemo, useEffect } from 'react';
import { formatCurrency, formatDate as formatIntlDate } from '../utils/format';
import { usePagination } from '../hooks/usePagination';
import PaginationBar from './PaginationBar';

import {
  TrendingUp, TrendingDown, Wallet, Plus, X, ArrowUpCircle,
  ArrowDownCircle, Filter, BarChart3, FileText, Receipt,
  Printer, FileSpreadsheet
} from 'lucide-react';
import {
  openPrintReport, downloadExcel, buildDailyCloseReport, fmtDate
} from '../utils/reports';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { Transaction, Safe, Sale, Maintenance, SaleReturn, StockWaste } from '../types';

interface FinanceProps {
  transactions: Transaction[];
  safes: Safe[];
  sales: Sale[];
  maintenance: Maintenance[];
  saleReturns: SaleReturn[];
  stockWastes: StockWaste[];
  shopName: string;
  onAddTransaction: (
    type: 'income' | 'expense',
    amount: number,
    description: string,
    safeId: string
  ) => void;
  onDeleteTransaction: (id: string) => { ok: boolean; error?: string };
  onRecordWalletTransaction: (
    type: 'deposit' | 'withdrawal',
    amount: number,
    fee: number,
    cost: number,
    walletId: string,
    cashSafeId: string,
    notes: string
  ) => void;
}

type PeriodType = 'today' | 'week' | 'month' | 'year' | 'all';

export default function Finance({
  transactions,
  safes,
  sales,
  maintenance,
  saleReturns,
  stockWastes,
  shopName,
  onAddTransaction,
  onDeleteTransaction,
  onRecordWalletTransaction
}: FinanceProps) {
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletForm, setWalletForm] = useState({
    type: 'deposit' as 'deposit' | 'withdrawal',
    amount: '',
    fee: '',
    walletId: safes.find(s => s.isDefault)?.id || safes[0]?.id || '',
    cashSafeId: '',
    notes: ''
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleWalletSubmit = () => {
    if (!walletForm.amount || !walletForm.walletId) return;
    onRecordWalletTransaction(
      walletForm.type,
      Number(walletForm.amount),
      Number(walletForm.fee),
      0, // Cost is simplified out
      walletForm.walletId,
      walletForm.cashSafeId || walletForm.walletId,
      walletForm.notes
    );
    setShowWalletModal(false);
    setWalletForm({
      type: 'deposit',
      amount: '',
      fee: '',
      walletId: safes.find(s => s.isDefault)?.id || safes[0]?.id || '',
      cashSafeId: '',
      notes: ''
    });
    setShowAdvanced(false);
  };

  const [showModal, setShowModal] = useState(false);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: 0,
    description: '',
    safeId: safes.find(s => s.isDefault)?.id || ''
  });

  const formatDate = (dateStr: string) => formatIntlDate(dateStr, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Filter by period
  const getPeriodStart = (p: PeriodType): Date => {
    const now = new Date();
    switch (p) {
      case 'today':
        now.setHours(0, 0, 0, 0);
        return now;
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo;
      }
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      case 'year':
        return new Date(now.getFullYear(), 0, 1);
      default:
        return new Date(0);
    }
  };

  // Filtered transactions by period
  const periodTransactions = useMemo(() => {
    const startDate = getPeriodStart(period);
    return transactions.filter(t => new Date(t.createdAt) >= startDate);
  }, [transactions, period]);

  // Filtered by type
  const displayTransactions = useMemo(() => {
    let result = periodTransactions;
    if (typeFilter !== 'all') {
      if (typeFilter === 'income') {
        result = result.filter(t => t.amount > 0 && t.type !== 'transfer');
      } else if (typeFilter === 'expense') {
        result = result.filter(t => t.amount < 0);
      } else {
        result = result.filter(t => t.type === typeFilter);
      }
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [periodTransactions, typeFilter]);

  // حركة الخزينة كانت مقيّدة بـ slice(0, 50): أي أكتر من 50 معاملة في الشهر
  // بتبقى مخفية من غير أي طريقة للوصول ليها. بقى تقسيم صفحات كامل.
  const financePage = usePagination(displayTransactions, { defaultPageSize: 25, storageKey: 'mobpos_page_size_finance' });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    financePage.resetPage();
  }, [period, typeFilter]);

  // Calculate totals for period
  const stats = useMemo(() => {
    // These transaction types move cash without representing real business
    // revenue/expense, so they're excluded from the income statement:
    //  - transfer: money moving between the shop's own safes
    //  - wallet_deposit/wallet_withdrawal: gross pass-through principal for
    //    e-wallet services — the real revenue (fee - cost) is recorded
    //    separately as its own 'income' transaction
    //  - capital: owner equity injections/withdrawals, not profit or loss
    //  - side_account: settlement of personal/side debts tracked for
    //    convenience, not shop revenue/expense
    const nonPnlTypes: Transaction['type'][] = ['transfer', 'wallet_deposit', 'wallet_withdrawal', 'capital', 'side_account'];
    const income = periodTransactions
      .filter(t => t.amount > 0 && !nonPnlTypes.includes(t.type))
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = periodTransactions
      .filter(t => t.amount < 0 && !nonPnlTypes.includes(t.type))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    // Sales revenue & profit
    const startDate = getPeriodStart(period);
    const periodSales = sales.filter(s => new Date(s.createdAt) >= startDate);
    const salesRevenue = periodSales.reduce((sum, s) => sum + s.total, 0);
    const salesProfit = periodSales.reduce((sum, s) => sum + s.profit, 0);

    // Maintenance revenue & profit
    const periodMaint = maintenance.filter(m => 
      m.deliveredAt && new Date(m.deliveredAt) >= startDate
    );
    const maintRevenue = periodMaint.reduce((sum, m) => sum + m.collectedAmount, 0);
    const maintProfit = periodMaint.reduce((sum, m) => sum + m.profit, 0);
    // Match every other stat card: respect the selected period instead of summing all-time.
    const returnsTotal = saleReturns
      .filter(saleReturn => new Date(saleReturn.createdAt) >= startDate)
      .reduce((sum, saleReturn) => sum + saleReturn.refundAmount, 0);
    const wasteTotal = stockWastes
      .filter(waste => new Date(waste.createdAt) >= startDate)
      .reduce((sum, waste) => sum + waste.totalCost, 0);

    const totalBalance = safes.reduce((sum, s) => sum + s.balance, 0);
    const netProfit = income - expenses;

    return {
      income,
      expenses,
      netProfit,
      salesRevenue,
      salesProfit,
      maintRevenue,
      maintProfit,
      returnsTotal,
      wasteTotal,
      totalBalance,
      totalRevenue: salesRevenue + maintRevenue
    };
  }, [periodTransactions, sales, maintenance, safes, period, saleReturns, stockWastes]);

  // Chart data - last 6 months income vs expense
  const chartData = useMemo(() => {
    const months = [];
    const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.getMonth();
      const year = date.getFullYear();
      
      const monthTrans = transactions.filter(t => {
        const tDate = new Date(t.createdAt);
        return tDate.getMonth() === month && tDate.getFullYear() === year;
      });
      
      const nonPnlTypes: Transaction['type'][] = ['transfer', 'wallet_deposit', 'wallet_withdrawal', 'capital', 'side_account'];
      const inc = monthTrans.filter(t => t.amount > 0 && !nonPnlTypes.includes(t.type)).reduce((sum, t) => sum + t.amount, 0);
      const exp = monthTrans.filter(t => t.amount < 0 && !nonPnlTypes.includes(t.type)).reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      months.push({
        name: monthNames[month],
        إيرادات: inc,
        مصروفات: exp,
        صافي: inc - exp
      });
    }
    return months;
  }, [transactions]);

  // Income sources pie data
  const incomeSources = useMemo(() => {
    const startDate = getPeriodStart(period);
    const periodSales = sales.filter(s => new Date(s.createdAt) >= startDate);
    const salesRev = periodSales.reduce((sum, s) => sum + s.total, 0);
    
    const periodMaint = maintenance.filter(m => 
      m.deliveredAt && new Date(m.deliveredAt) >= startDate
    );
    const maintRev = periodMaint.reduce((sum, m) => sum + m.collectedAmount, 0);
    
    const otherIncome = periodTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    return [
      { name: 'مبيعات', value: salesRev },
      { name: 'صيانة', value: maintRev },
      { name: 'دخل آخر', value: otherIncome },
    ].filter(s => s.value > 0);
  }, [sales, maintenance, periodTransactions, period]);

  const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

  const handleSave = () => {
    if (!formData.amount || formData.amount <= 0) {
      alert('المبلغ يجب أن يكون أكبر من صفر');
      return;
    }
    if (!formData.description) {
      alert('الوصف مطلوب');
      return;
    }
    onAddTransaction(formData.type, formData.amount, formData.description, formData.safeId);
    setShowModal(false);
    setFormData({
      type: 'expense',
      amount: 0,
      description: '',
      safeId: safes.find(s => s.isDefault)?.id || ''
    });
  };

  const getTransactionIcon = (type: string, amount: number) => {
    if (amount > 0) return <ArrowUpCircle className="text-green-500" size={20} />;
    if (type === 'expense') return <ArrowDownCircle className="text-red-500" size={20} />;
    return <Receipt className="text-blue-500" size={20} />;
  };

  const getTransactionLabel = (type: string) => {
    const labels: Record<string, string> = {
      sale: 'مبيعة',
      purchase: 'شراء',
      maintenance: 'صيانة',
      expense: 'مصروف',
      income: 'دخل',
      transfer: 'تحويل',
      return: 'مرتجع',
      waste: 'هوالك',
      capital: 'رأس مال',
      side_account: 'حساب جانبي',
      customer_payment: 'دفعة عميل',
      wallet_deposit: 'إيداع محفظة',
      wallet_withdrawal: 'سحب محفظة'
    };
    return labels[type] || type;
  };

  const periodLabels: Record<PeriodType, string> = {
    today: 'اليوم',
    week: 'الأسبوع',
    month: 'الشهر',
    year: 'السنة',
    all: 'الكل'
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">المالية</h1>
          <p className="text-gray-500 dark:text-gray-400">إدارة الإيرادات والمصروفات والأرباح</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() =>
              openPrintReport({
                title: 'تقرير الإقفال اليومي',
                subtitle: formatIntlDate(new Date(), { dateStyle: 'full' }),
                shopName,
                sections: buildDailyCloseReport({ sales, saleReturns, transactions, safes }),
              })
            }
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/20"
          >
            <Printer size={20} />
            الإقفال اليومي (طباعة / PDF)
          </button>
          <button
            onClick={() =>
              downloadExcel(
                `movements-${new Date().toISOString().slice(0, 10)}`,
                ['الوقت', 'النوع', 'البيان', 'المبلغ'],
                [...transactions]
                  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                  .map(t => [fmtDate(t.createdAt), t.type, t.description, t.amount])
              )
            }
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition shadow-lg shadow-teal-600/20"
          >
            <FileSpreadsheet size={20} />
            تصدير Excel
          </button>
          <button
            onClick={() => setShowWalletModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition shadow-lg shadow-purple-600/20"
          >
            <Wallet size={20} />
            خدمات المحافظ
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-600/20"
          >
            <Plus size={20} />
            تسجيل عملية
          </button>
        </div>
      </div>

      {/* Period Filter */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-2 flex gap-1 overflow-x-auto">
        {(Object.keys(periodLabels) as PeriodType[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-shrink-0 px-5 py-2 rounded-lg text-sm font-medium transition ${
              period === p
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Balance */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <Wallet size={24} />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">إجمالي الرصيد</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(stats.totalBalance)}</p>
          <p className="text-blue-200 text-sm mt-1">في {safes.length} خزائن</p>
        </div>

        {/* Income */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
              <TrendingUp className="text-green-600" size={20} />
            </div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">الإيرادات</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(stats.income)}</p>
        </div>

        {/* Expenses */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
              <TrendingDown className="text-red-600" size={20} />
            </div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">المصروفات</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(stats.expenses)}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
              <ArrowDownCircle className="text-orange-600" size={20} />
            </div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">المرتجعات</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{formatCurrency(stats.returnsTotal)}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
              <Receipt className="text-gray-600 dark:text-gray-300" size={20} />
            </div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">الهوالك</p>
          <p className="text-2xl font-bold text-gray-700 dark:text-gray-300 mt-1">{formatCurrency(stats.wasteTotal)}</p>
        </div>

        {/* Net Profit */}
        <div className={`rounded-2xl p-5 shadow-sm border ${
          stats.netProfit >= 0
            ? 'bg-gradient-to-br from-green-500 to-emerald-600 border-green-400 text-white'
            : 'bg-gradient-to-br from-red-500 to-rose-600 border-red-400 text-white'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <BarChart3 size={24} />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
              {stats.netProfit >= 0 ? 'ربح' : 'خسارة'}
            </span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(stats.netProfit)}</p>
          <p className="text-white/80 text-sm mt-1">صافي {periodLabels[period]}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Income vs Expense Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 size={20} className="text-blue-600" />
            الإيرادات مقابل المصروفات (6 أشهر)
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                  formatter={(value) => formatCurrency(Number(value) || 0)}
                />
                <Legend />
                <Bar dataKey="إيرادات" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="مصروفات" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Income Sources Pie */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">مصادر الإيرادات</h3>
          {incomeSources.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-gray-400">
              <p>لا توجد إيرادات في هذه الفترة</p>
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={incomeSources}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                  >
                    {incomeSources.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value) || 0)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Profit Report */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <FileText size={20} className="text-purple-600" />
          تقرير الأرباح - {periodLabels[period]}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">📈 إيرادات المبيعات</p>
            <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(stats.salesRevenue)}</p>
            <p className="text-xs text-gray-400 mt-1">الربح: {formatCurrency(stats.salesProfit)}</p>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">🔧 إيرادات الصيانة</p>
            <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(stats.maintRevenue)}</p>
            <p className="text-xs text-gray-400 mt-1">الربح: {formatCurrency(stats.maintProfit)}</p>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">💰 إجمالي الإيرادات</p>
            <p className="text-xl font-bold text-purple-600 mt-1">{formatCurrency(stats.totalRevenue)}</p>
          </div>
          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">📊 إجمالي الأرباح</p>
            <p className="text-xl font-bold text-orange-600 mt-1">
              {formatCurrency(stats.salesProfit + stats.maintProfit)}
            </p>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h3 className="font-bold text-gray-800 dark:text-white">سجل المعاملات</h3>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-800 dark:text-white border-0"
            >
              <option value="all">الكل</option>
              <option value="income">الإيرادات</option>
              <option value="expense">المصروفات</option>
              <option value="sale">المبيعات</option>
              <option value="maintenance">الصيانة</option>
              <option value="transfer">التحويلات</option>
              <option value="side_account">الحسابات الجانبية</option>
              <option value="capital">رأس المال</option>
            </select>
          </div>
        </div>

        <div className="max-h-[500px] overflow-y-auto">
          {displayTransactions.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Receipt size={40} className="mx-auto mb-2 opacity-50" />
              <p>لا توجد معاملات في هذه الفترة</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {financePage.pageRows.map(trans => {
                const safe = safes.find(s => s.id === trans.safeId);
                const isIncome = trans.amount > 0;
                return (
                  <div key={trans.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <div className="flex items-center gap-3">
                      {getTransactionIcon(trans.type, trans.amount)}
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white">{trans.description}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                            {getTransactionLabel(trans.type)}
                          </span>
                          <span>{safe?.name}</span>
                          <span>•</span>
                          <span>{formatDate(trans.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                        {isIncome ? '+' : ''}{formatCurrency(trans.amount)}
                      </span>
                      {(trans.type === 'income' || trans.type === 'expense') && (
                        <button
                          onClick={() => {
                            if (confirm('هل تريد حذف هذه المعاملة؟')) {
                              const result = onDeleteTransaction(trans.id);
                              if (!result.ok) alert(result.error || 'تعذر حذف المعاملة');
                            }
                          }}
                          className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="حذف"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

                  <PaginationBar
                    total={financePage.total}
                    page={financePage.page}
                    pageSize={financePage.pageSize}
                    totalPages={financePage.totalPages}
                    from={financePage.from}
                    to={financePage.to}
                    canPrev={financePage.canPrev}
                    canNext={financePage.canNext}
                    onPageChange={financePage.setPage}
                    onPageSizeChange={financePage.setPageSize}
                    itemLabel="معاملة"
                  />
        </div>
      </div>

      {/* Add Transaction Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">تسجيل عملية مالية</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Type Toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFormData(prev => ({ ...prev, type: 'income' }))}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition ${
                    formData.type === 'income'
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-600'
                      : 'border-gray-200 dark:border-gray-600 text-gray-500'
                  }`}
                >
                  <TrendingUp size={20} />
                  <span className="font-medium">دخل (إيراد)</span>
                </button>
                <button
                  onClick={() => setFormData(prev => ({ ...prev, type: 'expense' }))}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition ${
                    formData.type === 'expense'
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600'
                      : 'border-gray-200 dark:border-gray-600 text-gray-500'
                  }`}
                >
                  <TrendingDown size={20} />
                  <span className="font-medium">مصروف</span>
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">المبلغ *</label>
                <input
                  type="number"
                  min="0"
                  value={formData.amount || ''}
                  onChange={e => setFormData(prev => ({ ...prev, amount: Number(e.target.value) }))}
                  placeholder="0"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-lg font-bold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الوصف *</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={formData.type === 'income' ? 'مثال: دخل إيجار' : 'مثال: إيجار المحل'}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الخزنة</label>
                <select
                  value={formData.safeId}
                  onChange={e => setFormData(prev => ({ ...prev, safeId: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  {safes.map(safe => (
                    <option key={safe.id} value={safe.id}>
                      {safe.name} ({formatCurrency(safe.balance)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                تسجيل
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Wallet Services Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-purple-50 dark:bg-purple-900/20">
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                <Wallet size={24} />
                <h2 className="text-xl font-bold">خدمات المحافظ</h2>
              </div>
              <button
                onClick={() => setShowWalletModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={() => setWalletForm(prev => ({ ...prev, type: 'deposit' }))}
                  className={`p-3 rounded-xl border-2 transition font-medium ${
                    walletForm.type === 'deposit'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-600'
                      : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  إيداع (تحويل لعميل)
                </button>
                <button
                  onClick={() => setWalletForm(prev => ({ ...prev, type: 'withdrawal' }))}
                  className={`p-3 rounded-xl border-2 transition font-medium ${
                    walletForm.type === 'withdrawal'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-600'
                      : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  سحب (استلام من عميل)
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  المبلغ (أصل المبلغ) *
                </label>
                <input
                  type="number"
                  min="0"
                  value={walletForm.amount}
                  onChange={e => setWalletForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  العمولة (الربح)
                </label>
                <input
                  type="number"
                  min="0"
                  value={walletForm.fee}
                  onChange={e => setWalletForm(prev => ({ ...prev, fee: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  الخزنة *
                </label>
                <select
                  value={walletForm.walletId}
                  onChange={e => setWalletForm(prev => ({ ...prev, walletId: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  <option value="">اختر الخزنة</option>
                  {safes.map(safe => (
                    <option key={safe.id} value={safe.id}>
                      {safe.name} ({formatCurrency(safe.balance || 0)})
                    </option>
                  ))}
                </select>
              </div>

              {showAdvanced ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    خزينة الكاش (منفصلة)
                  </label>
                  <select
                    value={walletForm.cashSafeId}
                    onChange={e => setWalletForm(prev => ({ ...prev, cashSafeId: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  >
                    <option value="">نفس الخزنة</option>
                    {safes.map(safe => (
                      <option key={safe.id} value={safe.id}>
                        {safe.name} ({formatCurrency(safe.balance || 0)})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAdvanced(true)}
                  className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
                >
                  + استخدام خزنة كاش منفصلة (للمحترفين)
                </button>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ملاحظات
                </label>
                <input
                  type="text"
                  value={walletForm.notes}
                  onChange={e => setWalletForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="مثال: إيداع لرقم 010..."
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowWalletModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleWalletSubmit}
                disabled={!walletForm.amount || !walletForm.walletId}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                تأكيد العملية
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
