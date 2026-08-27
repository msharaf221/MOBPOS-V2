// ============================================================
//  محرك الترخيص v2 — مفاتيح موقّعة رقمياً (ECDSA P-256)
//
//  - التطبيق يتحقق فقط (مفتاح عام) ولا يستطيع توليد مفاتيح
//  - التوليد يتم في لوحة الماستر بالمفتاح الخاص لدى المالك
//  - ربط الجهاز: المفتاح يُفعَّل على جهاز واحد (بصمة عتادية قوية v2)
//  - سيرفر التفعيل يفرض "الاستخدام مرة واحدة" عالمياً + يصدر
//    Machine Token يُعاد التحقق منه دورياً عبر /verify (Re-verification)
// ============================================================

import { LicenseKey, ActiveLicense, PlanType, PLAN_FEATURES } from './types';
import { LICENSE_PUBLIC_KEY, ACTIVATION_SERVER_URL, ACTIVATION_SERVER_TOKEN, STORAGE_KEYS } from './keys';
import {
  b64urlEncodeString, b64urlDecodeString,
  importPublicKey, importPrivateKey, verifySignature, signMessage,
  generateSigningKeyPair, hashPassword, verifyPasswordHash,
} from './crypto';
import { getDeviceId } from './device';

// ===== Key payload (the signed content) =====

export interface KeyPayloadV2 {
  v: 2;
  id: string;             // unique key id
  p: PlanType;            // plan
  s: string;              // shop name
  u: number;              // max users
  i: string;              // issued at (ISO)
  e: string;              // expires at (ISO) — '' = lifetime
  lt: boolean;            // lifetime flag
  to: string;             // issued to
  n: string;              // notes
}

const KEY_PREFIX = 'MSP2';

// ===== Parsing & verification =====

export interface VerifyResult {
  valid: boolean;
  payload?: KeyPayloadV2;
  error?: string;
}

