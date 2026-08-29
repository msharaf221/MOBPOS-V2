// ============================================================
//  تكامل Google Drive — النسخ الاحتياطي السحابي
//  يستخدم Google Identity Services (OAuth 2.0 Token Client)
//  مع نطاق drive.file (لا يصل إلا للملفات التي ينشئها التطبيق)
// ============================================================

import type { BackupPayload } from './backup';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => {
            requestAccessToken: (override?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const APP_PROPERTY_KEY = 'mobpos';
const APP_PROPERTY_VALUE = 'backup';

// In-session token cache (tokens live ~1 hour)
let cachedToken: { token: string; expiresAt: number } | null = null;

// ===== Google Identity Services loader =====

let gisPromise: Promise<void> | null = null;
let tokenPromise: Promise<string | null> | null = null;

export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    const onReady = () => {
      if (window.google?.accounts?.oauth2) resolve();
      else reject(new Error('فشل تحميل مكتبة Google'));
    };
    if (existing) {
      existing.addEventListener('load', onReady);
      // already loaded?
      if (window.google?.accounts?.oauth2) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error('تعذر الاتصال بخوادم Google — تحقق من الإنترنت'));
    document.head.appendChild(script);
  });

  // A transient CDN/network failure must not poison all future connection
  // attempts for the lifetime of the renderer.
  gisPromise = promise.catch(error => {
    gisPromise = null;
    throw error;
  });
  return gisPromise;
}

// ===== Access token =====

/**
 * Request an OAuth access token.
 * @param silent when true, never disturbs the user: fails quietly instead of
 *               opening the Google popup (used by the automatic daily backup).
 */
export async function getAccessToken(clientId: string, silent: boolean): Promise<string | null> {
  if (!clientId) return null;

  // Reuse a still-valid cached token
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  // Several backup/list actions can start together. Share one OAuth request so
  // they do not open competing popups or overwrite the token cache.
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      await loadGis();
    } catch {
      return null;
    }

    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) return null;

    return new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      // Safety timeout so the app never hangs waiting for a blocked popup
      const timeoutMs = silent ? 8_000 : 120_000;
      const timer = setTimeout(() => finish(null), timeoutMs);

      try {
        const client = oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          callback: (response) => {
            clearTimeout(timer);
            if (response.access_token) {
              cachedToken = {
                token: response.access_token,
                expiresAt: Date.now() + 55 * 60 * 1000,
              };
              finish(response.access_token);
            } else {
              finish(null);
            }
          },
          error_callback: () => {
            clearTimeout(timer);
            finish(null);
          },
        });

        client.requestAccessToken({ prompt: silent ? 'none' : '' });
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    });
  })().finally(() => {
    tokenPromise = null;
  });

  return tokenPromise;
}

export function clearTokenCache(): void {
  cachedToken = null;
}

// ===== Drive REST helpers =====

async function driveFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
    if (res.status === 401) {
      clearTokenCache();
      throw new Error('انتهت صلاحية جلسة Google — أعد الاتصال');
    }
    if (!res.ok) {
      throw new Error(`خطأ من Google Drive (${res.status})`);
    }
    return res;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('انتهت مهلة الاتصال بـ Google Drive');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface DriveBackupFile {
  id: string;
  name: string;
  size: string;
  createdTime: string;
}

/** Get the signed-in user's email (for showing which account is connected). */
export async function getUserEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const info = (await res.json()) as { email?: string };
    return info.email || null;
  } catch {
    return null;
  }
}

/** List MOBPOS backups on Drive, newest first. */
export async function listDriveBackups(token: string): Promise<DriveBackupFile[]> {
  const q = encodeURIComponent(
    `appProperties has { key='${APP_PROPERTY_KEY}' and value='${APP_PROPERTY_VALUE}' } and trashed=false`
  );
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
    `&orderBy=createdTime desc&pageSize=50&fields=files(id,name,size,createdTime)`;
  const res = await driveFetch(url, token);
  const json = (await res.json()) as { files?: DriveBackupFile[] };
  return json.files || [];
}

/**
 * Upload a backup payload. If a file with the same name (same day) exists,
 * it is overwritten instead of duplicated.
 */
export async function uploadBackupToDrive(token: string, payload: BackupPayload): Promise<string> {
  const fileName = `MOBPOS-backup-${payload.exportedAt.slice(0, 10)}.json`;
  const json = JSON.stringify(payload, null, 2);

  // Same-day file already there? Update it.
  // Scope the lookup to MOBPOS-owned files. Searching by name alone could
  // overwrite an unrelated user file with the same date-based name.
  const nameQuery = encodeURIComponent(
    `name='${fileName}' and appProperties has { key='${APP_PROPERTY_KEY}' and value='${APP_PROPERTY_VALUE}' } and trashed=false`
  );
  const searchRes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${nameQuery}&fields=files(id)&pageSize=1`,
    token
  );
  const searchJson = (await searchRes.json()) as { files?: { id: string }[] };
  const existingId = searchJson.files?.[0]?.id;

  if (existingId) {
    const res = await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&fields=id,name,createdTime,size`,
      token,
      {
        method: 'PATCH',
        body: new Blob([json], { type: 'application/json' }),
      }
    );
    const file = (await res.json()) as { id: string };
    return file.id;
  }

  // Create a new file (multipart: metadata + content)
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    appProperties: { [APP_PROPERTY_KEY]: APP_PROPERTY_VALUE },
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([json], { type: 'application/json' }));

  const res = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size',
    token,
    { method: 'POST', body: form }
  );
  const file = (await res.json()) as { id: string };
  return file.id;
}

/** Keep only the newest `keep` backups on Drive; trash the rest. */
export async function pruneDriveBackups(token: string, keep: number): Promise<void> {
  try {
    const files = await listDriveBackups(token);
    const toDelete = files.slice(Math.max(1, keep));
    for (const file of toDelete) {
      await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, token, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
  } catch {
    // pruning is best-effort
  }
}

/** Download a backup file's content from Drive. */
export async function downloadDriveBackup(token: string, fileId: string): Promise<BackupPayload> {
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    token
  );
  const text = await res.text();
  return JSON.parse(text) as BackupPayload;
}

/** Delete (trash) a backup file on Drive. */
export async function deleteDriveBackup(token: string, fileId: string): Promise<void> {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, token, {
    method: 'DELETE',
  });
}
