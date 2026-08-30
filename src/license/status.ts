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
 * حالة الترخيص:
 *  - 'expired'   → انتهت الصلاحية
 *  - 'expiring'  → تبقّى 7 أيام أو أقل
 *  - 'active'    → يعمل طبيعياً (بما في ذلك مدى الحياة)
 *
 * عند مرور `now` افتراضياً يستخدم الوقت الحالي — مرّره في الاختبارات.
 */
export function getLicenseStatus(expiresAt: string, lifetime = false, now: Date = new Date()): LicenseStatusValue {
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
