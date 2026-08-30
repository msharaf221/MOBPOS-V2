// ============================================================
//  التقارير: تصدير Excel حقيقي (XLSX) + معاينة تقارير داخل التطبيق + PDF
// ============================================================

import ExcelJS from 'exceljs';
import { formatNumber, formatDateTime } from './format.ts';
// الخط يُضمَّن داخل ملفات التقارير نفسها (base64) عشان الطباعة والـ PDF
// يطلعوا بخط Cairo حتى لو الخط مش متثبت على جهاز العميل
import cairoArabic400 from '@fontsource/cairo/files/cairo-arabic-400-normal.woff2?url';
import cairoLatin400 from '@fontsource/cairo/files/cairo-latin-400-normal.woff2?url';
import cairoArabic700 from '@fontsource/cairo/files/cairo-arabic-700-normal.woff2?url';
import cairoLatin700 from '@fontsource/cairo/files/cairo-latin-700-normal.woff2?url';

export type ReportCell = string | number;
export interface ReportSection {
  title: string;
  headers: string[];
  rows: ReportCell[][];
  footer?: ReportCell[];
}

// ============================================================
//  1) تصدير Excel حقيقي (XLSX) — عربي سليم 100% بدون أي إعدادات
// ============================================================

/** اسم ورقة آمن: Excel بيرفض []:*?/\ وأكثر من 31 حرف */
function safeSheetName(name: string): string {
  const clean = name.replace(/[[\]:*?/\\]/g, ' ').trim();
  return (clean || 'تقرير').slice(0, 31);
}

/**
 * يصدّر ملف Excel (xlsx) أصلي:
 * - ورقة RTL (من اليمين للشمال) تلقائياً
 * - الأرقام تتخزّن كأرقام (تقدر تعمل SUM عليها)
 * - عرض الأعمدة يتحسب من المحتوى
 */
