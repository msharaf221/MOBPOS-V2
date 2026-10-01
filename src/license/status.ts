// ============================================================
//  حالة الترخيص — دوال نقية (قابلة للاختبار)
//
//  لا تعتمد على React حتى تظل قابلة للوحدة.
// ============================================================

import { formatDate } from '../utils/format.ts';

export type LicenseStatusValue = 'active' | 'expiring' | 'expired';

export const EXPIRING_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromMs: number, toMs: number): number {
  return Math.ceil((toMs - fromMs) / DAY_MS);
}

/**
 * كشف التلاعب بساعة النظام (Clock Tampering / Rollback):
 * لو الوقت الحالي أقدم من آخر وقت تحقق أو تشغيل مسجل بهامش سماحية (5 دقائق)
 * فهذا يعني أن المستخدم رجّع تاريخ جهازه للوراء للتحايل على انتهاء الترخيص.
 */
export function isClockTampered(
  lastKnownTime: string | number | Date | undefined | null,
  now: Date = new Date(),
  toleranceMs = 5 * 60 * 1000
): boolean {
  if (!lastKnownTime) return false;
  const lastMs = typeof lastKnownTime === 'number'
    ? lastKnownTime
    : lastKnownTime instanceof Date
    ? lastKnownTime.getTime()
    : new Date(lastKnownTime).getTime();

  if (Number.isNaN(lastMs)) return false;
  // إذا كان الوقت الحالي أقل من آخر وقت مسجل مطروحاً منه هامش التسامح
  return now.getTime() < (lastMs - toleranceMs);
}

/**
 * فحص سلامة بنية المفتاح (Key Format Validation):
 * مفاتيح MOBPOS2 تتكون من: MOBPOS2.<payloadB64>.<signatureB64>
 */
export function validateLicenseKeyFormat(keyStr: string | undefined | null): { valid: boolean; error?: string } {
  if (typeof keyStr !== 'string' || !keyStr.trim()) {
    return { valid: false, error: 'المفتاح فارغ' };
  }
  const clean = keyStr.trim();
  const parts = clean.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'صيغة المفتاح غير صالحة — يجب أن يحتوي على 3 أجزاء مفصولة بنقطة' };
  }
  if (parts[0] !== 'MOBPOS2') {
    return { valid: false, error: 'بادئة المفتاح غير مدعومة (يجب أن تبدأ بـ MOBPOS2)' };
  }
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  if (!base64UrlRegex.test(parts[1]) || !base64UrlRegex.test(parts[2])) {
    return { valid: false, error: 'محتوى المفتاح يحتوي على رموز غير صالحة' };
  }
  return { valid: true };
}

/**
 * حالة الترخيص:
 *  - 'expired'   → انتهت الصلاحية أو تم اكتشاف تلاعب بالوقت
 *  - 'expiring'  → تبقّى 7 أيام أو أقل
 *  - 'active'    → يعمل طبيعياً (بما في ذلك مدى الحياة)
 *
 * عند مرور `now` افتراضياً يستخدم الوقت الحالي — مرّره في الاختبارات.
 */
export function getLicenseStatus(
  expiresAt: string,
  lifetime = false,
  now: Date = new Date(),
  lastKnownTime?: string | number | Date
): LicenseStatusValue {
  // فحص التلاعب بساعة النظام أولاً
  if (lastKnownTime && isClockTampered(lastKnownTime, now)) {
    return 'expired';
  }

  if (lifetime || !expiresAt) return 'active';

  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return 'active';

  const nowMs = now.getTime();
  if (expiresMs <= nowMs) return 'expired';

  const days = daysBetween(nowMs, expiresMs);
  return days <= EXPIRING_SOON_DAYS ? 'expiring' : 'active';
}

/** يوم/أيام متبقية كرقم (∞ لمدى الحياة). */
export function getLicenseDaysRemaining(expiresAt: string, lifetime = false, now: Date = new Date()): number {
  if (lifetime || !expiresAt) return Infinity;
  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return 0;
  return Math.max(0, daysBetween(now.getTime(), expiresMs));
}

/** عرض تاريخ الانتهاء بالعربي، أو «مدى الحياة». */
export function formatLicenseExpiry(expiresAt: string, lifetime = false): string {
  if (lifetime || !expiresAt) return 'مدى الحياة';
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return expiresAt;
  return formatDate(date, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** نص حالة واضح للتطبيق. */
export function formatLicenseStatus(status: LicenseStatusValue): string {
  switch (status) {
    case 'expired':
      return 'منتهية';
    case 'expiring':
      return 'قرب تنتهي';
    case 'active':
    default:
      return 'شغّالة';
  }
}
