// ============================================================
//  أدوات التشفير — WebCrypto (ECDSA P-256 + SHA-256)
// ============================================================

// ===== Base64url helpers (URL-safe, no padding) =====

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function strToBytes(str: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(str) as Uint8Array<ArrayBuffer>;
}

export function bytesToStr(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function b64urlEncodeString(str: string): string {
  return b64urlEncode(strToBytes(str));
}

export function b64urlDecodeString(str: string): string {
  return bytesToStr(b64urlDecode(str));
}

// ===== SHA-256 =====

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', strToBytes(input));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ===== ECDSA P-256 =====

const ECDSA_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' } as const;

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ECDSA_PARAMS, false, ['verify']);
}

export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ECDSA_PARAMS, false, ['sign']);
}

export async function generateSigningKeyPair(): Promise<{ publicKey: JsonWebKey; privateKey: JsonWebKey }> {
  const pair = await crypto.subtle.generateKey(ECDSA_PARAMS, true, ['sign', 'verify']);
  const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateKey = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey, privateKey };
}

/** Verify an ECDSA signature over a message string. */
export async function verifySignature(
  publicKey: CryptoKey,
  message: string,
  signatureB64url: string
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      b64urlDecode(signatureB64url),
      strToBytes(message)
    );
  } catch {
    return false;
  }
}

/** Sign a message string with the private key (master tool only). */
export async function signMessage(privateKey: CryptoKey, message: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    strToBytes(message)
  );
  return b64urlEncode(new Uint8Array(sig));
}

// ===== Password stretching (PBKDF2-SHA256) =====
// Used for both the master-panel password and (via utils/passwords.ts) user
// login passwords. A high iteration count makes offline brute-forcing an
// extracted hash meaningfully slower than a single unsalted SHA-256 round.

export const PBKDF2_ITERATIONS = 150_000;

export async function pbkdf2Hex(password: string, saltBytes: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', strToBytes(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two equal-length hex/base64 strings. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ===== Master password hashing (owner panel gate) =====

interface StoredPasswordHash {
  salt: string;
  hash: string;
  iterations?: number; // absent => legacy single-round SHA-256 (auto-upgraded on next successful verify)
}

/** Hash a password with a random salt + PBKDF2 stretching: returns { salt, hash, iterations }. */
export async function hashPassword(password: string): Promise<StoredPasswordHash> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = b64urlEncode(saltBytes);
  const hash = await pbkdf2Hex(password, saltBytes, PBKDF2_ITERATIONS);
  return { salt, hash, iterations: PBKDF2_ITERATIONS };
}

export async function verifyPasswordHash(
  password: string,
  stored: StoredPasswordHash
): Promise<boolean> {
  if (stored.iterations) {
    const saltBytes = b64urlDecode(stored.salt);
    const hash = await pbkdf2Hex(password, saltBytes, stored.iterations);
    return constantTimeEqual(hash, stored.hash);
  }
  
  // Legacy format: single unsalted-work-factor SHA-256 round. Still supported
  // for verification so existing master passwords keep working; callers
  // should re-hash with hashPassword() after a successful legacy verify.
  const legacyHash = await sha256Hex(`${stored.salt}::${password}`);
  if (constantTimeEqual(legacyHash, stored.hash)) {
    return true;
  }
  
  // Bug compatibility: if the hash was saved as PBKDF2 but the iterations field 
  // was lost due to a previous bug in setupMasterPassword, we try the default PBKDF2 iterations.
  try {
    const saltBytes = b64urlDecode(stored.salt);
    const pbkdf2Hash = await pbkdf2Hex(password, saltBytes, PBKDF2_ITERATIONS);
    return constantTimeEqual(pbkdf2Hash, stored.hash);
  } catch {
    return false;
  }
}
