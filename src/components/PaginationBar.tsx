// ============================================================
//  PaginationBar — شريط تقسيم موحّد لكل القوائم
// ------------------------------------------------------------
//  نفس شكل الشريط المستخدم في شاشة الجرد، لكن في مكوّن واحد
//  يتعاد استخدامه في كل صفحة (مخزون/مبيعات/عملاء/IMEI/...).
//  الشريط بيختفي لوحده لو النتائج كلها داخل صفحة واحدة، عشان
//  المحل الصغير مايشوفش زحمة بلا فايدة.
// ============================================================

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS, type PageSizeOption } from '../hooks/usePagination';

interface PaginationBarProps {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  from: number;
  to: number;
  canPrev: boolean;
  canNext: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** خيارات حجم الصفحة — افتراضيًا 20/50/100/250 */
  sizeOptions?: PageSizeOption[];
  /** تسمية الوحدة في العدّاد (منتجات/فواتير/...) */
  itemLabel?: string;
  /** تجاهل إخفاء الشريط عند وجود صفحة واحدة */
  alwaysVisible?: boolean;
  className?: string;
}

const NAV_BUTTON =
  'flex items-center gap-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-600 transition';

export default function PaginationBar({
  total,
  page,
  pageSize,
  totalPages,
  from,
  to,
  canPrev,
  canNext,
  onPageChange,
  onPageSizeChange,
  sizeOptions = PAGE_SIZE_OPTIONS,
  itemLabel = 'نتيجة',
  alwaysVisible = false,
  className = ''
}: PaginationBarProps) {
  if (total === 0) return null;
  if (!alwaysVisible && totalPages <= 1 && sizeOptions.some(opt => opt.value !== pageSize)) {
    // كل النتائج في صفحة واحدة: نعرض العدّاد بس من غير أزرار تنقّل
    return (
      <div className={`flex items-center justify-between gap-3 p-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        <span>
          {itemLabel}: <b className="text-gray-800 dark:text-white">{total}</b>
        </span>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0 text-sm"
          aria-label="حجم الصفحة"
        >
          {sizeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
    );
  }

  // أرقام الصفحات حول الصفحة الحالية (نافذة ضيقة عشان 5000 صنف مايعملش 250 زرار)
  const windowPages: number[] = [];
  const radius = 2;
  for (let p = Math.max(1, page - radius); p <= Math.min(totalPages, page + radius); p++) windowPages.push(p);

  return (
    <div className={`flex flex-col md:flex-row items-center justify-between gap-3 p-4 border-t border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 flex-wrap">
        <span>
          {itemLabel}: <b className="text-gray-800 dark:text-white">{total}</b>
        </span>
        <span className="hidden md:inline text-gray-400">•</span>
        <span>
          عرض <b className="text-gray-800 dark:text-white">{from}</b> – <b className="text-gray-800 dark:text-white">{to}</b>
        </span>
        <span className="hidden md:inline text-gray-400">•</span>
        <span>
          صفحة <b className="text-gray-800 dark:text-white">{page}</b> من {totalPages}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0 text-sm"
          aria-label="حجم الصفحة"
        >
          {sizeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>

        <button type="button" className={NAV_BUTTON} disabled={!canPrev} onClick={() => onPageChange(1)} title="أول صفحة" aria-label="أول صفحة">
          <ChevronsRight size={16} />
        </button>
        <button type="button" className={NAV_BUTTON} disabled={!canPrev} onClick={() => onPageChange(page - 1)} title="السابق" aria-label="الصفحة السابقة">
          <ChevronRight size={16} /> السابق
        </button>

        {windowPages[0] > 1 && <span className="px-1 text-gray-400">…</span>}
        {windowPages.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`min-w-[38px] px-2 py-2 rounded-lg border text-sm font-bold transition ${
              p === page
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
            }`}
          >
            {p}
          </button>
        ))}
        {windowPages[windowPages.length - 1] < totalPages && <span className="px-1 text-gray-400">…</span>}

        <button type="button" className={NAV_BUTTON} disabled={!canNext} onClick={() => onPageChange(page + 1)} title="التالي" aria-label="الصفحة التالية">
          التالي <ChevronLeft size={16} />
        </button>
        <button type="button" className={NAV_BUTTON} disabled={!canNext} onClick={() => onPageChange(totalPages)} title="آخر صفحة" aria-label="آخر صفحة">
          <ChevronsLeft size={16} />
        </button>
      </div>
    </div>
  );
}