export async function downloadExcel(
  fileName: string,
  headers: string[],
  rows: ReportCell[][],
  opts?: { sheetName?: string; title?: string }
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MOBPOS';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(safeSheetName(opts?.sheetName || 'تقرير'), {
    views: [{ rightToLeft: true }],
  });

  const hasTitle = !!opts?.title;
  if (hasTitle) {
    const titleRow = worksheet.addRow([opts!.title as string]);
    titleRow.font = { bold: true, size: 14 };
    titleRow.alignment = { horizontal: 'center' };
    worksheet.mergeCells(1, 1, 1, Math.max(headers.length, 1));
  }

  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };

  for (const row of rows) {
    worksheet.addRow(row);
  }

  // عرض الأعمدة تلقائياً من محتواها
  headers.forEach((h, ci) => {
    let maxLen = String(h ?? '').length;
    for (const row of rows) {
      const v = row[ci];
      if (v === null || v === undefined) continue;
      maxLen = Math.max(maxLen, String(v).length);
    }
    worksheet.getColumn(ci + 1).width = Math.min(Math.max(maxLen + 4, 10), 50);
  });

  const wbout = await workbook.xlsx.writeBuffer();
  const blob = new Blob([wbout as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ============================================================
//  2) تصدير CSV (احتياطي — مع BOM صحيح للعربية)
//     الأفضل دائماً استخدام downloadExcel
// ============================================================

function csvEscape(value: ReportCell): string {
  let s = String(value ?? '');
  // حماية من حقن صيغ ومعادلات CSV (Formula/DDE Injection)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function downloadCSV(fileName: string, headers: string[], rows: ReportCell[][]): void {
  const lines = [headers.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))];
  // BOM عشان العربية تظهر صح في Excel — مكتوب كـ escape صريح عشان محررات
  // النصوص متمسحوش الحرف الغير مرئي بالغلط (ده اللي حصل قبل كده وبوّظ العربية)
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ============================================================
//  3) بناء تقرير HTML مستقل (للمعاينة / الطباعة / حفظ PDF)
// ============================================================

const esc = (v: ReportCell) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function reportFontsCss(): string {
  return `
  @font-face {
    font-family: 'CairoReport'; font-weight: 400; font-display: swap;
    src: url(${cairoArabic400}) format('woff2');
    unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF, U+0660-0669;
  }
  @font-face {
    font-family: 'CairoReport'; font-weight: 400; font-display: swap;
    src: url(${cairoLatin400}) format('woff2');
    unicode-range: U+0000-00FF, U+2000-206F;
  }
  @font-face {
    font-family: 'CairoReport'; font-weight: 700; font-display: swap;
    src: url(${cairoArabic700}) format('woff2');
    unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF, U+0660-0669;
  }
  @font-face {
    font-family: 'CairoReport'; font-weight: 700; font-display: swap;
    src: url(${cairoLatin700}) format('woff2');
    unicode-range: U+0000-00FF, U+2000-206F;
  }`;
}

export interface ReportInput {
  title: string;
  subtitle?: string;
  shopName?: string;
  sections: ReportSection[];
}

/**
 * يرجّع صفحة HTML كاملة ومستقلة للتقرير (الخطوط مضمّنة داخلها).
 * تُستخدم في: نافذة المعاينة، الطباعة المخفية، وحفظ PDF داخل التطبيق.
 */
export function buildReportHTML(opts: ReportInput): string {
  const sectionsHtml = opts.sections.map(sec => `
    <div class="sec">
      <h3><span class="sec-dot"></span>${esc(sec.title)}</h3>
      <table>
        <thead><tr>${sec.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${sec.rows.length === 0
            ? `<tr><td colspan="${sec.headers.length}" class="empty">لا توجد بيانات</td></tr>`
            : sec.rows.map((r, i) =>
                `<tr class="${i % 2 === 1 ? 'alt' : ''}">${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`
              ).join('')}
        </tbody>
        ${sec.footer ? `<tfoot><tr>${sec.footer.map(c => `<td><b>${esc(c)}</b></td>`).join('')}</tr></tfoot>` : ''}
      </table>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${esc(opts.title)}</title>
<style>
  ${reportFontsCss()}
  * { font-family: 'CairoReport', 'Cairo', 'Segoe UI', Tahoma, sans-serif; box-sizing: border-box; }
  body { padding: 28px; color: #111827; margin: 0; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
          border-bottom: 3px solid #1e3a8a; padding-bottom: 14px; margin-bottom: 20px; }
  .head .brand { display: flex; align-items: center; gap: 10px; }
  .head .logo { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg,#1e3a8a,#3b82f6);
                color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; }
  .head h1 { margin: 0; font-size: 21px; color: #1e3a8a; }
  .head p { margin: 2px 0 0; color: #6b7280; font-size: 12.5px; }
  .head .shop { text-align: left; font-size: 13px; color: #374151; font-weight: 700; }
  .head .shop small { display: block; color: #9ca3af; font-weight: 400; }
  .sec { margin-bottom: 24px; page-break-inside: avoid; }
  h3 { margin: 0 0 8px; font-size: 15px; color: #1e3a8a; display: flex; align-items: center; gap: 7px; }
  .sec-dot { width: 9px; height: 9px; border-radius: 3px; background: #3b82f6; display: inline-block; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #d1d5db; }
  th, td { border: 1px solid #d1d5db; padding: 6px 9px; text-align: right; }
  th { background: #1e3a8a; color: #fff; font-weight: 700; border-color: #1e3a8a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tr.alt td { background: #f3f6fc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tfoot td { background: #e8eefb; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .empty { text-align: center; color: #9ca3af; }
  .foot { margin-top: 26px; text-align: center; color: #9ca3af; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 10px; }
  @page { size: A4; margin: 10mm; }
  @media print { body { padding: 0; } .sec { page-break-inside: auto; } }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      <div class="logo">M</div>
      <div>
        <h1>${esc(opts.title)}</h1>
        <p>${esc(opts.subtitle || '')}</p>
      </div>
    </div>
    ${opts.shopName ? `<div class="shop">${esc(opts.shopName)}<small>نظام MOBPOS</small></div>` : ''}
  </div>
  ${sectionsHtml}
  <div class="foot">أُنشئ بواسطة نظام MOBPOS — ${esc(formatDateTime(new Date()))}</div>
</body>
</html>`;
}

// ============================================================
//  4) فتح التقرير: معاينة داخل التطبيق نفسه (بدون نوافذ منبثقة)
//     ReportPreview.tsx بتستمع للحدث ده وتعرض التقرير في مودال،
//     مع زرار طباعة وزرار حفظ PDF حقيقي داخل تطبيق سطح المكتب.
// ============================================================

export const REPORT_PREVIEW_EVENT = 'mobpos:report-preview';

export interface ReportPreviewPayload {
  title: string;
  fileName: string;
  html: string;
}

function sanitizeFileName(name: string): string {
  const clean = name.replace(/[[\]:*?/\\"<>|]/g, ' ').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
  return clean || 'report';
}

export function openPrintReport(opts: ReportInput): void {
  const html = buildReportHTML(opts);
  const dateStr = new Date().toISOString().slice(0, 10);
  const detail: ReportPreviewPayload = {
    title: opts.title,
    fileName: sanitizeFileName(`${opts.title}-${dateStr}`),
    html,
  };
  window.dispatchEvent(new CustomEvent<ReportPreviewPayload>(REPORT_PREVIEW_EVENT, { detail }));
}

// ===== Number formatting helper =====

export const fmtNum = (n: number): string =>
  formatNumber(n, 2);

export const fmtDate = (iso: string): string => {
  return formatDateTime(iso);
};

// ===== Daily closing report builder =====

export interface DailyCloseInput {
  sales: { invoiceNumber: string; total: number; profit: number; paid: number; paymentMethod: string; createdAt: string }[];
  saleReturns: { refundAmount: number; reason: string; createdAt: string }[];
  transactions: { type: string; amount: number; description: string; createdAt: string }[];
  safes: { name: string; balance: number }[];
  dateStr?: string; // YYYY-MM-DD local; defaults to today
}

export function buildDailyCloseReport(input: DailyCloseInput): ReportSection[] {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = input.dateStr || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const onDay = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === day;
  };

  const sales = input.sales.filter(s => onDay(s.createdAt));
  const returns = input.saleReturns.filter(r => onDay(r.createdAt));
  const tx = input.transactions.filter(t => onDay(t.createdAt));

  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const profit = sales.reduce((s, x) => s + x.profit, 0);
  const collected = sales.reduce((s, x) => s + x.paid, 0);
  const credit = revenue - collected;
  const returnsTotal = returns.reduce((s, x) => s + x.refundAmount, 0);

  const sum = (type: string) =>
    tx.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);

  const expenses = -sum('expense');
  const income = sum('income');
  const customerPayments = sum('customer_payment');
  const maintenanceIncome = sum('maintenance');

  return [
    {
      title: `ملخص اليوم ${day}`,
      headers: ['البند', 'القيمة'],
      rows: [
        ['عدد فواتير البيع', sales.length],
        ['إجمالي المبيعات', fmtNum(revenue)],
        ['المحصّل نقدياً من المبيعات', fmtNum(collected)],
        ['بيع آجل (متبقي على العملاء)', fmtNum(credit)],
        ['ربح المبيعات', fmtNum(profit)],
        ['مرتجعات (عدد / قيمة)', `${returns.length} / ${fmtNum(returnsTotal)}`],
        ['مصروفات', fmtNum(expenses)],
        ['إيرادات أخرى', fmtNum(income)],
        ['دفعات من العملاء', fmtNum(customerPayments)],
        ['إيراد الصيانة المسلّمة', fmtNum(maintenanceIncome)],
      ],
      footer: [
        'صافي حركة اليوم',
        fmtNum(collected + income + customerPayments + maintenanceIncome - expenses - returnsTotal),
      ],
    },
    {
      title: 'فواتير اليوم',
      headers: ['فاتورة', 'الوقت', 'طريقة الدفع', 'الإجمالي', 'المدفوع', 'الربح'],
      rows: sales.map(s => [
        s.invoiceNumber,
        fmtDate(s.createdAt),
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
        fmtDate(t.createdAt),
        t.type,
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