/** Parse the key string and verify its ECDSA signature. */
export async function parseAndVerifyKey(keyStr: string): Promise<VerifyResult> {
  try {
    const trimmed = keyStr.trim();
    const parts = trimmed.split('.');
    if (parts.length !== 3 || parts[0] !== KEY_PREFIX) {
      return { valid: false, error: 'مفتاح غير صالح — تأكد من نسخه كاملاً' };
    }

    const [, payloadB64, signatureB64] = parts;

    let payload: KeyPayloadV2;
    try {
      payload = JSON.parse(b64urlDecodeString(payloadB64));
    } catch {
      return { valid: false, error: 'مفتاح تالف أو معدّل' };
    }

    if (payload.v !== 2 || !payload.id || !payload.p) {
      return { valid: false, error: 'إصدار مفتاح غير مدعوم' };
    }

    const publicKey = await importPublicKey(LICENSE_PUBLIC_KEY);
    const signatureOk = await verifySignature(publicKey, `${KEY_PREFIX}.${payloadB64}`, signatureB64);
    if (!signatureOk) {
      return { valid: false, error: 'مفتاح مزوّر — التوقيع الرقمي غير صحيح' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'مفتاح غير صالح' };
  }
}

/** Verify a key and check expiration (does NOT activate it). */
export async function validateLicenseKey(keyStr: string): Promise<{
  valid: boolean;
  payload?: KeyPayloadV2;
  error?: string;
}> {
  const result = await parseAndVerifyKey(keyStr);
  if (!result.valid || !result.payload) return result;

  if (!result.payload.lt) {
    const expiresAt = new Date(result.payload.e);
    if (isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      return { valid: false, error: 'هذا المفتاح منتهي الصلاحية' };
    }
  }

  return result;
}

// ===== Expiration helpers =====

export function isLicenseExpired(expiresAt: string, lifetime = false): boolean {
  if (lifetime || !expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function getDaysRemaining(expiresAt: string, lifetime = false): number {
  if (lifetime || !expiresAt) return Infinity;
  const exp = new Date(expiresAt);
  const now = new Date();
  return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export function isModuleAvailable(plan: PlanType, moduleId: string): boolean {
  return PLAN_FEATURES[plan].modules.includes(moduleId);
}

// ===== Activation (with device binding + optional server) =====

export interface ActivationResult {
  ok: boolean;
  license?: ActiveLicense;
  error?: string;
  code?: 'invalid' | 'expired' | 'used_on_other_device' | 'server_unreachable' | 'unknown';
}

/** Register/consume the key on the activation server (if configured). */
async function serverActivate(
  keyId: string,
  deviceId: string
): Promise<{ ok: boolean; machineToken?: string; error?: string; code?: ActivationResult['code'] }> {
  if (!ACTIVATION_SERVER_URL) return { ok: true }; // offline mode

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ACTIVATION_SERVER_TOKEN) headers['Authorization'] = `Bearer ${ACTIVATION_SERVER_TOKEN}`;

    const res = await fetch(`${ACTIVATION_SERVER_URL.replace(/\/$/, '')}/activate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ keyId, deviceId }),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) {
      // v2: السيرفر يصدر Machine Token مرتبط بهذا الجهاز
      const machineToken = typeof json.machineToken === 'string' ? json.machineToken : undefined;
      return { ok: true, machineToken };
    }
    if (json.reason === 'used_on_other_device') {
      return { ok: false, code: 'used_on_other_device', error: 'هذا المفتاح تم تفعيله من قبل على جهاز آخر ولا يمكن استخدامه مرة أخرى' };
    }
    if (json.reason === 'unauthorized' || res.status === 401) {
      return { ok: false, code: 'unknown', error: 'سيرفر التفعيل رفض الطلب (توكن غير صحيح)' };
    }
    return { ok: false, code: 'unknown', error: json.error || 'رفض سيرفر التفعيل العملية' };
  } catch {
    return { ok: false, code: 'server_unreachable', error: 'تعذر الوصول إلى سيرفر التفعيل — تحقق من اتصال الإنترنت' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Full activation flow:
 * 1) verify signature  2) check expiry  3) device fingerprint
 * 4) consume key on the activation server (one-time, if configured)
 * 5) store the activation record locally
 */
export async function activateLicense(keyStr: string): Promise<ActivationResult> {
  const validation = await validateLicenseKey(keyStr.trim());
  if (!validation.valid || !validation.payload) {
    return { ok: false, error: validation.error || 'مفتاح غير صالح', code: 'invalid' };
  }
  const payload = validation.payload;

  const deviceId = await getDeviceId();

  const serverResult = await serverActivate(payload.id, deviceId);
  if (!serverResult.ok) {
    return { ok: false, error: serverResult.error, code: serverResult.code };
  }

  const license: ActiveLicense = {
    keyId: payload.id,
    key: keyStr.trim(),
    plan: payload.p,
    shopName: payload.s,
    activatedAt: new Date().toISOString(),
    expiresAt: payload.lt ? '' : payload.e,
    lifetime: payload.lt,
    maxUsers: payload.u || PLAN_FEATURES[payload.p].maxUsers,
    deviceId,
    machineToken: serverResult.machineToken,
    lastVerifiedAt: new Date().toISOString(),
  };

  storeLicense(license);
  return { ok: true, license };
}

// ===== Stored activation record =====

export function storeLicense(license: ActiveLicense): void {
  localStorage.setItem(STORAGE_KEYS.activeLicense, JSON.stringify(license));
}

export function clearLicense(): void {
  localStorage.removeItem(STORAGE_KEYS.activeLicense);
}

// ===== Re-verification — إعادة تحقق دورية مع سيرفر التفعيل =====

export type ReverifyStatus =
  | 'ok'                    // تحقق ناجح
  | 'throttled'             // تم التحقق مؤخراً — تجاوز هذه المرة
  | 'offline_mode'          // لا يوجد سيرفر مفعّل (وضع أوفلاين)
  | 'server_unreachable'    // السيرفر غير متاح — يستمر العمل (سماحية أوفلاين)
  | 'revoked'               // المفتاح ملغى من السيرفر → مُسح محلياً
  | 'bad_token'             // Machine Token خاطئ → مُسح محلياً
  | 'used_on_other_device'  // المفتاح مرتبط بجهاز آخر → مُسح محلياً
  | 'unknown_key'           // المفتاح غير مسجل على السيرفر → مُسح محلياً
  | 'unknown';

/** إعادة التحقق مرة واحدة كل 24 ساعة كحد أقصى. */
const REVERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * يقدّم الترخيص للسيرفر على endpoint ‏/verify:
 * keyId + deviceId + machineToken — إثبات أن هذا الجهاز هو صاحب التفعيل الأصلي.
 */
async function serverVerify(license: ActiveLicense): Promise<{ ok: boolean; machineToken?: string; reason?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ACTIVATION_SERVER_TOKEN) headers['Authorization'] = `Bearer ${ACTIVATION_SERVER_TOKEN}`;

    const res = await fetch(`${ACTIVATION_SERVER_URL.replace(/\/$/, '')}/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        keyId: license.keyId,
        deviceId: license.deviceId,
        machineToken: license.machineToken,
      }),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) {
      const machineToken = typeof json.machineToken === 'string' ? json.machineToken : undefined;
      return { ok: true, machineToken };
    }
    return { ok: false, reason: typeof json.reason === 'string' ? json.reason : 'unknown' };
  } catch {
    return { ok: false, reason: 'server_unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * إعادة تحقق دورية مع سيرفر التفعيل (مرة كل 24 ساعة):
 *  - يقدّم الـ Machine Token لإثبات ملكية التفعيل.
 *  - لو السيرفر رفض (إلغاء / توكن خاطئ / جهاز آخر) → يُمسح الترخيص محلياً فوراً،
 *    ويُفرَض الأمر عند أول إقلاع قادم (أو إعادة تحميل للصفحة).
 *  - لو السيرفر غير متاح → يستمر التطبيق في العمل طبيعياً (سماحية أوفلاين).
 *  - السجلات القديمة (قبل v2) تحصل على Machine Token تلقائياً عند أول تحقق ناجح.
 */
export async function reverifyLicense(license: ActiveLicense): Promise<ReverifyStatus> {
  if (!ACTIVATION_SERVER_URL) return 'offline_mode';

  // Throttle: لا تكرر التحقق أكثر من مرة كل 24 ساعة
  try {
    const last = Number(localStorage.getItem(STORAGE_KEYS.lastServerVerify) || '0');
    if (Date.now() - last < REVERIFY_INTERVAL_MS) return 'throttled';
    localStorage.setItem(STORAGE_KEYS.lastServerVerify, String(Date.now()));
  } catch {
    /* ignore storage errors */
  }

  const result = await serverVerify(license);

  if (result.ok) {
    license.lastVerifiedAt = new Date().toISOString();
    if (result.machineToken) license.machineToken = result.machineToken; // ترقية سجلات v1 القديمة
    storeLicense(license);
    return 'ok';
  }

  if (result.reason === 'server_unreachable') return 'server_unreachable';

  // رفض قاطع من السيرفر → إبطال محلي فوري
  clearLicense();
  switch (result.reason) {
    case 'revoked': return 'revoked';
    case 'bad_token': return 'bad_token';
    case 'used_on_other_device': return 'used_on_other_device';
    case 'unknown_key': return 'unknown_key';
    default: return 'unknown';
  }
}

export type StartupStatus = 'ok' | 'none' | 'invalid' | 'expired' | 'device_mismatch';

export interface StartupCheck {
  status: StartupStatus;
  license?: ActiveLicense;
}

/**
 * Verify the stored activation on app startup:
 * re-check the digital signature, expiration, and the device fingerprint.
 */
export async function verifyStoredActivation(): Promise<StartupCheck> {
  const raw = localStorage.getItem(STORAGE_KEYS.activeLicense);
  if (!raw) return { status: 'none' };

  let record: ActiveLicense;
  try {
    record = JSON.parse(raw);
  } catch {
    return { status: 'invalid' };
  }
  if (!record.key || !record.keyId) return { status: 'invalid' };

  // Re-verify the signature of the original key (protects against tampered fields)
  const verified = await parseAndVerifyKey(record.key);
  if (!verified.valid || !verified.payload) return { status: 'invalid' };

  // Cross-check stored fields against the signed payload
  const p = verified.payload;
  if (
    p.id !== record.keyId ||
    p.p !== record.plan ||
    (p.lt ? '' : p.e) !== record.expiresAt ||
    p.u !== record.maxUsers
  ) {
    return { status: 'invalid' };
  }

  // Expiration
  if (isLicenseExpired(record.expiresAt, record.lifetime)) {
    return { status: 'expired', license: record };
  }

  // Device binding
  const deviceId = await getDeviceId();
  if (record.deviceId && record.deviceId !== deviceId) {
    return { status: 'device_mismatch', license: record };
  }

  // إعادة تحقق دورية مع سيرفر التفعيل (v2) — في الخلفية ولا تعطّل الإقلاع.
  // لو رفض السيرفر الترخيص يُمسح محلياً، ويُفرَض ذلك عند أول تحميل قادم.
  void reverifyLicense(record).catch(() => undefined);

  return { status: 'ok', license: record };
}

/** Backwards-compatible helper used by App.tsx. */
export function getStoredLicense(includeExpired = false): ActiveLicense | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.activeLicense);
    if (!raw) return null;
    const license = JSON.parse(raw) as ActiveLicense;
    if (!includeExpired && isLicenseExpired(license.expiresAt, license.lifetime)) return null;
    return license;
  } catch {
    return null;
  }
}

