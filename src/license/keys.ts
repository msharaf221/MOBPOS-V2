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
export const ACTIVATION_SERVER_URL: string = 'https://mobpos.onrender.com';

/**
 * توكن عميل سيرفر التفعيل (اختياري) — يطابق ACTIVATION_TOKEN على السيرفر (لحماية /activate و /verify).
 *
 * ⚠️ ملاحظة أمنية هامة:
 * هذا التوكن يُوزّع مع كود العميل في المتصفح والـ EXE، لذا فهو ليس سراً إدارياً حقيقياً.
 * الأمان الفعلي لنظام التراخيص يعتمد على التوقيع الرقمي بالمفتاح غير القابل للتزوير (ECDSA P-256)
 * والربط العتادي بالجهاز (Machine Token + Device Fingerprint).
 * العمليات الإدارية الحساسة (/revoke و /release) محمية بـ ADMIN_TOKEN منفصل على السيرفر ولا توجد في كود العميل إطلاقاً.
 */
export const ACTIVATION_SERVER_TOKEN: string = 'mobpos-act-2026-7f3Kp9Qz';

// مفاتيح التخزين المحلي
export const STORAGE_KEYS = {
  activeLicense: 'msp_active_license_v2',
  masterPasswordHash: 'msp_master_pw_v2',
  signingKey: 'msp_signing_key_v2',   // المفتاح الخاص (في متصفح المالك فقط)
  masterKeysList: 'msp_master_keys_v2', // سجل المفاتيح المولّدة (في متصفح المالك فقط)
  lastServerVerify: 'msp_last_server_verify', // آخر إعادة تحقق مع سيرفر التفعيل (throttle)
};
