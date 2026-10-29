// ============================================================
//  خدمة فحص وتنزيل تحديثات تطبيق الهاتف (Mobile Update Checker)
// ============================================================

export const CURRENT_MOBILE_VERSION = '1.0.29';

export interface MobileUpdateResult {
  ok: boolean;
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseTitle?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  htmlUrl?: string;
  error?: string;
}

/**
 * دالة مقارنة أرقام الإصدارات SemVer
 * ترجع 1 إذا كان v1 > v2
 * ترجع -1 إذا كان v1 < v2
 * ترجع 0 إذا كانا متطابقين
 */
export function compareVersions(v1: string, v2: string): number {
  const p1 = v1.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = v2.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(p1.length, p2.length);

  for (let i = 0; i < len; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * فحص مستودع GitHub بحثاً عن أحدث إصدار وتوفير رابط APK المباشر
 */
export async function checkMobileUpdate(): Promise<MobileUpdateResult> {
  try {
    const res = await fetch('https://api.github.com/repos/msharaf221/MOBPOS-V2/releases/latest', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      },
      cache: 'no-cache',
    });

    if (!res.ok) {
      if (res.status === 404) {
        return {
          ok: false,
          updateAvailable: false,
          currentVersion: CURRENT_MOBILE_VERSION,
          error: 'لم يتم العثور على إصدارات منشورة بعد على مستودع التحديثات',
        };
      }
      return {
        ok: false,
        updateAvailable: false,
        currentVersion: CURRENT_MOBILE_VERSION,
        error: `تعذر الاتصال بمركز التحديثات (كود الاستجابة: ${res.status})`,
      };
    }

    const data = await res.json();
    const rawTag = (data.tag_name || '').trim();
    const cleanTag = rawTag.replace(/^v/, '');
    if (!cleanTag) {
      return {
        ok: false,
        updateAvailable: false,
        currentVersion: CURRENT_MOBILE_VERSION,
        error: 'بيانات التحديث المستلمة غير مكتملة',
      };
    }

    const isNewer = compareVersions(cleanTag, CURRENT_MOBILE_VERSION) > 0;

    // البحث عن ملف APK داخل الأصول المرفقة بالإصدار
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const apkAsset = assets.find((a: any) => 
      typeof a.name === 'string' && (a.name.toLowerCase().endsWith('.apk') || a.name.toLowerCase().includes('companion'))
    );

    const downloadUrl = apkAsset?.browser_download_url || data.html_url;

    return {
      ok: true,
      updateAvailable: isNewer,
      currentVersion: CURRENT_MOBILE_VERSION,
      latestVersion: cleanTag,
      releaseTitle: data.name || `إصدار v${cleanTag}`,
      releaseNotes: data.body || 'تحسينات عامة في الأداء والربط والمزامنة السحابية وإصلاح المشاكل المحاسبية.',
      publishedAt: data.published_at || data.created_at,
      downloadUrl,
      htmlUrl: data.html_url,
    };
  } catch (err: any) {
    console.error('[MobileUpdater] Check error:', err);
    return {
      ok: false,
      updateAvailable: false,
      currentVersion: CURRENT_MOBILE_VERSION,
      error: 'تعذر التحقق من التحديثات. تأكد من اتصال هاتفك بالإنترنت وحاول مجدداً.',
    };
  }
}