// ============================================================
//  أدوات لوحة الماستر (تعتمد على المفتاح الخاص لدى المالك)
// ============================================================

/** Generate a signed license key. Requires the owner's private key. */
export async function generateLicenseKey(
  privateKeyJwk: JsonWebKey,
  plan: PlanType,
  shopName: string,
  issuedTo: string,
  durationDays: number,      // ignored when plan === 'lifetime'
  maxUsers: number,
  notes: string = ''
): Promise<LicenseKey> {
  const privateKey = await importPrivateKey(privateKeyJwk);

  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const now = new Date();
  const lifetime = plan === 'lifetime';
  const expiresAt = lifetime
    ? ''
    : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  const payload: KeyPayloadV2 = {
    v: 2,
    id,
    p: plan,
    s: shopName,
    u: maxUsers,
    i: now.toISOString(),
    e: expiresAt,
    lt: lifetime,
    to: issuedTo,
    n: notes,
  };

  const payloadB64 = b64urlEncodeString(JSON.stringify(payload));
  const signature = await signMessage(privateKey, `${KEY_PREFIX}.${payloadB64}`);
  const keyStr = `${KEY_PREFIX}.${payloadB64}.${signature}`;

  return {
    id,
    key: keyStr,
    plan,
    shopName,
    issuedTo,
    issuedAt: now.toISOString(),
    expiresAt,
    lifetime,
    isActive: true,
    maxUsers,
    notes,
  };
}

