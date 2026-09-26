import { useState, useMemo } from 'react';
import {
  ShieldAlert,
  Search,
  FileSpreadsheet,
  Printer,
  ShoppingBag,
  RotateCcw,
  Wrench,
  Package,
  Wallet,
  Truck,
  LogIn,
  Sliders,
  AlertTriangle,
  Clock,
  User as UserIcon,
  Laptop,
  Smartphone,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { AuditLogEntry, AuditCategory, AuditSeverity, User } from '../types';
import { categoryToArabic } from '../utils/auditLogger';
import { usePagination } from '../hooks/usePagination';
import PaginationBar from './PaginationBar';
import { downloadExcel } from '../utils/reports';

interface AuditLogProps {
  auditLogs: AuditLogEntry[];
  users: User[];
  currentUser: User | null;
  onClearLogs?: () => void;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    if (diffMs < 0) return 'الآن';
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return 'منذ لحظات';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'أمس';
    if (days < 7) return `منذ ${days} أيام`;
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatExactDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('ar-EG')} - ${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return dateStr;
  }
}

function getCategoryIcon(cat: AuditCategory) {
  switch (cat) {
    case 'sales':
      return <ShoppingBag className="w-5 h-5 text-emerald-500" />;
    case 'returns':
      return <RotateCcw className="w-5 h-5 text-amber-500" />;
    case 'maintenance':
      return <Wrench className="w-5 h-5 text-blue-500" />;
    case 'inventory':
      return <Package className="w-5 h-5 text-purple-500" />;
    case 'finance':
      return <Wallet className="w-5 h-5 text-cyan-500" />;
    case 'purchases':
      return <Truck className="w-5 h-5 text-indigo-500" />;
    case 'auth':
      return <LogIn className="w-5 h-5 text-rose-500" />;
    case 'settings':
      return <Sliders className="w-5 h-5 text-gray-500" />;
    default:
      return <Clock className="w-5 h-5 text-gray-400" />;
  }
}

function getSeverityBadge(sev: AuditSeverity) {
  switch (sev) {
    case 'success':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500',
      };
    case 'danger':
      return {
        bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
        dot: 'bg-rose-500',
      };
    case 'warning':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
        dot: 'bg-amber-500',
      };
    default:
      return {
        bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
        dot: 'bg-blue-500',
      };
  }
}

