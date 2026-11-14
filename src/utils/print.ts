// ============================================================
//  الطباعة + جسر تطبيق سطح المكتب
//  داخل EXE: قدرات أصلية (PDF حقيقي / طباعة مخفية / تحكم النافذة)
//  في المتصفح: بدائل ويب عادية
// ============================================================

export interface SavePdfResult {
  ok: boolean;
  canceled?: boolean;
  path?: string;
  error?: string;
}

/** هل نعمل داخل تطبيق سطح المكتب؟ */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.mobpos?.isDesktop;
}

/**
 * اطبع الإيصال:
 * - داخل الـ EXE: طباعة صامتة مباشرة للطابعة الافتراضية (بدون نافذة)
 * - في المتصفح: نافذة الطباعة العادية
 */
export async function printReceipt(): Promise<void> {
  if (window.mobpos?.printSilent) {
    const ok = await window.mobpos.printSilent();
    if (ok) return;
  }
  window.print();
}

/** تبديل وضع الكيوسك (متاح داخل الـ EXE فقط) */
export async function toggleKiosk(): Promise<boolean | null> {
  if (window.mobpos?.toggleKiosk) return window.mobpos.toggleKiosk();
  return null;
}
