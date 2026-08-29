// ============================================================
//  كلمات السر: تخزين مجزأ (PBKDF2 + ملح عشوائي لكل مستخدم)
//  - المستخدمون الجدد تُحفظ كلمة سرهم مجزأة من البداية
//  - الحسابات القديمة (نص عادي أو SHA-256 بملح ثابت) تُرقّى تلقائياً
//    إلى الصيغة الجديدة عند أول تسجيل دخول ناجح
// ============================================================

import { sha256Hex, pbkdf2Hex, constantTimeEqual, b64urlEncode, b64urlDecode, PBKDF2_ITERATIONS } from '../license/crypto';

const PBKDF2_PREFIX = 'pbkdf2';
// Legacy (deprecated) format: a single unsalted SHA-256 round over a fixed prefix.
const LEGACY_HASH_RE = /^[a-f0-9]{64}$/i;

/** True if `stored` looks like any supported hashed format (current or legacy). */
export function isHashedPassword(stored: string): boolean {
  const value = typeof stored === 'string' ? stored : '';
  return value.startsWith(`${PBKDF2_PREFIX}$`) || LEGACY_HASH_RE.test(value);
}

/** True if `stored` should be re-hashed with the current (strongest) format. */
export function needsRehash(stored: string): boolean {
  return !(typeof stored === 'string' && stored.startsWith(`${PBKDF2_PREFIX}$`));
}

/** Hash a password for storage using salted PBKDF2 (current format). */
export async function hashPasswordForStorage(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length < 1 || plain.length > 512) {
    throw new Error('كلمة المرور غير صالحة');
  }
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = b64urlEncode(saltBytes);
  const hash = await pbkdf2Hex(plain, saltBytes, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

/**
 * Verify a login password against a stored value, which may be:
 *  - the current format: `pbkdf2$<iterations>$<salt>$<hash>`
 *  - a legacy fixed-salt SHA-256 hash (64 hex chars)
 *  - a legacy plain-text password (e.g. the default admin account)
 */
export async function verifyLoginPassword(plain: string, stored: string): Promise<boolean> {
  if (typeof plain !== 'string' || plain.length > 512) return false;
  const value = typeof stored === 'string' ? stored : '';

  if (value.startsWith(`${PBKDF2_PREFIX}$`)) {
    const parts = value.split('$');
    const iterations = Number(parts[1]);
    const salt = parts[2] || '';
    const hash = parts[3] || '';
    // The iteration count is stored data, not an instruction from the user.
    // Bound it to prevent a crafted backup from turning login into a CPU DoS.
    if (parts.length !== 4 || !Number.isInteger(iterations) || iterations < 10_000 || iterations > 1_000_000 ||
        !/^[a-f0-9]{64}$/i.test(hash) || salt.length < 8 || salt.length > 128) return false;
    try {
      const computed = await pbkdf2Hex(plain, b64urlDecode(salt), iterations);
      return constantTimeEqual(computed, hash);
    } catch {
      return false;
    }
  }

  if (LEGACY_HASH_RE.test(value)) {
    const legacyHash = await sha256Hex(`mobpos-pw::${plain}`);
    return constantTimeEqual(legacyHash, value.toLowerCase());
  }

  // Very old plain-text record.
  return constantTimeEqual(plain, value);
}
