// ============================================================
//  Google Identity Services (GIS) — المصادقة بحساب Google
//  يدعم تسجيل الدخول المباشر والحصول على Google ID Token
//  للمصادقة السلسة مع Supabase دون الحاجة لمتصفحات خارجية
// ============================================================

export interface GoogleUserMetadata {
  email?: string;
  name?: string;
  picture?: string;
  sub?: string; // Google User ID
}



const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisLoadPromise: Promise<void> | null = null;

export function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    const onReady = () => {
      if (window.google?.accounts?.id) resolve();
      else reject(new Error('فشل تهيئة مكتبة Google Identity'));
    };

    if (existing) {
      existing.addEventListener('load', onReady);
      if (window.google?.accounts?.id) resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error('تعذر تحميل مكتبة Google — تحقق من اتصال الإنترنت'));
    document.head.appendChild(script);
  }).catch(err => {
    gisLoadPromise = null;
    throw err;
  });

  return gisLoadPromise;
}

/**
 * فك تشفير حمولة Google ID Token JWT بأمان للحصول على الاسم والإيميل والصورة
 */
export function decodeGoogleJwt(idToken: string): GoogleUserMetadata | null {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = decodeURIComponent(
      atob(payloadBase64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonStr) as GoogleUserMetadata;
  } catch (err) {
    console.warn('[GoogleAuth] Failed to decode idToken payload:', err);
    return null;
  }
}

/**
 * استخراج Client ID من الإعدادات المخزنة أو متغيرات البيئة
 */
export function getGoogleClientId(): string {
  if (typeof localStorage !== 'undefined') {
    const stored = (localStorage.getItem('mobpos_google_client_id') || '').trim();
    if (stored) return stored;
    // Fallback: check drive client id if configured
    try {
      const bSettings = localStorage.getItem('mobpos_backup_settings_v1');
      if (bSettings) {
        const parsed = JSON.parse(bSettings);
        if (parsed.driveClientId && typeof parsed.driveClientId === 'string') {
          return parsed.driveClientId.trim();
        }
      }
    } catch {
      // ignore
    }
  }

  const metaEnv = (typeof import.meta !== 'undefined' && ((import.meta as unknown as Record<string, unknown>).env as Record<string, string> | undefined)) || {};
  const envId = (metaEnv.VITE_GOOGLE_CLIENT_ID || '').trim();
  return envId;
}

export function saveGoogleClientId(clientId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('mobpos_google_client_id', clientId.trim());
}

/**
 * طلب تسجيل الدخول بحساب Google عبر نافذة مدمجة (One-Tap / Popup)
 */
export async function promptGoogleIdentity(clientId: string): Promise<{ ok: boolean; idToken?: string; metadata?: GoogleUserMetadata; error?: string }> {
  const cleanId = clientId.trim();
  if (!cleanId) {
    return { ok: false, error: 'معرّف Google Client ID غير محدد' };
  }

  try {
    await loadGisScript();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'تعذر تحميل مكتبة Google' };
  }

  const idApi = window.google?.accounts?.id;
  if (!idApi) {
    return { ok: false, error: 'مكتبة Google غير متاحة' };
  }

  return new Promise(resolve => {
    let resolved = false;

    // Timeout safety
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, error: 'تم إلغاء تسجيل الدخول أو انتهت المهلة' });
      }
    }, 90000);

    try {
      idApi.initialize({
        client_id: cleanId,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: res => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          if (!res?.credential) {
            resolve({ ok: false, error: 'لم يتم استلام رمز التحقق من Google' });
            return;
          }
          const metadata = decodeGoogleJwt(res.credential) || undefined;
          resolve({ ok: true, idToken: res.credential, metadata });
        },
      });

      idApi.prompt(notification => {
        if (notification.isNotDisplayed()) {
          console.warn('[GoogleAuth] One-Tap prompt not displayed:', notification.getNotDisplayedReason());
        }
        if (notification.isSkippedMoment()) {
          console.warn('[GoogleAuth] One-Tap prompt skipped:', notification.getSkippedReason());
        }
        if (notification.isDismissedMoment()) {
          console.log('[GoogleAuth] One-Tap prompt dismissed');
        }
      });
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ ok: false, error: err instanceof Error ? err.message : 'فشل بدء تسجيل الدخول بـ Google' });
      }
    }
  });
}
