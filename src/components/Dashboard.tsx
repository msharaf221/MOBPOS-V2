import React, { useState } from 'react';
import {
  TrendingUp, DollarSign, ShoppingCart,
  Package, Users, Wrench, AlertTriangle, Clock
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import { Sale, Maintenance, IMEIUnit, InventoryItem, Category } from '../types';
import AnimatedNumber from './AnimatedNumber';
import { formatCurrency, formatDate } from '../utils/format';
import {
  aggregateSalesByCategory,
  buildCategoryBreakdown,
  categoryPercent,
  getCurrentMonthRange,
  DEFAULT_TOP_CATEGORY_COUNT
} from '../utils/salesByCategory';

/**
 * كروت لوحة المعلومات كانت ترسم القائمة كلها في الـ DOM (كل منتجات تحت الحد
 * الأقصى + كل الضمانات المنتهية). الكارت بيستعرض أول DASHBOARD_CARD_LIMIT بس
 * وفي زرار «عرض الكل» لو في أكتر — نفس الشكل لكن بدون آلاف العُقد.
 */
const DASHBOARD_CARD_LIMIT = 10;

/** عدد الفئات الظاهرة افتراضيًا في كارت «المبيعات حسب الفئة». */
const TOP_CATEGORY_COUNT = DEFAULT_TOP_CATEGORY_COUNT;

interface DashboardProps {
  statistics: {
    todaySales: number;
    todayRevenue: number;
    todayProfit: number;
    monthSales: number;
    monthRevenue: number;
    monthProfit: number;
    totalSafesBalance: number;
    availableIMEI: number;
    soldIMEI: number;
    pendingMaintenance: number;
    completedMaintenance: number;
    lowStockItems: Array<InventoryItem & { realQuantity: number }>;
    expiringWarranties: IMEIUnit[];
    totalCustomers: number;
  };
  sales: Sale[];
  maintenance: Maintenance[];
  categories: Category[];
  inventory: InventoryItem[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
/** لون الشريحة المجمّعة «أخرى» (والفئات الصغيرة المندرجة تحتها). */
const OTHER_CATEGORY_COLOR = '#9CA3AF';

export default function Dashboard({
  statistics,
  sales,
  maintenance,
  categories,
  inventory
}: DashboardProps) {
  const [showAllLowStock, setShowAllLowStock] = useState(false);
  const [showAllWarranties, setShowAllWarranties] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  // مفتاح الشهر الحالي: بيتغيّر مع بداية كل شهر جديد، فبيبطل الكاش المؤقت
  // للكارت ويخليه يتصفّر تلقائيًا حتى لو التطبيق مفتوح على مدار الشهر.
  const currentMonthKey = getCurrentMonthRange().key;
  const currentMonthRange = React.useMemo(() => getCurrentMonthRange(), [currentMonthKey]);
  const currentMonthLabel = React.useMemo(
    () => formatDate(currentMonthRange.start, { month: 'long', year: 'numeric' }),
    [currentMonthRange]
  );

  const lowStockItems = statistics.lowStockItems;
  const visibleLowStockItems = showAllLowStock ? lowStockItems : lowStockItems.slice(0, DASHBOARD_CARD_LIMIT);
  const warrantyNow = Date.now();
  const visibleWarranties = showAllWarranties
    ? statistics.expiringWarranties
    : statistics.expiringWarranties.slice(0, DASHBOARD_CARD_LIMIT);

  // Prepare chart data - Last 7 days sales
  const last7DaysSales = React.useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      // Compare by LOCAL calendar day, matching the labeling below, so that
      // sales near midnight are bucketed into the same day they're labeled.
      const isSameLocalDay = (iso: string) => {
        const d = new Date(iso);
        return (
          d.getFullYear() === date.getFullYear() &&
          d.getMonth() === date.getMonth() &&
          d.getDate() === date.getDate()
        );
      };
      const dayName = formatDate(date, { weekday: 'short' });
      
      const daySales = sales.filter(s => isSameLocalDay(s.createdAt));
      const saleRevenue = daySales.reduce((sum, s) => sum + s.total, 0);
      const saleProfit = daySales.reduce((sum, s) => sum + s.profit, 0);
      
      const dayMaintenance = maintenance.filter(m => m.status === 'delivered' && m.deliveredAt && isSameLocalDay(m.deliveredAt));
      const maintenanceRevenue = dayMaintenance.reduce((sum, m) => sum + m.finalCost, 0);
      const maintenanceProfit = dayMaintenance.reduce((sum, m) => sum + m.profit, 0);
      
      days.push({
        name: dayName,
        revenue: saleRevenue + maintenanceRevenue,
        profit: saleProfit + maintenanceProfit
      });
    }
    return days;
  }, [sales, maintenance]);

  // Sales by category — مبيعات الشهر الحالي فقط (يتصفّر مع كل شهر جديد)
  const salesByCategory = React.useMemo(
    () => aggregateSalesByCategory({ sales, inventory, categories, range: currentMonthRange }),
    [sales, inventory, categories, currentMonthRange]
  );

  // الرسم (أعلى الفئات + «أخرى») والقائمة الجانبية (أعلى 5 + زرار عرض المزيد)
  const categoryBreakdown = React.useMemo(
    () => buildCategoryBreakdown(salesByCategory, { topCount: TOP_CATEGORY_COUNT }),
    [salesByCategory]
  );

  // إجمالي مبيعات الشهر (يستخدمه مركز الرسم والنِسب المئوية)
  const totalCategorySales = categoryBreakdown.total;
  const donutData = categoryBreakdown.slices;
  const visibleCategories = showAllCategories
    ? categoryBreakdown.expanded
    : categoryBreakdown.collapsed;

  // Maintenance by status
  const maintenanceByStatus = React.useMemo(() => {
    const statusLabels: Record<string, string> = {
      received: 'قيد الاستلام',
      in_progress: 'تحت الإصلاح',
      completed: 'مكتمل',
      delivered: 'تم التسليم',
      cancelled: 'ملغي'
    };

    const statusCount: Record<string, number> = {};
    maintenance.forEach(m => {
      const label = statusLabels[m.status] || m.status;
      statusCount[label] = (statusCount[label] || 0) + 1;
    });

    return Object.entries(statusCount).map(([name, value]) => ({ name, value }));
  }, [maintenance]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today Revenue */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">إيرادات اليوم</p>
              <p className="text-2xl font-bold text-gray-800 dark:text-white mt-1">
                <AnimatedNumber value={statistics.todayRevenue} formatter={formatCurrency} />
              </p>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                <TrendingUp size={14} />
                <AnimatedNumber value={statistics.todaySales} /> عملية بيع
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center">
              <DollarSign className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
          </div>
        </div>

        {/* Today Profit */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">أرباح اليوم</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                <AnimatedNumber value={statistics.todayProfit} formatter={formatCurrency} />
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                من <AnimatedNumber value={statistics.todaySales} /> عملية
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-xl flex items-center justify-center">
              <TrendingUp className="text-green-600 dark:text-green-400" size={24} />
            </div>
          </div>
        </div>

        {/* Available Devices */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">أجهزة متاحة</p>
              <p className="text-2xl font-bold text-gray-800 dark:text-white mt-1">
                <AnimatedNumber value={statistics.availableIMEI} />
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                <AnimatedNumber value={statistics.soldIMEI} /> جهاز مباع
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-xl flex items-center justify-center">
              <Package className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
          </div>
        </div>

        {/* Pending Maintenance */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">صيانة معلقة</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                <AnimatedNumber value={statistics.pendingMaintenance} />
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                <AnimatedNumber value={statistics.completedMaintenance} /> مكتملة
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-xl flex items-center justify-center">
              <Wrench className="text-orange-600 dark:text-orange-400" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">مبيعات آخر 7 أيام</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last7DaysSales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
formatter={(value) => formatCurrency(Number(value) || 0)}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ fill: '#3B82F6' }}
                  name="الإيرادات"
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ fill: '#10B981' }}
                  name="الأرباح"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sales by Category */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">
              المبيعات حسب الفئة
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              مبيعات شهر {currentMonthLabel} فقط
            </p>
          </div>

          {salesByCategory.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-gray-400 dark:text-gray-500">
              لا توجد مبيعات هذا الشهر بعد
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Donut with center total */}
              <div className="relative w-52 h-52 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={64}
                      outerRadius={92}
                      fill="#8884d8"
                      paddingAngle={3}
                      cornerRadius={7}
                      dataKey="value"
                      stroke="none"
                    >
                      {donutData.map((slice) => (
                        <Cell
                          key={`cell-${slice.key}`}
                          fill={slice.colorIndex >= 0 ? COLORS[slice.colorIndex % COLORS.length] : OTHER_CATEGORY_COLOR}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const entry = payload[0];
                        const { percent, isRoundedToZero } = categoryPercent(
                          Number(entry.value) || 0,
                          totalCategorySales
                        );
                        return (
                          <div
                            dir="rtl"
                            className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 shadow-xl"
                          >
                            <p className="text-sm font-semibold text-gray-800 dark:text-white">
                              {entry.name}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                              {formatCurrency(Number(entry.value) || 0)} ·{' '}
                              {isRoundedToZero ? '<1%' : `${percent}%`}
                            </p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
                  <span className="text-xl font-bold text-gray-800 dark:text-white">
                    {formatCurrency(totalCategorySales)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    إجمالي مبيعات الشهر
                  </span>
                </div>
              </div>

              {/* Legend — أعلى 5 فئات + «عرض المزيد» للباقي */}
              <div className="w-full flex-1 min-w-0">
                <div className="space-y-2.5">
                  {visibleCategories.map((cat) => {
                    const { percent, isRoundedToZero } = categoryPercent(cat.value, totalCategorySales);
                    return (
                      <div key={cat.key} className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              cat.colorIndex >= 0
                                ? COLORS[cat.colorIndex % COLORS.length]
                                : OTHER_CATEGORY_COLOR
                          }}
                        />
                        <span className="flex-1 min-w-0 text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                          {cat.name}
                        </span>
                        <span className="text-sm font-bold text-gray-800 dark:text-white tabular-nums">
                          {isRoundedToZero ? '<1%' : `${percent}%`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {categoryBreakdown.hasMore && (
                  <button
                    type="button"
                    onClick={() => setShowAllCategories(prev => !prev)}
                    className="mt-3 text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showAllCategories
                      ? 'عرض أقل'
                      : `عرض المزيد (${salesByCategory.length - TOP_CATEGORY_COUNT} فئة أخرى)`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Maintenance Status */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">حالة الصيانة</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={maintenanceByStatus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis type="number" stroke="#9CA3AF" />
                <YAxis dataKey="name" type="category" stroke="#9CA3AF" width={80} />
                <Tooltip />
                <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="text-yellow-500" size={20} />
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">مخزون منخفض</h3>
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {statistics.lowStockItems.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                لا توجد منتجات بمخزون منخفض
              </p>
            ) : (
              visibleLowStockItems.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-800 dark:text-white">{item.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">الحد الأدنى: {item.minQuantity}</p>
                  </div>
                  <span className="px-3 py-1 bg-yellow-500 text-white text-sm font-bold rounded-full">
                    {typeof item.realQuantity === 'number' ? item.realQuantity : item.quantity}
                  </span>
                </div>
              ))
            )}
          </div>
          {lowStockItems.length > DASHBOARD_CARD_LIMIT && (
            <button
              onClick={() => setShowAllLowStock(prev => !prev)}
              className="mt-3 text-sm font-bold text-blue-600 hover:underline"
            >
              {showAllLowStock ? 'عرض أقل' : `عرض كل المنتجات (${lowStockItems.length})`}
            </button>
          )}
        </div>

        {/* Expiring Warranties */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="text-red-500" size={20} />
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">ضمانات تنتهي قريباً</h3>
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {statistics.expiringWarranties.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                لا توجد ضمانات تنتهي قريباً
              </p>
            ) : (
              visibleWarranties.map(unit => {
                const daysLeft = Math.ceil(
                  (new Date(unit.warrantyEndDate).getTime() - warrantyNow) / (1000 * 60 * 60 * 24)
                );
                return (
                  <div
                    key={unit.id}
                    className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-800 dark:text-white text-sm">
                        IMEI: {unit.imei1.slice(-6)}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {unit.color} - {unit.storage}
                      </p>
                    </div>
                    <span className={`px-3 py-1 text-white text-sm font-bold rounded-full ${
                      daysLeft <= 7 ? 'bg-red-500' : 'bg-orange-500'
                    }`}>
                      {daysLeft} يوم
                    </span>
                  </div>
                );
              })
            )}
          </div>
          {statistics.expiringWarranties.length > DASHBOARD_CARD_LIMIT && (
            <button
              onClick={() => setShowAllWarranties(prev => !prev)}
              className="mt-3 text-sm font-bold text-blue-600 hover:underline"
            >
              {showAllWarranties ? 'عرض أقل' : `عرض كل الضمانات (${statistics.expiringWarranties.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-3">
            <ShoppingCart size={24} />
            <div>
              <p className="text-blue-100 text-sm">مبيعات الشهر</p>
              <p className="text-2xl font-bold">
                <AnimatedNumber value={statistics.monthRevenue} formatter={formatCurrency} />
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-3">
            <TrendingUp size={24} />
            <div>
              <p className="text-green-100 text-sm">أرباح الشهر</p>
              <p className="text-2xl font-bold">
                <AnimatedNumber value={statistics.monthProfit} formatter={formatCurrency} />
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-3">
            <Users size={24} />
            <div>
              <p className="text-purple-100 text-sm">إجمالي العملاء</p>
              <p className="text-2xl font-bold">
                <AnimatedNumber value={statistics.totalCustomers} />
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
