// ============================================================
//  إعدادات نظام الترخيص v2
//
//  ⚠️ الأمان هنا يعتمد على التوقيع الرقمي (ECDSA P-256):
//  - المفتاح العام فقط هو المضمّن في التطبيق (يتحقق من المفاتيح ولا يستطيع توليدها)
//  - المفتاح الخاص موجود فقط لدى صاحب النظام (master-private-key.json) ولا يُنشر أبداً
// ============================================================

/**
 * المفتاح العام المستخدم للتحقق من توقيع مفاتيح الترخيص.
 * لتغييره: ولّد زوج مفاتيح جديد من لوحة الماستر، ثم ضع المفتاح العام هنا وأعد البناء.
 */
export const LICENSE_PUBLIC_KEY: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'vXGddCoorMHSRbcU356zYOS41aoguukIMGj-f2etHJc',
  y: '20xJoU_tJ_DhbrcSHnnLLov0d6wp42BTTocL1gb702A',
};

/**
 * سيرفر التفعيل (اختياري لكن موصى به بشدة).
 * عند ضبطه: كل مفتاح يعمل مرة واحدة فقط على جهاز واحد عالمياً — السيرفر
 * يسجّل أول تفعيل للمفتاح ويرفض أي جهاز آخر للأبد.
 *
 * مثال بعد نشر مجلد activation-server/:
 *   export const ACTIVATION_SERVER_URL = 'https://my-activation-server.example.com';
 *
 * اتركه فارغاً للعمل بدون سيرفر (سيتم ربط المفتاح بالجهاز محلياً فقط).
 */
export const ACTIVATION_SERVER_URL: string =
  (typeof import.meta !== 'undefined' &&
    ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_ACTIVATION_SERVER_URL)) ||
  'https://mobpos-7ea73.containers.snapdeploy.app';

/**
 * توكن عميل سيرفر التفعيل — يطابق ACTIVATION_TOKEN على السيرفر (لحماية /activate و /verify).
 *
 * ⚠️ ملاحظة أمنية هامة:
 * هذا التوكن يُوزّع مع كود العميل في المتصفح والـ EXE، لذا فهو ليس سراً إدارياً حقيقياً.
 * الأمان الفعلي لنظام التراخيص يعتمد على التوقيع الرقمي (ECDSA P-256)
 * والربط العتادي بالجهاز (Machine Token + Device Fingerprint).
 * العمليات الإدارية (/revoke و /release) محمية بـ ADMIN_TOKEN على السيرفر فقط.
 *
 * يُفضّل حقنه وقت البناء عبر VITE_ACTIVATION_SERVER_TOKEN ولا تُثبّت سراً في المستودع.
 */
export const ACTIVATION_SERVER_TOKEN: string =
  (typeof import.meta !== 'undefined' &&
    ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_ACTIVATION_SERVER_TOKEN ||
     (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_ACTIVATION_TOKEN)) ||
  'Muhamed@04035122139M';

// مفاتيح التخزين المحلي
export const STORAGE_KEYS = {
  activeLicense: 'msp_active_license_v2',
  masterPasswordHash: 'msp_master_pw_v2',
  signingKey: 'msp_signing_key_v2',
  masterKeysList: 'msp_master_keys_v2',
  lastServerVerify: 'msp_last_server_verify',
};
