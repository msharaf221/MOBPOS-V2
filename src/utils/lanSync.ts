// ============================================================
//  مزامنة الشبكة المحلية (LAN Sync Client)
//  تسمح للمتصفح على الهاتف أو التابلت أو جهاز كاشير آخر
//  بالاتصال اللحظي بالسيرفر الرئيسي وسحب وتحديث البيانات
// ============================================================

import type { LanServerInfo, User } from '../types/index.ts';

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export async function fetchLanServerInfo(): Promise<LanServerInfo | null> {
  try {
    const res = await fetch('/api/lan/info', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      status: data.status || 'online',
      hostName: data.hostName || 'الرئيسي',
      ipAddresses: data.ipAddresses || [],
      port: data.port || 8420,
      activeClients: data.activeClients || 0,
      shopName: data.shopName || 'MOBPOS',
      requiresPin: !!data.requiresPin,
    };
  } catch {
    return null;
  }
}

/** هل المتصفح الحالي يعمل كعميل فرعي على الشبكة المحلية؟ */
export function isLanClient(): boolean {
  if (typeof window === 'undefined') return false;
  // إذا لم نكن في تطبيق Electron وكنا متصلين بـ IP محلي وليس localhost
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocalhost) return false;
  
  // استبعاد النسخ المرفوعة على الويب ببروتوكول HTTPS
  if (window.location.protocol === 'https:') return false;

  return true;
}

/** سحب كافة البيانات المركزية من الخادم */
export async function fetchCentralData(): Promise<Record<string, any> | null> {
  try {
    const res = await fetch('/api/lan/data');
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[lanSync] Failed to fetch central data:', err);
    return null;
  }
}

/** دفع كل البيانات إلى الخادم (من الجهاز الرئيسي لأول مرة أو عند التحديث الشامل) */
export async function pushCentralData(allData: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/lan/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(allData),
    });
    return res.ok;
  } catch (err) {
    console.error('[lanSync] Failed to push central data:', err);
    return false;
  }
}

/** إرسال تعديل جزئي ذري للخادم */
export async function pushDelta(
  storeName: string,
  items: unknown[],
  deltaType: 'upsert' | 'delete' | 'replace' | 'increment' = 'upsert'
): Promise<boolean> {
  try {
    const res = await fetch('/api/lan/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeName, items, deltaType }),
    });
    return res.ok;
  } catch (err) {
    console.error('[lanSync] Failed to push delta:', err);
    return false;
  }
}

/** التحقق من تسجيل دخول المستخدم مباشرة عبر خادم الشبكة المحلية */
export async function authenticateLanUser(
  username: string,
  password: string
): Promise<{ ok: boolean; user?: User; users?: User[]; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000); // 5 ثوان كحد أقصى
  try {
    const res = await fetch('/api/lan/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    return data;
  } catch (err: unknown) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : 'تعذر الاتصال بالخادم الرئيسي';
    return { ok: false, error: message };
  }
}

/** الاستماع للأحداث الحية من الخادم عبر Server-Sent Events (SSE) */
export function connectLanStream(callbacks: {
  onSync: (data: { storeName: string; items: unknown[]; deltaType: string }) => void;
  onFullDataReplaced?: (data: { stores: string[] }) => void;
  onStatusChange?: (connected: boolean) => void;
}): () => void {
  if (typeof window === 'undefined') return () => {};

  function setup() {
    try {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource('/api/lan/stream');

      eventSource.onopen = () => {
        callbacks.onStatusChange?.(true);
      };

      eventSource.addEventListener('sync', (e) => {
        try {
          const payload = JSON.parse(e.data);
          callbacks.onSync(payload);
        } catch (err) {
          console.error('[lanSync] SSE sync parse error:', err);
        }
      });

      eventSource.addEventListener('data-replaced', (e) => {
        try {
          const payload = JSON.parse(e.data);
          callbacks.onFullDataReplaced?.(payload);
        } catch (err) {
          console.error('[lanSync] SSE data-replaced parse error:', err);
        }
      });

      eventSource.onerror = () => {
        callbacks.onStatusChange?.(false);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        // إعادة المحاولة بعد 4 ثوانٍ
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(setup, 4000);
      };
    } catch (err) {
      console.error('[lanSync] Failed to establish EventSource:', err);
    }
  }

  setup();

  return () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}
