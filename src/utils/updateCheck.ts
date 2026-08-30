// ============================================================
//  معالجة نتيجة فحص التحديثات — دوال نقية (قابلة للاختبار)
//
//  النتيجة من `mobpos:check-updates` (electron-updater v6) تُحوَّل هنا
//  إلى رسالة عربية واضحة + حالة جاهزة للواجهة.
// ============================================================

import { formatDate } from './format.ts';

export interface UpdateCheckResponse {
  ok: boolean;
  /** true إذا كان التحديث يعمل في وضع التطوير / المتصفح (غير مثبت). */
  dev?: boolean;
  updateAvailable?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  releaseNotes?: string | Array<{ version?: string; note?: string; title?: string }> | null;
}

export type UpdateCheckMessageKind =
  | 'available'
  | 'up-to-date'
  | 'error'
  | 'dev'
  | 'unknown';

export interface UpdateCheckMessage {
  kind: UpdateCheckMessageKind;
  message: string;
  latestVersion?: string;
}

/** نص الحالة حسب نتيجة الفحص — بدون تاريخ (التاريخ يُعرض بجانبها في الواجهة). */
export function buildUpdateCheckMessage(
  result: UpdateCheckResponse,
  currentVersion: string | undefined
): UpdateCheckMessage {
  if (result.dev) {
    return {
      kind: 'dev',
      message: 'الفحص متاح في النسخ المثبتة فقط.',
    };
  }

  if (!result.ok) {
    return {
      kind: 'error',
      message: 'تعذّر الفحص دلوقتي — حاول تاني بعد شوية.',
    };
  }

  if (result.updateAvailable && result.latestVersion) {
    return {
      kind: 'available',
      message: `متوفر تحديث v${result.latestVersion} — هيتم التحميل تلقائيًا وسيُثبَّت عند إغلاق التطبيق الجاي.`,
      latestVersion: result.latestVersion,
    };
  }

  if (!result.updateAvailable) {
    const shownVersion = currentVersion || result.currentVersion;
    return {
      kind: 'up-to-date',
      message: shownVersion ? `إنت على أحدث إصدار (v${shownVersion})` : 'إنت على أحدث إصدار.',
    };
  }

  // fallback دفاعي (نتيجة ناقصة)
  const shownVersion = currentVersion || result.currentVersion;
  return {
    kind: 'unknown',
    message: shownVersion ? `تم الفحص — الإصدار الحالي v${shownVersion}.` : 'تم الفحص — لا توجد معلومات كاملة.',
  };
}

/** تنسيق «آخر فحص» بالعربي. */
export function formatLastChecked(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  return formatDate(date, { hour: '2-digit', minute: '2-digit' });
}
