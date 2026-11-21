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

/**
 * عرض القروش/الهللات.
 *   • `auto` (الافتراضي): يعرض الكسور **لما تكون موجودة بس** — 250 تفضل «٢٥٠ ج.م.»
 *     و250.75 تبان «٢٥٠٫٧٥ ج.م.». قبل كده كان التقريب لأقرب جنيه بيخفي القروش
 *     ويخلّي مجموع السطور مش مطابق للإجمالي على الشاشة.
 *   • `off`: تقريب لأقرب وحدة (السلوك القديم).
 *   • `on`: منزلتين دايمًا.
 */
export type CurrencyDecimalsMode = 'auto' | 'on' | 'off';

export function getCurrencyDecimalsMode(): CurrencyDecimalsMode {
  const raw = storedSetting('app_currency_decimals', 'auto');
  return raw === 'on' || raw === 'off' ? raw : 'auto';
}

function fractionDigitsFor(mode: CurrencyDecimalsMode): { minimumFractionDigits: number; maximumFractionDigits: number } {
  if (mode === 'off') return { minimumFractionDigits: 0, maximumFractionDigits: 0 };
  if (mode === 'on') return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return { minimumFractionDigits: 0, maximumFractionDigits: 2 };
}

/** الكاش محدود الحجم حتى لا يكبر بلا نهاية لو غيّرت اللغة/العملة مرات كثيرة. */
function remember<K, V>(cache: Map<K, V>, key: K, value: V): V {
  if (cache.size >= MAX_CACHED_FORMATTERS) cache.clear();
  cache.set(key, value);
  return value;
}

import { roundMoney } from '../hooks/store/helpers.ts';

const safeValue = (value: number | undefined | null): number =>
  typeof value === 'number' && Number.isFinite(value) ? roundMoney(value) : 0;

export function formatCurrency(value: number | undefined | null): string {
  const num = safeValue(value);
  const locale = getAppLocale();
  const currency = getAppCurrency();
  const mode = getCurrencyDecimalsMode();
  const key = `${locale}|${currency}|${mode}`;
  const cached = currencyCache.get(key);
  const formatter = cached ?? remember(
    currencyCache,
    key,
    new Intl.NumberFormat(locale, { style: 'currency', currency, ...fractionDigitsFor(mode) })
  );
  const res = formatter.format(num);
  return num < 0 ? `\u200E${res}` : res;
}

/** رقم عادي (بلا عملة) بنفس الـ locale المختار. */
export function formatNumber(value: number | undefined | null, maxFractionDigits = 0): string {
  const num = safeValue(value);
  const locale = getAppLocale();
  const key = `${locale}|${maxFractionDigits}`;
  const cached = numberCache.get(key);
  const formatter = cached ?? remember(
    numberCache,
    key,
    new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits })
  );
  const res = formatter.format(num);
  return num < 0 ? `\u200E${res}` : res;
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

/**
 * اليوم **المحلي** بصيغة `YYYY-MM-DD` — لمقارنات «اليوم» في التقارير والفلاتر.
 *
 * ⚠️ لا تستخدم `new Date().toISOString().slice(0, 10)` لهذا الغرض:
 * `toISOString()` يرجّع تاريخ UTC، فينتقل «اليوم» الساعة 2 أو 3 بعد منتصف
 * الليل بتوقيت مصر بدل منتصف الليل المحلي — وفواتير أول الليل كانت بتتحسب
 * على اليوم السابق في الفلاتر ولوحات المتابعة.
 *
 * بدون وسيط يرجّع يوم التشغيل الحالي؛ ومع قيمة يرجّع اليوم المحلي لتلك
 * اللحظة (سلسلة فارغة لو القيمة غير صالحة).
 */
export function localDayStr(value?: string | number | Date | null): string {
  const date = value === undefined || value === null ? new Date() : (value instanceof Date ? value : new Date(value));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
