/**
 * 🔐 قفل التطبيق برمز مطابقة (App Lock PIN) — حماية بيانات الفروع على الجهاز.
 * الرمز لا يُخزَّن أبداً نصاً: يُحفظ هاش SHA-256 عبر crypto.subtle فقط.
 */

export const APP_LOCK_ENABLED_KEY = 'mobpos_companion_app_lock_enabled';
export const APP_LOCK_HASH_KEY = 'mobpos_companion_app_lock_hash';

export function isAppLockEnabled(): boolean {
  try {
    return localStorage.getItem(APP_LOCK_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** هاش SHA-256 للرمز مع سلسلة تخص التطبيق (لا salt إضافي — كافٍ لقفل جهاز محلي) */
export async function hashAppLockPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`mobpos-companion::applock::${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getAppLockHash(): string | null {
  try {
    return localStorage.getItem(APP_LOCK_HASH_KEY);
  } catch {
    return null;
  }
}

export async function setAppLockPin(pin: string): Promise<void> {
  const hash = await hashAppLockPin(pin);
  localStorage.setItem(APP_LOCK_HASH_KEY, hash);
  localStorage.setItem(APP_LOCK_ENABLED_KEY, 'true');
}

export function disableAppLock(): void {
  localStorage.removeItem(APP_LOCK_HASH_KEY);
  localStorage.setItem(APP_LOCK_ENABLED_KEY, 'false');
}

/** التحقق من الرمز المُدخل مقابل الهاش المخزن */
export async function verifyAppLockPin(pin: string): Promise<boolean> {
  const stored = getAppLockHash();
  if (!stored) return false;
  const hash = await hashAppLockPin(pin);
  // مقارنة نصية بسيطة هنا مقبولة (هاش ثابت محلي) لكن نفضّل مسار ثابت الزمن:
  if (hash.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash.charCodeAt(i) ^ stored.charCodeAt(i);
  }
  return diff === 0;
}
