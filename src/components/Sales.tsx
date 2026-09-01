import { useState, useMemo, useEffect } from 'react';
import { formatCurrency, formatDate as formatIntlDate } from '../utils/format';
import { usePagination } from '../hooks/usePagination';
import PaginationBar from './PaginationBar';

import { Search, Eye, Printer, X, Filter, RotateCcw, FileSpreadsheet } from 'lucide-react';
import { Sale, SaleReturn, Customer, InventoryItem, IMEIUnit, User } from '../types';
import { downloadExcel, fmtDate } from '../utils/reports';
import { printReceipt } from '../utils/print';
import { returnedQuantityOf, saleNetTotals } from '../utils/returns';

interface SalesProps {
  sales: Sale[];
  saleReturns: SaleReturn[];
  customers: Customer[];
  inventory: InventoryItem[];
  imeiUnits: IMEIUnit[];
  users: User[];
  shopName: string;
  receiptFooter: string;
  onProcessReturn: (saleId: string, saleItemId: string, quantity: number, reason: string) => SaleReturn | null;
}

export default function Sales({ sales, saleReturns, customers, inventory, imeiUnits, shopName, receiptFooter, onProcessReturn }: SalesProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedSaleItem, setSelectedSaleItem] = useState<Sale['items'][number] | null>(null);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [returnReason, setReturnReason] = useState('');

  // Filter sales
  const filteredSales = useMemo(() => {
    return sales
      .filter(sale => {
        const customer = customers.find(c => c.id === sale.customerId);
        const matchesSearch = 
          sale.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer?.phone.includes(searchTerm) ||
          sale.items.some(it => {
            const prod = inventory.find(i => i.id === it.inventoryId);
            return prod?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   (prod?.barcode && prod.barcode.includes(searchTerm));
          });

        let matchesDate = true;
        if (dateFilter !== 'all') {
          const saleDate = new Date(sale.createdAt);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (dateFilter === 'today') {
            matchesDate = saleDate >= today;
          } else if (dateFilter === 'week') {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            matchesDate = saleDate >= weekAgo;
          } else if (dateFilter === 'month') {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            matchesDate = saleDate >= monthAgo;
          }
        }

        return matchesSearch && matchesDate;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sales, customers, searchTerm, dateFilter]);

  // خريطة العملاء بدل customers.find لكل صف في الجدول
  const customerById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  const salesPage = usePagination(filteredSales, { defaultPageSize: 50, storageKey: 'mobpos_page_size_sales' });

  // تغيير البحث أو الفلتر يرجّع المستخدم لأول صفحة
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    salesPage.resetPage();
  }, [searchTerm, dateFilter]);

  const formatDate = (dateStr: string) => formatIntlDate(dateStr, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Stats
  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.total, 0);
  const totalProfit = filteredSales.reduce((sum, s) => sum + s.profit, 0);

  // سجلات المرتجعات هي مصدر الحقيقة للكمية المرتجعة — الفاتورة مابتتعدلش بعد
  // إصدارها، و`item.returnedQuantity` بقى مجرد أثر تاريخي للسجلات القديمة.
  const getReturnedQuantity = (saleId: string, saleItem: Sale['items'][number]) =>
    returnedQuantityOf(saleReturns, saleId, saleItem.id, saleItem.returnedQuantity || 0);

  const getReturnableQuantity = (saleId: string, saleItem: Sale['items'][number]) =>
    Math.max(0, saleItem.quantity - getReturnedQuantity(saleId, saleItem));

  /** أرقام الفاتورة المفتوحة بعد طرح مرتجعاتها (الفاتورة نفسها ثابتة). */
  const selectedSaleNet = useMemo(
    () => selectedSale
      ? saleNetTotals(selectedSale, saleReturns)
      : { returnedValue: 0, netTotal: 0, netProfit: 0, netRemaining: 0, cashRefunded: 0, hasReturns: false },
    [selectedSale, saleReturns]
  );

  const openReturnModal = (saleItem: Sale['items'][number]) => {
    if (!selectedSale) return;
    setSelectedSaleItem(saleItem);
    setReturnQuantity(1);
    setReturnReason('');
    setShowReturnModal(true);
  };

  const handleProcessReturn = () => {
    if (!selectedSale || !selectedSaleItem) return;

    const remaining = getReturnableQuantity(selectedSale.id, selectedSaleItem);
    if (returnQuantity <= 0 || returnQuantity > remaining) {
      alert('الكمية غير صحيحة');
      return;
    }

    const result = onProcessReturn(selectedSale.id, selectedSaleItem.id, returnQuantity, returnReason.trim());
    if (!result) {
      alert('تعذر تسجيل المرتجع');
      return;
    }

    setShowReturnModal(false);
    setSelectedSaleItem(null);
    setReturnReason('');
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">المبيعات</h1>
          <p className="text-gray-500 dark:text-gray-400">سجل جميع عمليات البيع</p>
        </div>
        <button
          onClick={() =>
            downloadExcel(
              `sales-${new Date().toISOString().slice(0, 10)}`,
              ['فاتورة', 'التاريخ', 'العميل', 'طريقة الدفع', 'الإجمالي', 'المدفوع', 'المتبقي', 'الربح'],
              [...sales]
                .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                .map(s => [
                  s.invoiceNumber,
                  fmtDate(s.createdAt),
                  customers.find(c => c.id === s.customerId)?.name || 'عميل نقدي',
                  s.paymentMethod,
                  s.total,
                  s.paid,
                  s.remaining,
                  s.profit,
                ])
            )
          }
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition shadow-lg shadow-teal-600/20"
        >
          <FileSpreadsheet size={20} />
          تصدير Excel
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالفاتورة أو اسم العميل..."
              className="w-full py-2 pr-10 pl-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-400" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0"
            >
              <option value="all">جميع الفترات</option>
              <option value="today">اليوم</option>
              <option value="week">هذا الأسبوع</option>
              <option value="month">هذا الشهر</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">عدد الفواتير</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{filteredSales.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">إجمالي الإيرادات</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">إجمالي الأرباح</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalProfit)}</p>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">رقم الفاتورة</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">التاريخ</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">العميل</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">المنتجات</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الإجمالي</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الربح</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">طريقة الدفع</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {salesPage.pageRows.map(sale => {
                const customer = customerById.get(sale.customerId);
                // const cashier = users.find(u => u.id === sale.cashierId);
                
                return (
                  <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-mono text-sm font-medium text-blue-600">
                      {sale.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(sale.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-800 dark:text-white">
                      {customer?.name || 'عميل غير محدد'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {sale.items.length} منتج
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">
                      {formatCurrency(sale.total)}
                    </td>
                    <td className="px-4 py-3 font-medium text-green-600">
                      {formatCurrency(sale.profit)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        sale.paymentMethod === 'cash' ? 'bg-green-100 text-green-700' :
                        sale.paymentMethod === 'card' ? 'bg-blue-100 text-blue-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {sale.paymentMethod === 'cash' ? 'نقدي' :
                         sale.paymentMethod === 'card' ? 'بطاقة' : 'تقسيط'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setSelectedSale(sale);
                            setShowDetailModal(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                          title="عرض التفاصيل"
                        >
                          <Eye size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredSales.length === 0 && (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            لا توجد مبيعات مطابقة
          </div>
        )}

                <PaginationBar
                  total={salesPage.total}
                  page={salesPage.page}
                  pageSize={salesPage.pageSize}
                  totalPages={salesPage.totalPages}
                  from={salesPage.from}
                  to={salesPage.to}
                  canPrev={salesPage.canPrev}
                  canNext={salesPage.canNext}
                  onPageChange={salesPage.setPage}
                  onPageSizeChange={salesPage.setPageSize}
                  itemLabel="فاتورة"
                />
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedSale && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div
            className="print-section bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Screen UI - Hidden in Print */}
            <div className="print:hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                  {selectedSale.invoiceNumber}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {formatDate(selectedSale.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg no-print"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Customer Info */}
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">العميل</p>
                <p className="font-medium text-gray-800 dark:text-white">
                  {customers.find(c => c.id === selectedSale.customerId)?.name || 'عميل غير محدد'}
                </p>
              </div>

              {/* Items */}
              <div>
                <h4 className="font-bold text-gray-800 dark:text-white mb-3">المنتجات</h4>
                <div className="space-y-2">
                  {selectedSale.items.map(item => {
                    const product = inventory.find(i => i.id === item.inventoryId);
                    const imei = item.imeiUnitId ? imeiUnits.find(u => u.id === item.imeiUnitId) : null;
                    const returnedQuantity = getReturnedQuantity(selectedSale.id, item);
                    const returnableQuantity = Math.max(0, item.quantity - returnedQuantity);
                    
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-800 dark:text-white">{product?.name}</p>
                          {imei && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              IMEI: {imei.imei1} | {imei.color} - {imei.storage}
                            </p>
                          )}
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {item.quantity} × {formatCurrency(item.unitPrice)}
                          </p>
                          {returnedQuantity > 0 && (
                            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                              تم إرجاع {returnedQuantity} من هذه القطعة
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-gray-800 dark:text-white">
                            {formatCurrency(item.total)}
                          </span>
                          {returnableQuantity > 0 && (
                            <button
                              onClick={() => openReturnModal(item)}
                              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300"
                            >
                              <RotateCcw size={14} />
                              مرتجع
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>الإجمالي الفرعي:</span>
                  <span>{formatCurrency(selectedSale.subtotal)}</span>
                </div>
                {selectedSale.discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>الخصم:</span>
                    <span>- {formatCurrency(selectedSale.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold text-gray-800 dark:text-white">
                  <span>الإجمالي:</span>
                  <span className="text-blue-600">{formatCurrency(selectedSale.total)}</span>
                </div>
                {selectedSaleNet.hasReturns && (
                  <>
                    <div className="flex justify-between text-orange-600">
                      <span>مرتجعات:</span>
                      <span>- {formatCurrency(selectedSaleNet.returnedValue)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold text-gray-800 dark:text-white">
                      <span>الصافي بعد المرتجعات:</span>
                      <span className="text-blue-600">{formatCurrency(selectedSaleNet.netTotal)}</span>
                    </div>
                    {selectedSaleNet.cashRefunded > 0 && (
                      <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                        <span>مبلغ مرتجع للعميل:</span>
                        <span>{formatCurrency(selectedSaleNet.cashRefunded)}</span>
                      </div>
                    )}
                    {selectedSaleNet.netRemaining > 0 && (
                      <div className="flex justify-between text-red-600 dark:text-red-400 font-medium">
                        <span>المتبقي على العميل:</span>
                        <span>{formatCurrency(selectedSaleNet.netRemaining)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between text-green-600 font-medium no-print">
                  <span>الربح:</span>
                  <span>{formatCurrency(selectedSaleNet.netProfit)}</span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between no-print">
              <button
                onClick={() => { printReceipt(); }}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Printer size={18} />
                طباعة
              </button>
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إغلاق
              </button>
            </div>
            </div>

            {/* Print UI - Hidden on Screen */}
            <div className="hidden print:block p-4" id="receipt-content">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">📱 {shopName}</h2>
                <p className="text-gray-500 dark:text-gray-400">فاتورة مبيعات</p>
              </div>

              <div className="border-t border-b border-gray-200 dark:border-gray-700 py-4 mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  رقم الفاتورة: {selectedSale.invoiceNumber}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  التاريخ: {formatDate(selectedSale.createdAt)}
                </p>
                {selectedSale.customerId && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    العميل: {customers.find(c => c.id === selectedSale.customerId)?.name || 'عميل غير محدد'}
                  </p>
                )}
              </div>

              <div className="space-y-2 mb-4">
                {selectedSale.items.map((item, index) => {
                  const product = inventory.find(i => i.id === item.inventoryId);
                  return (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-gray-800 dark:text-white">
                        {product?.name || 'منتج غير معروف'} × {item.quantity}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        {formatCurrency(item.total)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-400">الإجمالي الفرعي:</span>
                  <span className="text-gray-800 dark:text-white">{formatCurrency(selectedSale.subtotal)}</span>
                </div>
                {selectedSale.discount > 0 && (
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600 dark:text-gray-400">الخصم:</span>
                    <span className="text-gray-800 dark:text-white">{formatCurrency(selectedSale.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg mb-4">
                  <span className="text-gray-800 dark:text-white">الإجمالي:</span>
                  <span className="text-gray-800 dark:text-white">{formatCurrency(selectedSale.total)}</span>
                </div>
                {selectedSaleNet.hasReturns && (
                  <>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-600 dark:text-gray-400">مرتجعات:</span>
                      <span className="text-gray-800 dark:text-white">- {formatCurrency(selectedSaleNet.returnedValue)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg mb-4">
                      <span className="text-gray-800 dark:text-white">الصافي:</span>
                      <span className="text-gray-800 dark:text-white">{formatCurrency(selectedSaleNet.netTotal)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-400">طريقة الدفع:</span>
                  <span className="text-gray-800 dark:text-white">
                    {selectedSale.paymentMethod === 'cash' ? 'نقدي' : 
                     selectedSale.paymentMethod === 'card' ? 'بطاقة' : 'آجل'}
                  </span>
                </div>
                {(selectedSale.paid || 0) > 0 && selectedSale.paymentMethod === 'installment' && (
                  <>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-600 dark:text-gray-400">المبلغ المدفوع:</span>
                      <span className="text-gray-800 dark:text-white">{formatCurrency(selectedSale.paid || 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-red-600 dark:text-red-400">المتبقي:</span>
                      <span className="text-red-600 dark:text-red-400 font-bold">{formatCurrency(selectedSaleNet.netRemaining)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-8 text-center space-y-2">
                <p className="text-sm font-bold text-gray-800 dark:text-white">💙 شكراً لتعاملكم معنا</p>
                {receiptFooter && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{receiptFooter}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showReturnModal && selectedSaleItem && selectedSale && (
        <div className="modal-overlay" onClick={() => setShowReturnModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">تسجيل مرتجع</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedSale.invoiceNumber}</p>
              </div>
              <button
                onClick={() => setShowReturnModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <p className="font-medium text-gray-800 dark:text-white">{inventory.find(i => i.id === selectedSaleItem.inventoryId)?.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  يمكن إرجاع {selectedSale ? getReturnableQuantity(selectedSale.id, selectedSaleItem) : 0} قطعة متبقية
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الكمية</label>
                <input
                  type="number"
                  min={1}
                  max={selectedSale ? getReturnableQuantity(selectedSale.id, selectedSaleItem) : 1}
                  value={returnQuantity}
                  onChange={e => setReturnQuantity(Number(e.target.value))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">السبب</label>
                <textarea
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  placeholder="سبب المرتجع"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowReturnModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleProcessReturn}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                حفظ المرتجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
