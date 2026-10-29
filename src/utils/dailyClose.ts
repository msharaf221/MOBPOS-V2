// ============================================================
//  بناء تقرير الإقفال اليومي وحسابات الحركة المالية
// ============================================================

import { formatNumber, formatDateTime } from './format.ts';

export const fmtNum = (n: number): string =>
  formatNumber(n, 2);

export const fmtDate = (iso: string): string => {
  return formatDateTime(iso);
};

export type ReportCell = string | number;
export interface ReportSection {
  title: string;
  headers: string[];
  rows: ReportCell[][];
  footer?: ReportCell[];
}

export interface DailyCloseInput {
  sales: { invoiceNumber: string; total: number; profit: number; paid: number; paymentMethod: string; createdAt: string }[];
  saleReturns: { refundAmount: number; netValue?: number; reason: string; createdAt: string }[];
  transactions: { type: string; amount: number; description: string; createdAt: string }[];
  safes: { name: string; balance: number }[];
  dateStr?: string; // YYYY-MM-DD local; defaults to today
}

export function transactionTypeToArabic(type: string): string {
  switch (type) {
    case 'sale': return 'مبيعات';
    case 'maintenance': return 'صيانة';
    case 'expense': return 'مصروف';
    case 'income': return 'إيراد';
    case 'customer_payment': return 'تحصيل آجل';
    case 'purchase': return 'مشتريات';
    case 'transfer': return 'تحويل خزن';
    case 'waste': return 'هالك';
    case 'inventory_adjustment': return 'تسوية جرد';
    case 'maintenance_cost': return 'تكلفة قطع صيانة';
    case 'refund': return 'مرتجع';
    case 'deposit': return 'إيداع';
    case 'withdrawal': return 'سحب';
    default: return type;
  }
}

export function buildDailyCloseReport(input: DailyCloseInput): ReportSection[] {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = input.dateStr || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const onDay = (iso: string | undefined | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === day;
  };

  const sales = input.sales.filter(s => onDay(s.createdAt || (s as any).date));
  const returns = input.saleReturns.filter(r => onDay(r.createdAt || (r as any).date));
  const tx = input.transactions.filter(t => onDay(t.createdAt || (t as any).date));

  const revenue = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const profit = sales.reduce((s, x) => s + (Number(x.profit) || 0), 0);
  const collected = sales.reduce((s, x) => s + (Number(x.paid) || 0), 0);
  const credit = revenue - collected;
  // كاش خرج للعميل + قيمة البضاعة اللي رجعت (السجلات القديمة مالهاش قيمة صافية).
  const returnsTotal = returns.reduce((s, x) => s + (Number(x.refundAmount) || 0), 0);
  const returnsValue = returns.reduce((s, x) => s + (typeof x.netValue === 'number' ? x.netValue : 0), 0);
  const netRevenue = revenue - returnsValue;

  const sum = (type: string) =>
    tx.filter(t => t.type === type).reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const expenses = -sum('expense');
  const income = sum('income');
  const customerPayments = sum('customer_payment');
  const maintenanceIncome = sum('maintenance');
  // المشتريات وسداد الموردين كانت غايبة تمامًا من تقفيل اليوم، فالصافي كان
  // بيطلع أعلى من الفلوس اللي في الدرج فعلاً.
  const purchases = -sum('purchase');
  // قيود دفترية (مش كاش) — للعلم بس، مش داخلة في صافي حركة الكاش.
  const maintenancePartsCost = -sum('maintenance_cost');
  const wasteCost = -sum('waste');
  const inventoryAdjustment = sum('inventory_adjustment');

  return [
    {
      title: `ملخص اليوم ${day}`,
      headers: ['البند', 'القيمة'],
      rows: [
        ['عدد فواتير البيع', sales.length],
        ['إجمالي المبيعات', fmtNum(revenue)],
        ['صافي المبيعات بعد المرتجعات', fmtNum(netRevenue)],
        ['المحصّل نقدياً من المبيعات', fmtNum(collected)],
        ['بيع آجل (متبقي على العملاء)', fmtNum(credit)],
        ['ربح المبيعات', fmtNum(profit)],
        ['مرتجعات (عدد / قيمة)', `${returns.length} / ${fmtNum(returnsTotal)}`],
        ['مشتريات وسداد موردين', fmtNum(purchases)],
        ['مصروفات', fmtNum(expenses)],
        ['إيرادات أخرى', fmtNum(income)],
        ['دفعات من العملاء', fmtNum(customerPayments)],
        ['إيراد الصيانة المسلّمة', fmtNum(maintenanceIncome)],
        ['تكلفة قطع الصيانة (قيد دفتري)', fmtNum(maintenancePartsCost)],
        ['هالك (قيد دفتري)', fmtNum(wasteCost)],
        ['تسوية جرد (قيد دفتري)', fmtNum(inventoryAdjustment)],
      ],
      footer: [
        'صافي حركة اليوم',
        fmtNum(collected + income + customerPayments + maintenanceIncome - expenses - returnsTotal - purchases),
      ],
    },
    {
      title: 'فواتير اليوم',
      headers: ['فاتورة', 'الوقت', 'طريقة الدفع', 'الإجمالي', 'المدفوع', 'الربح'],
      rows: sales.map(s => [
        s.invoiceNumber,
        fmtDate(s.createdAt || (s as any).date),
        s.paymentMethod === 'cash' ? 'نقدي' : s.paymentMethod === 'card' ? 'بطاقة' : 'آجل',
        fmtNum(s.total),
        fmtNum(s.paid),
        fmtNum(s.profit),
      ]),
    },
    {
      title: 'حركات الخزائن اليوم',
      headers: ['الوقت', 'النوع', 'البيان', 'المبلغ'],
      rows: tx.map(t => [
        fmtDate(t.createdAt || (t as any).date),
        transactionTypeToArabic(t.type),
        t.description,
        fmtNum(t.amount),
      ]),
    },
    {
      title: 'أرصدة الخزائن الحالية',
      headers: ['الخزنة', 'الرصيد'],
      rows: input.safes.map(s => [s.name, fmtNum(s.balance)]),
    },
  ];
}