// ===== Master password (owner-set, hashed — nothing hardcoded) =====

export async function hasMasterPassword(): Promise<boolean> {
  return localStorage.getItem(STORAGE_KEYS.masterPasswordHash) !== null;
}

export async function setupMasterPassword(password: string): Promise<void> {
  const { salt, hash } = await hashPassword(password);
  localStorage.setItem(STORAGE_KEYS.masterPasswordHash, JSON.stringify({ salt, hash }));
}

export async function verifyMasterPassword(password: string): Promise<boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.masterPasswordHash);
    if (!raw) return false;
    const stored = JSON.parse(raw) as { salt: string; hash: string; iterations?: number };
    const ok = await verifyPasswordHash(password, stored);
    if (ok && !stored.iterations) {
      // Transparently upgrade legacy single-round hashes to PBKDF2 now that we
      // have the plaintext password in hand.
      await setupMasterPassword(password);
    }
    return ok;
  } catch {
    return false;
  }
}

export function resetMasterPassword(): void {
  localStorage.removeItem(STORAGE_KEYS.masterPasswordHash);
}

// ===== Signing key storage (owner's browser only) =====

export function getStoredSigningKey(): JsonWebKey | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.signingKey);
    if (!raw) return null;
    return JSON.parse(raw) as JsonWebKey;
  } catch {
    return null;
  }
}

export function storeSigningKey(jwk: JsonWebKey): void {
  localStorage.setItem(STORAGE_KEYS.signingKey, JSON.stringify(jwk));
}

export function clearSigningKey(): void {
  localStorage.removeItem(STORAGE_KEYS.signingKey);
}

export { generateSigningKeyPair };

// ===== Issued keys log (owner's browser only) =====

export function getStoredMasterKeys(): LicenseKey[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.masterKeysList);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function storeMasterKeys(keys: LicenseKey[]): void {
  localStorage.setItem(STORAGE_KEYS.masterKeysList, JSON.stringify(keys));
}
