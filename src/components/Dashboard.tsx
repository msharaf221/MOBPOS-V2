import React from 'react';
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
    lowStockItems: InventoryItem[];
    expiringWarranties: IMEIUnit[];
    totalCustomers: number;
  };
  sales: Sale[];
  maintenance: Maintenance[];
  categories: Category[];
  inventory: InventoryItem[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function Dashboard({
  statistics,
  sales,
  maintenance,
  categories,
  inventory
}: DashboardProps) {
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
      const dayName = date.toLocaleDateString(localStorage.getItem('app_locale') || 'ar-EG', { weekday: 'short' });
      
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

  // Sales by category
  const salesByCategory = React.useMemo(() => {
    const categoryMap: Record<string, number> = {};
    
    sales.forEach(sale => {
      sale.items.forEach(item => {
        const invItem = inventory.find(i => i.id === item.inventoryId);
        if (invItem) {
          const category = categories.find(c => c.id === invItem.categoryId);
          const categoryName = category?.name || 'أخرى';
          categoryMap[categoryName] = (categoryMap[categoryName] || 0) + item.total;
        }
      });
    });

    return Object.entries(categoryMap).map(([name, value]) => ({ name, value }));
  }, [sales, inventory, categories]);

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(localStorage.getItem('app_locale') || 'ar-EG', {
      style: 'currency',
      currency: localStorage.getItem('app_currency') || 'EGP',
      maximumFractionDigits: 0
    }).format(value);
  };

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
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">المبيعات حسب الفئة</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={salesByCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  fill="#8884d8"
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                >
                  {salesByCategory.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value) || 0)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
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
              statistics.lowStockItems.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-800 dark:text-white">{item.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">الحد الأدنى: {item.minQuantity}</p>
                  </div>
                  <span className="px-3 py-1 bg-yellow-500 text-white text-sm font-bold rounded-full">
                    {item.quantity}
                  </span>
                </div>
              ))
            )}
          </div>
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
              statistics.expiringWarranties.map(unit => {
                const daysLeft = Math.ceil(
                  (new Date(unit.warrantyEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
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
