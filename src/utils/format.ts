// ============================================================
//  منسّقات الأرقام المشتركة — Shared Intl formatters
// ------------------------------------------------------------
//  كل صفحة كانت تعرّف formatCurrency خاص بها ويبني كائن
//  Intl.NumberFormat + قراءتي localStorage في كل استدعاء.
//  بناء الـ formatter مكلف جداً (~10µs)، ومع جدول 250 صنف ×
//  عمودين سعريّين ده كان يكلّف ~25-30 مللي ثانية في الريندر
//  الواحد — وكل ضغطة حرف في البحث كانت تعيد هذا الحساب.
//
//  الحل: نفس التنسيق بالظبط، لكن الـ formatter يتبني مرة واحدة
//  لكل (locale + currency) ويُخزّن في كاش، فبقيت العملية أرخص
//  بمرات كثيرة. لو غيّر المستخدم اللغة أو العملة من الإعدادات
//  يتغيّر المفتاح تلقائياً ويتبني formatter جديد.
// ============================================================

const MAX_CACHED_FORMATTERS = 24;
const currencyCache = new Map<string, Intl.NumberFormat>();
const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();

/** قراءة آمنة لإعدادات localStorage (تشتغل حتى في Node/التستات حيث لا يوجد). */
function storedSetting(key: string, fallback: string): string {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw && raw.trim() ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function getAppLocale(): string {
  return storedSetting('app_locale', 'ar-EG');
}

export function getAppCurrency(): string {
  return storedSetting('app_currency', 'EGP');
}

/** الكاش محدود الحجم حتى لا يكبر بلا نهاية لو غيّرت اللغة/العملة مرات كثيرة. */
function remember<K, V>(cache: Map<K, V>, key: K, value: V): V {
  if (cache.size >= MAX_CACHED_FORMATTERS) cache.clear();
  cache.set(key, value);
  return value;
}

const safeValue = (value: number | undefined | null): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** تنسيق المبالغ بنفس ما كانت عليه الصفحات: ج.م. بصفر كسور عشرية. */
export function formatCurrency(value: number | undefined | null): string {
  const locale = getAppLocale();
  const currency = getAppCurrency();
  const key = `${locale}|${currency}`;
  const cached = currencyCache.get(key);
  const formatter = cached ?? remember(
    currencyCache,
    key,
    new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 })
  );
  return formatter.format(safeValue(value));
}

/** رقم عادي (بلا عملة) بنفس الـ locale المختار. */
export function formatNumber(value: number | undefined | null, maxFractionDigits = 0): string {
  const locale = getAppLocale();
  const key = `${locale}|${maxFractionDigits}`;
  const cached = numberCache.get(key);
  const formatter = cached ?? remember(
    numberCache,
    key,
    new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits })
  );
  return formatter.format(safeValue(value));
}

/**
 * تاريخ (أو تاريخ + وقت) بنفس إخراج `toLocaleDateString` بالضبط، لكن مع
 * كاش للـ formatter بدل بناء واحد لكل خلية في الجدول.
 */
export function formatDate(
  value: string | number | Date | undefined | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (value === undefined || value === null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  const locale = getAppLocale();
  const key = `${locale}|${options ? JSON.stringify(options) : ''}`;
  const cached = dateCache.get(key);
  const formatter = cached ?? remember(
    dateCache,
    key,
    new Intl.DateTimeFormat(locale, options)
  );
  return formatter.format(date);
}

/** تاريخ + وقت لاختصار الاستدعاء في الكشوف. */
export function formatDateTime(value: string | number | Date | undefined | null): string {
  return formatDate(value, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