export default function AuditLog({ auditLogs, users, currentUser, onClearLogs }: AuditLogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // إحصائيات سريعة
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let todaySales = 0;
    let todayMaintenance = 0;
    let criticalActions = 0;

    auditLogs.forEach((log) => {
      const isToday = log.timestamp.slice(0, 10) === today;
      if (isToday && log.category === 'sales') todaySales++;
      if (isToday && log.category === 'maintenance') todayMaintenance++;
      if (log.severity === 'danger') criticalActions++;
    });

    return {
      total: auditLogs.length,
      todaySales,
      todayMaintenance,
      criticalActions,
    };
  }, [auditLogs]);

  // الفلترة
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    return auditLogs.filter((log) => {
      // فلتر التصنيف
      if (selectedCategory !== 'all' && log.category !== selectedCategory) return false;
      // فلتر الموظف
      if (selectedUser !== 'all' && log.userId !== selectedUser) return false;
      // فلتر الأهمية
      if (selectedSeverity !== 'all' && log.severity !== selectedSeverity) return false;
      // فلتر التاريخ
      if (dateFilter === 'today' && log.timestamp.slice(0, 10) !== todayStr) return false;
      if (dateFilter === 'week' && log.timestamp < weekAgo) return false;
      if (dateFilter === 'month' && log.timestamp < monthAgo) return false;

      // فلتر البحث بالنص
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const inDesc = log.description.toLowerCase().includes(q);
        const inUser = log.userName.toLowerCase().includes(q);
        const inAction = log.action.toLowerCase().includes(q);
        const inEntity = log.entityId ? log.entityId.toLowerCase().includes(q) : false;
        if (!inDesc && !inUser && !inAction && !inEntity) return false;
      }

      return true;
    });
  }, [auditLogs, selectedCategory, selectedUser, selectedSeverity, dateFilter, searchTerm]);

  // التقسيم على صفحات
  const pagination = usePagination(filteredLogs, {
    defaultPageSize: 25,
    storageKey: 'mobpos_page_size_audit',
  });

  // تصدير إكسيل
  const handleExportExcel = () => {
    const rows = filteredLogs.map((log) => [
      formatExactDateTime(log.timestamp),
      log.userName,
      log.userRole,
      categoryToArabic(log.category),
      log.action,
      log.description,
      log.deviceName || 'الجهاز الرئيسي',
    ]);

    downloadExcel(
      'سجل-الرقابة-والعمليات',
      ['التاريخ والوقت', 'الموظف', 'الدور', 'القسم', 'نوع العملية', 'التفاصيل', 'الجهاز'],
      rows,
      { sheetName: 'سجل العمليات', title: 'سجل العمليات والرقابة' }
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const categoriesList: { id: string; label: string }[] = [
    { id: 'all', label: 'الكل' },
    { id: 'sales', label: 'مبيعات' },
    { id: 'returns', label: 'مرتجعات' },
    { id: 'maintenance', label: 'صيانة' },
    { id: 'inventory', label: 'مخزون' },
    { id: 'finance', label: 'خزن ومالية' },
    { id: 'purchases', label: 'مشتريات' },
    { id: 'auth', label: 'أمان ودخول' },
    { id: 'settings', label: 'إعدادات' },
  ];

  return (
    <div className="space-y-6">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            سجل العمليات والرقابة (Audit Log)
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            سجل إلكتروني دقيق باللغة العربية يشرح كل ما تم في المحل بالتفصيل: من باع، من استلم، وما دخل وخرج من الخزينة.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-sm transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            تصدير إكسيل
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 transition"
          >
            <Printer className="w-4 h-4" />
            طباعة
          </button>
          {currentUser?.role === 'admin' && onClearLogs && (
            <button
              onClick={() => {
                if (window.confirm('هل أنت متأكد من تفريغ سجل العمليات القديم؟ لا يمكن التراجع عن هذا الإجراء.')) {
                  onClearLogs();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-sm transition"
              title="تفريغ السجل"
            >
              <Trash2 className="w-4 h-4" />
              تفريغ
            </button>
          )}
        </div>
      </div>

      {/* كروت الإحصائيات السريعة */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">إجمالي الحركات</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{stats.total}</p>
          <span className="text-xs text-gray-400">حركة مسجلة بالنظام</span>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">فواتير بيع اليوم</span>
            <ShoppingBag className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{stats.todaySales}</p>
          <span className="text-xs text-gray-400">عملية بيع مسجلة</span>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">حركات صيانة اليوم</span>
            <Wrench className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">{stats.todayMaintenance}</p>
          <span className="text-xs text-gray-400">استلام أو تسليم أجهزة</span>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">تنبيهات حرجة / حذف</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2">{stats.criticalActions}</p>
          <span className="text-xs text-gray-400">حذف أصناف أو محاولات دخول</span>
        </div>
      </div>

      {/* شريط الفلاتر والبحث */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* مربع البحث */}
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute right-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="ابحث باسم الموظف، رقم الفاتورة، اسم العميل، الصنف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-10 pl-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* فلتر الموظف */}
          <div className="w-full md:w-48">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">كل الموظفين</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role === 'admin' ? 'مدير' : u.role === 'manager' ? 'مشرف' : 'كاشير/فني'})
                </option>
              ))}
            </select>
          </div>

          {/* فلتر التاريخ */}
          <div className="w-full md:w-36">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">كل الأوقات</option>
              <option value="today">اليوم فقط</option>
              <option value="week">آخر 7 أيام</option>
              <option value="month">آخر 30 يوم</option>
            </select>
          </div>

          {/* فلتر الأهمية */}
          <div className="w-full md:w-40">
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">كل العمليات</option>
              <option value="success">عمليات ناجحة (بيع/تسليم)</option>
              <option value="warning">تعديلات ومرتجعات</option>
              <option value="danger">⚠️ تنبيهات حرجة وحذف</option>
            </select>
          </div>
        </div>

        {/* أزرار أقسام الفلترة السريعة */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {categoriesList.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* قائمة السجلات والـ Timeline */}
      <div id="audit-log-print-area" className="space-y-3">
        {pagination.pageRows.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 p-12 text-center rounded-xl border border-gray-200 dark:border-gray-700">
            <ShieldAlert className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <h3 className="text-base font-medium text-gray-900 dark:text-white">لا توجد حركات مطابقة للبحث</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              جرب تغيير معايير البحث أو اختيار فترة زمنية أخرى.
            </p>
          </div>
        ) : (
          pagination.pageRows.map((log: AuditLogEntry) => {
            const badge = getSeverityBadge(log.severity);
            const isExpanded = expandedId === log.id;
            const hasDetails = log.details && Object.keys(log.details).length > 0;

            return (
              <div
                key={log.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-xs transition hover:border-blue-300 dark:hover:border-blue-700"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* الأيقونة والتفاصيل الرئيسية */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 mt-0.5">
                      {getCategoryIcon(log.category)}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* السطر الأول: نوع العملية + شارة الأهمية */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">
                          {log.action}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${badge.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {categoryToArabic(log.category)}
                        </span>
                        {log.entityId && (
                          <span className="text-xs font-mono px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md">
                            {log.entityId}
                          </span>
                        )}
                      </div>

                      {/* الوصف العربي الواضح */}
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-medium">
                        {log.description}
                      </p>

                      {/* شريط معلومات الموظف والجهاز والوقت */}
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-2.5 flex-wrap">
                        <span className="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300">
                          <UserIcon className="w-3.5 h-3.5 text-blue-500" />
                          {log.userName}
                          <span className="text-gray-400 text-[10px]">
                            ({log.userRole === 'admin' ? 'مدير' : log.userRole === 'manager' ? 'مشرف' : 'كاشير/فني'})
                          </span>
                        </span>

                        <span className="flex items-center gap-1">
                          {log.deviceName?.includes('LAN') || log.deviceName?.includes('هاتف') ? (
                            <Smartphone className="w-3.5 h-3.5 text-purple-500" />
                          ) : (
                            <Laptop className="w-3.5 h-3.5 text-gray-400" />
                          )}
                          {log.deviceName || 'الجهاز الرئيسي'}
                        </span>

                        <span className="flex items-center gap-1" title={formatExactDateTime(log.timestamp)}>
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            {formatRelativeTime(log.timestamp)}
                          </span>
                          <span className="text-gray-400 text-[11px]">
                            ({formatExactDateTime(log.timestamp)})
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* زر التوسيع لرؤية البيانات التقنية إن وجدت */}
                  {hasDetails && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                      title="عرض البيانات الإضافية"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>

                {/* تفاصيل موسعة */}
                {isExpanded && log.details && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs font-mono bg-gray-50 dark:bg-gray-900/60 p-3 rounded-lg overflow-x-auto text-gray-700 dark:text-gray-300">
                    <pre>{JSON.stringify(log.details, null, 2)}</pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* شريط ترقيم الصفحات الموحد */}
      <PaginationBar
        total={pagination.total}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalPages={pagination.totalPages}
        from={pagination.from}
        to={pagination.to}
        canPrev={pagination.canPrev}
        canNext={pagination.canNext}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
        itemLabel="حركة رقابية"
      />
    </div>
  );
}
