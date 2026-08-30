// ============================================================
//  usePagination — تقسيم الصفحات الطويلة
// ------------------------------------------------------------
//  كل قوائم النظام كانت ترسم السجلات كلها في الـ DOM: جدول
//  مخزون بـ 5000 صنف يعني 5000 صف × (بحث في مصفوفة الفئات +
//  حساب كمية IMEI + تنسيق عملتين) في كل ريندر — بما في ذلك كل
//  حرف يُكتب في مربع البحث. التقسيم بيخلي الشغل ثابت على حجم
//  الصفحة (20/50/100) مهما كبرت الداتا.
//
//  ملاحظات سلوكية:
//  • لو الفلتر قلّل النتائج لأكتر من الصفحة الحالية، الصفحة
//    بتترجع لآخر صفحة صالحة تلقائياً (مش فاضية).
//  • تغيير حجم الصفحة بيرجعك لأول صفحة.
//  • حجم الصفحة بيتفتكر لكل شاشة في localStorage.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';

export const DEFAULT_PAGE_SIZE = 20;

export interface PageSizeOption {
  value: number;
  label: string;
}

export const PAGE_SIZE_OPTIONS: PageSizeOption[] = [
  { value: 20, label: '20 في الصفحة' },
  { value: 50, label: '50 في الصفحة' },
  { value: 100, label: '100 في الصفحة' },
  { value: 250, label: '250 في الصفحة' }
];

export interface PaginationResult<T> {
  /** عناصر الصفحة الحالية فقط */
  pageRows: T[];
  /** الصفحة الحالية بعد التصحيح */
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** رقم أول عنصر (1-based) — 0 لو القائمة فاضية */
  from: number;
  /** رقم آخر عنصر معروض */
  to: number;
  canPrev: boolean;
  canNext: boolean;
  /** التقسيم غير مطلوب (كل حاجة داخل صفحة واحدة) */
  isSinglePage: boolean;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  /** ينفع تتنادى عند تغيير الفلاتر عشان نرجع لأول نتيجة */
  resetPage: () => void;
}

function readStoredSize(storageKey?: string): number | null {
  if (!storageKey) return null;
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(storageKey);
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function usePagination<T>(
  items: readonly T[],
  options: { defaultPageSize?: number; storageKey?: string } = {}
): PaginationResult<T> {
  const { defaultPageSize = DEFAULT_PAGE_SIZE, storageKey } = options;

  const [pageSize, setPageSizeState] = useState<number>(() => readStoredSize(storageKey) ?? defaultPageSize);
  const [page, setPage] = useState(1);

  const total = items.length;
  const safeSize = pageSize > 0 ? pageSize : defaultPageSize;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  // الفلاتر ممكن تخلي الصفحة الحالية خارج النطاق — نرجّعها لآخر صفحة صالحة
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const pageRows = useMemo(() => {
    if (total === 0) return [];
    if (total <= safeSize) return items as T[];
    const start = (safePage - 1) * safeSize;
    return items.slice(start, start + safeSize);
  }, [items, total, safeSize, safePage]);

  const setPageSize = useCallback((size: number) => {
    const next = size > 0 ? size : defaultPageSize;
    setPageSizeState(next);
    setPage(1);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* التخزين مش متاح — نحفض على الإعداد في الذاكرة بس */
      }
    }
  }, [defaultPageSize, storageKey]);

  const resetPage = useCallback(() => setPage(1), []);

  return {
    pageRows,
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages,
    from: total === 0 ? 0 : (safePage - 1) * safeSize + 1,
    to: Math.min(total, safePage * safeSize),
    canPrev: safePage > 1,
    canNext: safePage < totalPages,
    isSinglePage: total <= safeSize,
    setPage,
    setPageSize,
    nextPage: useCallback(() => setPage(prev => Math.min(totalPages, prev + 1)), [totalPages]),
    prevPage: useCallback(() => setPage(prev => Math.max(1, prev - 1)), []),
    firstPage: useCallback(() => setPage(1), []),
    lastPage: useCallback(() => setPage(totalPages), [totalPages]),
    resetPage
  };
}
