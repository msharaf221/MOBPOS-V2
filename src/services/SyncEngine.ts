// ============================================================
//  محرك المزامنة السحابية اللحظية (Cloud Auto Sync Engine)
//  Offline-First + Supabase Realtime + Last-Write-Wins + Outbox
// ============================================================

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { indexedDBUtils, onStoreDelta, setRemoteApplying } from '../hooks/useIndexedDB.ts';
import type { ActiveLicense } from '../license/types.ts';
import type { AppSettings } from '../types/index.ts';
import type {
  SyncConfig,
  SyncEngineState,
  SyncStateListener,
  OutboxItem,
  SyncRecordRow,
} from '../types/sync.ts';

export function isValidJwt(token?: string | null): boolean {
  if (!token) return false;
  const trimmed = token.trim();
  if (trimmed.startsWith('sbp_')) return false;
  const parts = trimmed.split('.');
  return parts.length === 3 && parts.every(p => p.length > 0);
}

function getStoredActiveLicense(): ActiveLicense | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem('mobpos_active_license');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function checkLicenseExpired(expiresAt?: string, lifetime = false): boolean {
  if (lifetime || !expiresAt) return false;
  const exp = new Date(expiresAt).getTime();
  if (Number.isNaN(exp)) return false;
  return exp < Date.now();
}

// Local storage keys
const CFG_URL = 'mobpos_sync_url';
const CFG_KEY = 'mobpos_sync_key';
const CFG_ACCESS_TOKEN = 'mobpos_sync_access_token';
const CFG_REFRESH_TOKEN = 'mobpos_sync_refresh_token';
const CFG_USER_EMAIL = 'mobpos_sync_user_email';
const CFG_TENANT = 'mobpos_sync_tenant';
const CFG_AUTO_SYNC = 'mobpos_sync_auto_enabled';
const CFG_CLIENT_ID = 'mobpos_device_client_id';

const BATCH_SIZE = 50;
const INITIAL_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 60000;
const SYNCABLE_STORES = new Set(
  Object.values(indexedDBUtils.STORES).filter(
    s =>
      s !== indexedDBUtils.STORES.backups &&
      s !== indexedDBUtils.STORES.syncOutbox &&
      s !== indexedDBUtils.STORES.syncMeta &&
      s !== indexedDBUtils.STORES.settings
  )
);

type StoreDispatcher = (storeName: string, action: { type: 'upsert' | 'delete' | 'replace'; item?: unknown; items?: unknown[]; id?: string }) => void;

class SyncEngine {
  private supabase: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private config: SyncConfig;
  private state: SyncEngineState;
  private listeners = new Set<SyncStateListener>();
  private activeLicense: ActiveLicense | null = null;
  private storeDispatcher: StoreDispatcher | null = null;

  private isDraining = false;
  private isUserTriggeredSync = false;
  private isBackgroundRetrying = false;
  private consecutiveErrors = 0;
  private backoffMs = INITIAL_BACKOFF_MS;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private debouncedSnapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAutoSnapshotTime = 0;
  private unsubscribeDelta: (() => void) | null = null;
  private initialized = false;

  private dirtySnapshotStores = new Set<string>();
  private isPushingSnapshot = false;
  private snapshotDebounceStartTime = 0;
  private readonly SNAPSHOT_DEBOUNCE_MS = 1200;
  private readonly SNAPSHOT_MAX_WAIT_MS = 3000;

  constructor() {
    this.config = this.loadConfig();
    this.state = {
      status: 'disabled',
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      pendingCount: 0,
      lastSyncedAt: null,
      errorMessage: null,
      clientId: this.getOrCreateClientId(),
      tenantId: this.resolveTenantId(),
      isConfigured: false,
      isRealtimeConnected: false,
    };
  }

  // ------------------------------------------------------------
  // Configuration & Initialization
  // ------------------------------------------------------------

  public getOrCreateClientId(): string {
    if (typeof localStorage === 'undefined') return 'server-env';
    let id = localStorage.getItem(CFG_CLIENT_ID);
    if (!id) {
      id = 'client_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36);
      localStorage.setItem(CFG_CLIENT_ID, id);
    }
    return id;
  }

  public resolveTenantId(): string {
    if (typeof localStorage !== 'undefined') {
      const custom = (localStorage.getItem(CFG_TENANT) || '').trim();
      if (custom) return custom;
    }
    const stored = this.activeLicense || getStoredActiveLicense();
    if (stored?.keyId) return stored.keyId;
    return 'default-tenant';
  }

  public loadConfig(): SyncConfig {
    if (typeof localStorage === 'undefined') {
      return { url: '', anonKey: '', autoSyncEnabled: true };
    }
    const rawToken = (localStorage.getItem(CFG_ACCESS_TOKEN) || '').trim();
    // Auto-clean non-JWT access tokens (such as Supabase Personal Access Tokens sbp_...)
    const validToken = isValidJwt(rawToken) ? rawToken : undefined;
    if (rawToken && !validToken) {
      console.warn('[SyncEngine] Cleared non-JWT access token from storage');
      localStorage.removeItem(CFG_ACCESS_TOKEN);
    }

    return {
      url: (localStorage.getItem(CFG_URL) || '').trim().replace(/\/+$/, ''),
      anonKey: (localStorage.getItem(CFG_KEY) || '').trim().replace(/^['"]|['"]$/g, ''),
      accessToken: validToken,
      refreshToken: (localStorage.getItem(CFG_REFRESH_TOKEN) || '').trim() || undefined,
      userEmail: (localStorage.getItem(CFG_USER_EMAIL) || '').trim() || undefined,
      tenantId: this.resolveTenantId(),
      autoSyncEnabled: localStorage.getItem(CFG_AUTO_SYNC) !== 'false',
    };
  }

  public saveConfig(cfg: Partial<SyncConfig>): void {
    if (typeof localStorage === 'undefined') return;
    if (cfg.url !== undefined) localStorage.setItem(CFG_URL, cfg.url.trim().replace(/\/+$/, ''));
    if (cfg.anonKey !== undefined) localStorage.setItem(CFG_KEY, cfg.anonKey.trim().replace(/^['"]|['"]$/g, ''));
    if (cfg.accessToken !== undefined) {
      const clean = cfg.accessToken.trim();
      if (isValidJwt(clean)) {
        localStorage.setItem(CFG_ACCESS_TOKEN, clean);
      } else {
        localStorage.removeItem(CFG_ACCESS_TOKEN);
      }
    }
    if (cfg.refreshToken !== undefined) localStorage.setItem(CFG_REFRESH_TOKEN, cfg.refreshToken.trim());
    if (cfg.userEmail !== undefined) localStorage.setItem(CFG_USER_EMAIL, cfg.userEmail.trim());
    if (cfg.tenantId !== undefined) localStorage.setItem(CFG_TENANT, cfg.tenantId.trim());
    if (cfg.autoSyncEnabled !== undefined) localStorage.setItem(CFG_AUTO_SYNC, cfg.autoSyncEnabled ? 'true' : 'false');

    this.config = this.loadConfig();
    this.state.tenantId = this.resolveTenantId();
    this.reconnect();

    // Dual-write to persistent IndexedDB so credentials can NEVER be wiped!
    void this.persistCredentialsToIndexedDB(this.config);
  }

  /**
   * Persists Supabase configuration into IndexedDB ('settings' and 'syncMeta' stores)
   * as a permanent backup against localStorage clearing or Electron cache flushes.
   */
  public async persistCredentialsToIndexedDB(cfg: SyncConfig): Promise<void> {
    try {
      if (cfg.url) await indexedDBUtils.put(indexedDBUtils.STORES.syncMeta, { id: 'supabase_url', value: cfg.url });
      if (cfg.anonKey) await indexedDBUtils.put(indexedDBUtils.STORES.syncMeta, { id: 'supabase_anon_key', value: cfg.anonKey });
      if (cfg.tenantId) await indexedDBUtils.put(indexedDBUtils.STORES.syncMeta, { id: 'supabase_tenant_id', value: cfg.tenantId });

      const allSettings = await indexedDBUtils.getAll<AppSettings & { id: string }>(indexedDBUtils.STORES.settings);
      if (allSettings.length > 0) {
        const cur = allSettings[0];
        const updated: AppSettings & { id: string } = {
          ...cur,
          supabaseUrl: cfg.url || cur.supabaseUrl,
          supabaseAnonKey: cfg.anonKey || cur.supabaseAnonKey,
          supabaseTenantId: cfg.tenantId || cur.supabaseTenantId,
          cloudSyncEnabled: cfg.autoSyncEnabled,
          cloudAutoSync: cfg.autoSyncEnabled,
        };
        await indexedDBUtils.put(indexedDBUtils.STORES.settings, updated);
      }
    } catch (e) {
      console.warn('[SyncEngine] Failed to persist credentials to IndexedDB:', e);
    }
  }

  /**
   * Self-Healing Storage:
   * Rehydrates Supabase connection credentials from persistent IndexedDB
   * (settings store / syncMeta store) if localStorage was cleared or wiped.
   */
  public async selfHealFromIndexedDB(): Promise<boolean> {
    if (typeof localStorage === 'undefined') return false;

    try {
      let url = localStorage.getItem(CFG_URL) || '';
      let key = localStorage.getItem(CFG_KEY) || '';
      let tenant = localStorage.getItem(CFG_TENANT) || '';
      let restored = false;

      // 1. Check persistent settings store in IndexedDB
      const allSettings = await indexedDBUtils.getAll<AppSettings & { id: string }>(indexedDBUtils.STORES.settings);
      const appSettings = allSettings[0];
      if (appSettings) {
        if (!url && appSettings.supabaseUrl) {
          localStorage.setItem(CFG_URL, appSettings.supabaseUrl);
          url = appSettings.supabaseUrl;
          restored = true;
        }
        if (!key && appSettings.supabaseAnonKey) {
          localStorage.setItem(CFG_KEY, appSettings.supabaseAnonKey);
          key = appSettings.supabaseAnonKey;
          restored = true;
        }
        if (!tenant && appSettings.supabaseTenantId) {
          localStorage.setItem(CFG_TENANT, appSettings.supabaseTenantId);
          tenant = appSettings.supabaseTenantId;
          restored = true;
        }
      }

      // 2. Check syncMeta store as secondary fallback
      const meta = await indexedDBUtils.getAll<{ id: string; value: string }>(indexedDBUtils.STORES.syncMeta);
      const metaMap = new Map(meta.map(m => [m.id, m.value]));
      if (!url && metaMap.get('supabase_url')) {
        localStorage.setItem(CFG_URL, metaMap.get('supabase_url')!);
        restored = true;
      }
      if (!key && metaMap.get('supabase_anon_key')) {
        localStorage.setItem(CFG_KEY, metaMap.get('supabase_anon_key')!);
        restored = true;
      }
      if (!tenant && metaMap.get('supabase_tenant_id')) {
        localStorage.setItem(CFG_TENANT, metaMap.get('supabase_tenant_id')!);
        restored = true;
      }

      if (restored) {
        console.info('[SyncEngine] Self-healing activated: restored Supabase credentials from persistent IndexedDB ✅');
        this.config = this.loadConfig();
        this.state.tenantId = this.resolveTenantId();
        this.reconnect();
        this.emitState();
        return true;
      }
    } catch (err) {
      console.warn('[SyncEngine] Self-healing check failed:', err);
    }
    return false;
  }

  public setLicense(license: ActiveLicense | null): void {
    this.activeLicense = license;
    this.state.tenantId = this.resolveTenantId();
    this.evaluateStatus();
  }

  public setStoreDispatcher(dispatcher: StoreDispatcher): void {
    this.storeDispatcher = dispatcher;
  }

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Listen to local delta mutations in useIndexedDB
    this.unsubscribeDelta = onStoreDelta((storeName, delta, isRemote) => {
      this.handleLocalStoreDelta(storeName, delta, isRemote);
    });

    // Listen to network changes
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }

    // Load initial outbox count and last synced time
    void this.refreshOutboxCount();
    void this.loadLastSyncedTime();

    // Reconnect client & realtime
    this.reconnect();

    // Self-Healing Storage: Restore credentials from IndexedDB if localStorage was wiped
    void this.selfHealFromIndexedDB();

    // Zero-Touch Background Worker:
    // Runs silent check every 30s to drain pending records and auto-push fresh snapshot
    this.heartbeatTimer = setInterval(() => {
      if (this.state.isOnline && this.state.status !== 'disabled') {
        if (this.state.pendingCount > 0 && !this.isDraining && this.consecutiveErrors < 5) {
          void this.triggerDrain(false);
        }

        // Auto-refresh snapshot every 3 minutes silently so mobpos_stores is never stale
        if (Date.now() - this.lastAutoSnapshotTime > 180000 && !this.isPushingSnapshot) {
          void this.autoPushSnapshotInBackground();
        }
      }
    }, 30000);
  }

  public destroy(): void {
    if (this.unsubscribeDelta) {
      this.unsubscribeDelta();
      this.unsubscribeDelta = null;
    }
    if (this.channel) {
      void this.channel.unsubscribe();
      this.channel = null;
    }
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    if (this.debouncedSnapshotTimer) {
      clearTimeout(this.debouncedSnapshotTimer);
      this.debouncedSnapshotTimer = null;
    }
    this.dirtySnapshotStores.clear();
    this.snapshotDebounceStartTime = 0;
    this.isPushingSnapshot = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.listeners.clear();
    this.initialized = false;
  }

  // ------------------------------------------------------------
  // State & Event Subscription
  // ------------------------------------------------------------

  public getState(): SyncEngineState {
    return { ...this.state };
  }

  public subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitState(): void {
    const currentState = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(currentState);
      } catch (err) {
        console.error('[SyncEngine] Listener error:', err);
      }
    }
  }

  private isLicenseValid(): boolean {
    if (!this.activeLicense) {
      const stored = getStoredActiveLicense();
      if (!stored) return true; // Allow sync when user provides custom Supabase credentials without a local license file
      return !checkLicenseExpired(stored.expiresAt, stored.lifetime);
    }
    return !checkLicenseExpired(this.activeLicense.expiresAt, this.activeLicense.lifetime);
  }

  public formatFriendlyErrorMessage(rawMsg: string): string {
    const lower = rawMsg.toLowerCase();
    if (lower.includes('does not exist') || lower.includes('42p01') || lower.includes('relation "public.mobpos_')) {
      return 'جداول المزامنة غير موجودة في قاعدة بيانات Supabase. اضغط على أيقونة الإعدادات وانسخ كود SQL لتشغيله في Supabase SQL Editor.';
    }
    if (lower.includes('row-level security') || lower.includes('rls') || lower.includes('permission denied')) {
      return 'صلاحيات المزامنة مقيدة (RLS). يُرجى تشغيل كود SQL المحدث من الإعدادات لفتح الصلاحيات.';
    }
    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('econnrefused') || lower.includes('abort')) {
      return 'تعذر الاتصال بخادم Supabase. تحقق من اتصال الإنترنت أو صحة الرابط.';
    }
    if (lower.includes('invalid api key') || lower.includes('apikey') || lower.includes('no api key')) {
      return 'مفتاح Supabase Anon Key غير صالح. يُرجى مراجعته في الإعدادات.';
    }
    if (lower.includes('expected 3 parts in jwt') || lower.includes('invalid jwt') || lower.includes('jwt expired') || lower.includes('pgrst301')) {
      return 'انتهت صلاحية جلسة الدخول. جرى التبديل تلقائياً للعمل عبر مفتاح Anon.';
    }
    return rawMsg;
  }

  private evaluateStatus(): void {
    const isConfigured = Boolean(
      this.config.url &&
      this.config.anonKey
    );
    this.state.isConfigured = isConfigured;

    if (!this.config.autoSyncEnabled || !isConfigured || !this.isLicenseValid()) {
      this.state.status = 'disabled';
    } else if (!this.state.isOnline) {
      this.state.status = 'offline';
    } else if (this.isDraining && (this.isUserTriggeredSync || !this.isBackgroundRetrying)) {
      this.state.status = 'syncing';
    } else if (this.state.errorMessage) {
      this.state.status = 'error';
    } else if (this.isDraining) {
      this.state.status = 'syncing';
    } else {
      this.state.status = 'synced';
    }
    this.emitState();
  }

  private handleOnline = (): void => {
    this.state.isOnline = true;
    this.consecutiveErrors = 0;
    this.isBackgroundRetrying = false;
    this.backoffMs = INITIAL_BACKOFF_MS;
    this.evaluateStatus();
    void this.triggerDrain(false);
    this.setupRealtimeSubscription();
  };

  private handleOffline = (): void => {
    this.state.isOnline = false;
    this.state.isRealtimeConnected = false;
    this.evaluateStatus();
  };

  // ------------------------------------------------------------
  // Client Management & Supabase Auth
  // ------------------------------------------------------------

  public reconnect(): void {
    if (this.channel) {
      void this.channel.unsubscribe();
      this.channel = null;
    }

    if (!this.config.url || !this.config.anonKey) {
      this.supabase = null;
      this.state.isRealtimeConnected = false;
      this.evaluateStatus();
      return;
    }

    try {
      const validToken = isValidJwt(this.config.accessToken) ? this.config.accessToken!.trim() : undefined;

      this.supabase = createClient(this.config.url, this.config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });

      // If we have an existing session token, configure it via auth.setSession
      if (validToken && this.config.refreshToken) {
        void this.supabase.auth.setSession({
          access_token: validToken,
          refresh_token: this.config.refreshToken,
        }).catch(err => {
          console.warn('[SyncEngine] setSession failed, resetting to clean anon:', err);
          this.config.accessToken = undefined;
          this.config.refreshToken = undefined;
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(CFG_ACCESS_TOKEN);
            localStorage.removeItem(CFG_REFRESH_TOKEN);
          }
        });
      }

      this.setupRealtimeSubscription();
      this.evaluateStatus();
      if (this.state.isOnline) {
        void this.triggerDrain(false);
      }
    } catch (err) {
      console.error('[SyncEngine] Client init failed:', err);
      this.state.errorMessage = err instanceof Error ? this.formatFriendlyErrorMessage(err.message) : 'فشل إعداد عميل Supabase';
      this.evaluateStatus();
    }
  }

  public async signInWithPassword(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.config.url || !this.config.anonKey) {
      return { ok: false, error: 'أدخل رابط ومفتاح Supabase أولاً' };
    }
    const cleanEmail = email.trim();
    try {
      if (!this.supabase) {
        this.supabase = createClient(this.config.url, this.config.anonKey);
      }
      const { data, error } = await this.supabase.auth.signInWithPassword({ email: cleanEmail, password });
      let session = data?.session;
      let user = data?.user;
      let errorMsg = error?.message;
      
      // Auto Sign-Up if user doesn't exist yet in the Supabase project
      if (error && (error.message.toLowerCase().includes('invalid login credentials') || error.message.toLowerCase().includes('user not found'))) {
        const signUpRes = await this.supabase.auth.signUp({ email: cleanEmail, password });
        if (!signUpRes.error && signUpRes.data?.session) {
          session = signUpRes.data.session;
          user = signUpRes.data.user;
          errorMsg = undefined;
        } else if (!signUpRes.error && signUpRes.data?.user && !signUpRes.data?.session) {
          return {
            ok: false,
            error: 'تم إنشاء المستخدم في Supabase لكن يتطلب تأكيد البريد الإلكتروني. يُرجى مراجعة البريد أو إيقاف خيار "Confirm email" من إعدادات Supabase Auth.',
          };
        } else if (signUpRes.error) {
          errorMsg = signUpRes.error.message;
        }
      }

      if (!session || errorMsg) {
        return { ok: false, error: errorMsg || 'فشل تسجيل الدخول' };
      }
      this.saveConfig({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        userEmail: user?.email || cleanEmail,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'حدث خطأ أثناء تسجيل الدخول' };
    }
  }

  public async signOut(): Promise<void> {
    if (this.supabase) {
      try {
        await this.supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
    this.saveConfig({
      accessToken: '',
      refreshToken: '',
      userEmail: '',
    });
  }

  // ------------------------------------------------------------
  // Outbox Queue Management (IndexedDB 'syncOutbox')
  // ------------------------------------------------------------

  private handleLocalStoreDelta(
    storeName: string,
    delta: { addedOrChanged: { id: string; [key: string]: unknown }[]; removedIds: string[] },
    isRemote?: boolean
  ): void {
    // If this mutation originated from the remote sync engine, DO NOT re-queue it!
    if (isRemote) return;
    if (!SYNCABLE_STORES.has(storeName)) return;

    void this.queueDeltas(storeName, delta);

    // Schedule fast background snapshot push for the modified store so mobpos_stores is kept fresh automatically!
    this.scheduleDebouncedSnapshot(storeName, this.SNAPSHOT_DEBOUNCE_MS);
  }

  /**
   * Schedules a fast debounced snapshot push for modified stores in the background.
   * Triggered automatically with every change (sales, inventory, safes, etc.) so
   * phone applications get the update near-instantaneously without manual snapshot clicks.
   */
  public scheduleDebouncedSnapshot(storeName?: string, delayMs = this.SNAPSHOT_DEBOUNCE_MS): void {
    if (!this.config.autoSyncEnabled || !this.supabase || !this.state.isOnline) return;

    if (storeName && SYNCABLE_STORES.has(storeName)) {
      this.dirtySnapshotStores.add(storeName);
    }

    const now = Date.now();
    if (!this.snapshotDebounceStartTime) {
      this.snapshotDebounceStartTime = now;
    }

    // If max wait exceeded, trigger immediately rather than postponing indefinitely
    const timeSinceFirst = now - this.snapshotDebounceStartTime;
    if (timeSinceFirst >= this.SNAPSHOT_MAX_WAIT_MS) {
      if (this.debouncedSnapshotTimer) {
        clearTimeout(this.debouncedSnapshotTimer);
        this.debouncedSnapshotTimer = null;
      }
      this.snapshotDebounceStartTime = 0;
      void this.autoPushSnapshotInBackground();
      return;
    }

    if (this.debouncedSnapshotTimer) {
      clearTimeout(this.debouncedSnapshotTimer);
    }

    this.debouncedSnapshotTimer = setTimeout(() => {
      this.debouncedSnapshotTimer = null;
      this.snapshotDebounceStartTime = 0;
      void this.autoPushSnapshotInBackground();
    }, delayMs);
  }

  private async autoPushSnapshotInBackground(): Promise<void> {
    if (!this.supabase || !this.state.isOnline || !this.config.autoSyncEnabled) {
      return;
    }

    // If a snapshot push is already in progress, retry shortly so we don't drop dirty stores
    if (this.isPushingSnapshot) {
      this.scheduleDebouncedSnapshot(undefined, 500);
      return;
    }

    const storesToPush = Array.from(this.dirtySnapshotStores);
    this.dirtySnapshotStores.clear();

    // If no specific dirty stores tracked (e.g. periodic heartbeat), push full stores
    if (storesToPush.length === 0) {
      if (Date.now() - this.lastAutoSnapshotTime > 180000) {
        try {
          this.isPushingSnapshot = true;
          console.info('[SyncEngine] Background Heartbeat: pushing full stores to mobpos_stores...');
          await this.pushAllSnapshots();
          this.lastAutoSnapshotTime = Date.now();
          console.info('[SyncEngine] Background Heartbeat snapshot completed successfully ✅');
        } catch (err) {
          console.warn('[SyncEngine] Background Heartbeat snapshot notice:', err);
        } finally {
          this.isPushingSnapshot = false;
        }
      }
      return;
    }

    try {
      this.isPushingSnapshot = true;
      console.info(`[SyncEngine] Fast Auto-Snapshot: pushing ${storesToPush.length} dirty store(s) [${storesToPush.join(', ')}] to mobpos_stores...`);
      const pushedCount = await this.pushStoreSnapshots(storesToPush);
      this.lastAutoSnapshotTime = Date.now();
      console.info(`[SyncEngine] Fast Auto-Snapshot completed successfully (${pushedCount} stores) ✅`);
    } catch (err) {
      console.warn('[SyncEngine] Fast Auto-Snapshot non-blocking notice:', err);
      // Re-add failed stores to retry on next cycle
      for (const s of storesToPush) {
        this.dirtySnapshotStores.add(s);
      }
    } finally {
      this.isPushingSnapshot = false;
      // If new stores became dirty while pushing, schedule another quick push
      if (this.dirtySnapshotStores.size > 0) {
        this.scheduleDebouncedSnapshot(undefined, 500);
      }
    }
  }

  private async queueDeltas(
    storeName: string,
    delta: { addedOrChanged: { id: string; [key: string]: unknown }[]; removedIds: string[] }
  ): Promise<void> {
    const tenantId = this.state.tenantId;
    const clientId = this.state.clientId;
    const nowIso = new Date().toISOString();

    const outboxItems: OutboxItem[] = [];

    // 1. Process added/changed items
    for (const item of delta.addedOrChanged) {
      if (!item || typeof item.id !== 'string') continue;
      // Stamp updated_at on the item if missing
      const recordWithTimestamp = {
        ...item,
        updated_at: item.updated_at || nowIso,
      };

      outboxItems.push({
        id: `outbox_${storeName}_${item.id}`,
        tenantId,
        store: storeName,
        recordId: item.id,
        action: 'upsert',
        data: recordWithTimestamp,
        clientUpdatedAt: String(recordWithTimestamp.updated_at),
        clientId,
        retryCount: 0,
        createdAt: nowIso,
      });
    }

    // 2. Process removed items (soft delete tombstone)
    for (const id of delta.removedIds) {
      if (!id) continue;
      outboxItems.push({
        id: `outbox_${storeName}_${id}`,
        tenantId,
        store: storeName,
        recordId: id,
        action: 'delete',
        clientUpdatedAt: nowIso,
        clientId,
        retryCount: 0,
        createdAt: nowIso,
      });
    }

    if (outboxItems.length === 0) return;

    try {
      // Coalescing in IndexedDB: putMany will overwrite any existing outbox task for the same item ID!
      await indexedDBUtils.putMany<OutboxItem>(indexedDBUtils.STORES.syncOutbox, outboxItems);
      await this.refreshOutboxCount();

      // Trigger background drain if online
      if (this.state.isOnline && this.state.status !== 'disabled') {
        this.consecutiveErrors = 0;
        void this.triggerDrain(false);
      }
    } catch (err) {
      console.error('[SyncEngine] Failed to save to outbox:', err);
    }
  }

  public async refreshOutboxCount(): Promise<number> {
    try {
      const items = await indexedDBUtils.getAll<OutboxItem>(indexedDBUtils.STORES.syncOutbox);
      this.state.pendingCount = items.length;
      this.evaluateStatus();
      return items.length;
    } catch {
      return 0;
    }
  }

  private async loadLastSyncedTime(): Promise<void> {
    try {
      const meta = await indexedDBUtils.getAll<{ id: string; value: string }>(indexedDBUtils.STORES.syncMeta);
      const row = meta.find(m => m.id === 'last_synced_at');
      if (row?.value) {
        this.state.lastSyncedAt = new Date(row.value);
      }
    } catch {
      // ignore
    }
  }

  private async saveLastSyncedTime(date: Date): Promise<void> {
    this.state.lastSyncedAt = date;
    try {
      await indexedDBUtils.put(indexedDBUtils.STORES.syncMeta, {
        id: 'last_synced_at',
        value: date.toISOString(),
      });
    } catch {
      // ignore
    }
  }

  // ------------------------------------------------------------
  // Outbox Drainage Worker (Push to Supabase)
  // ------------------------------------------------------------

  public async drainOutboxInternal(): Promise<void> {
    while (true) {
      const items = await indexedDBUtils.getAll<OutboxItem>(indexedDBUtils.STORES.syncOutbox);
      if (items.length === 0) {
        break;
      }

      const batch = items.slice(0, BATCH_SIZE);
      const rows: SyncRecordRow[] = batch.map(it => ({
        tenant_id: it.tenantId,
        store: it.store,
        record_id: it.recordId,
        data: it.action === 'upsert' ? (it.data || {}) : {},
        version: 1,
        client_id: it.clientId,
        updated_at: it.clientUpdatedAt,
        deleted_at: it.action === 'delete' ? it.clientUpdatedAt : null,
      }));

      if (!this.supabase) throw new Error('عميل Supabase غير مهيأ');
      const { error } = await this.supabase
        .from('mobpos_records')
        .upsert(rows, { onConflict: 'tenant_id,store,record_id' });

      if (error) {
        throw new Error(error.message);
      }

      // Successfully uploaded batch: remove from IndexedDB outbox
      for (const it of batch) {
        await indexedDBUtils.remove(indexedDBUtils.STORES.syncOutbox, it.id);
      }

      this.state.pendingCount = items.length - batch.length;
      this.emitState();
    }
  }

  public async triggerDrain(isUserTriggered = false): Promise<void> {
    if (this.isDraining) return;
    if (!this.state.isOnline || !this.supabase) {
      this.evaluateStatus();
      return;
    }
    if (!this.config.autoSyncEnabled || !this.isLicenseValid()) {
      this.evaluateStatus();
      return;
    }

    if (isUserTriggered) {
      this.isUserTriggeredSync = true;
      this.isBackgroundRetrying = false;
      this.consecutiveErrors = 0;
      this.state.errorMessage = null;
      if (this.drainTimer) {
        clearTimeout(this.drainTimer);
        this.drainTimer = null;
      }
    }

    this.isDraining = true;
    this.evaluateStatus();

    try {
      await this.drainOutboxInternal();

      // Successfully drained
      this.state.errorMessage = null;
      this.consecutiveErrors = 0;
      this.isBackgroundRetrying = false;
      this.backoffMs = INITIAL_BACKOFF_MS;
      await this.saveLastSyncedTime(new Date());

      // If any stores are still dirty and no snapshot timer is pending, flush snapshot immediately
      if (this.dirtySnapshotStores.size > 0 && !this.debouncedSnapshotTimer && !this.isPushingSnapshot) {
        void this.autoPushSnapshotInBackground();
      }
    } catch (err) {
      console.warn('[SyncEngine] Drain failed, backing off:', err);
      const rawMsg = err instanceof Error ? err.message : 'فشل رفع البيانات للسحابة';

      // Auto-recovery: If JWT was malformed or expired
      if (
        rawMsg.includes('Expected 3 parts in JWT') ||
        rawMsg.includes('invalid JWT') ||
        rawMsg.includes('JWT expired') ||
        rawMsg.includes('PGRST301')
      ) {
        console.warn('[SyncEngine] Malformed or expired JWT detected, purging token and switching to anon key');
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(CFG_ACCESS_TOKEN);
          localStorage.removeItem(CFG_REFRESH_TOKEN);
        }
        this.config.accessToken = undefined;
        this.config.refreshToken = undefined;
        this.state.errorMessage = null;
        this.reconnect();
        return;
      }

      this.consecutiveErrors++;
      this.isBackgroundRetrying = true;
      this.state.errorMessage = this.formatFriendlyErrorMessage(rawMsg);

      // Schedule exponential retry (max 5 consecutive automatic bursts)
      if (this.drainTimer) clearTimeout(this.drainTimer);
      if (this.consecutiveErrors < 5) {
        this.drainTimer = setTimeout(() => {
          this.drainTimer = null;
          void this.triggerDrain(false);
        }, this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 1.5, MAX_BACKOFF_MS);
      }
    } finally {
      this.isDraining = false;
      this.isUserTriggeredSync = false;
      await this.refreshOutboxCount();
      this.evaluateStatus();
    }
  }

  // ------------------------------------------------------------
  // Supabase Realtime Subscription (Incoming Live Updates)
  // ------------------------------------------------------------

  private setupRealtimeSubscription(): void {
    if (!this.supabase || !this.state.isOnline || !this.config.autoSyncEnabled || !this.isLicenseValid()) {
      return;
    }

    const tenantId = this.state.tenantId;
    if (this.channel) {
      void this.channel.unsubscribe();
      this.channel = null;
    }

    try {
      this.channel = this.supabase
        .channel(`mobpos-sync:${tenantId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'mobpos_records',
            filter: `tenant_id=eq.${tenantId}`,
          },
          (payload) => {
            const row = (payload.new || payload.old) as SyncRecordRow;
            if (row) {
              void this.handleIncomingRemoteRow(row);
            }
          }
        )
        .subscribe((status) => {
          this.state.isRealtimeConnected = status === 'SUBSCRIBED';
          this.emitState();
        });
    } catch (err) {
      console.warn('[SyncEngine] Realtime subscribe error:', err);
      this.state.isRealtimeConnected = false;
    }
  }

  private async handleIncomingRemoteRow(row: SyncRecordRow): Promise<void> {
    // 1. Echo suppression: Ignore changes made by this device
    if (row.client_id === this.state.clientId) return;
    if (!SYNCABLE_STORES.has(row.store)) return;

    try {
      // 2. Conflict Resolution: Last-Write-Wins (LWW)
      const existing = await this.getLocalRecord(row.store, row.record_id);
      if (existing) {
        const localUpdated = (existing.updated_at as string) || (existing.createdAt as string);
        if (localUpdated && row.updated_at) {
          const localTime = new Date(localUpdated).getTime();
          const remoteTime = new Date(row.updated_at).getTime();
          // If local record is newer, local wins
          if (localTime > remoteTime) {
            return;
          }
        }
      }

      // 3. Apply change locally with suppression flag
      setRemoteApplying(true);
      try {
        if (row.deleted_at) {
          // Soft delete: remove from IndexedDB and React state
          await indexedDBUtils.remove(row.store, row.record_id);
          if (this.storeDispatcher) {
            this.storeDispatcher(row.store, { type: 'delete', id: row.record_id });
          }
        } else {
          // Upsert: save to IndexedDB and update React state
          const recordToSave = {
            ...row.data,
            id: row.record_id,
            updated_at: row.updated_at,
          };
          await indexedDBUtils.put(row.store, recordToSave);
          if (this.storeDispatcher) {
            this.storeDispatcher(row.store, { type: 'upsert', item: recordToSave });
          }
        }
        await this.saveLastSyncedTime(new Date());
      } finally {
        setRemoteApplying(false);
      }
    } catch (err) {
      console.error('[SyncEngine] Error applying remote change:', err);
    }
  }

  private async getLocalRecord(storeName: string, id: string): Promise<Record<string, unknown> | null> {
    try {
      const records = await indexedDBUtils.getAll<{ id: string; [key: string]: unknown }>(storeName);
      return records.find(r => r.id === id) || null;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------
  // Reconnect Catch-Up / Reconciliation
  // ------------------------------------------------------------

  public async pullCatchUp(): Promise<number> {
    if (!this.supabase || !this.state.isOnline) return 0;
    const tenantId = this.state.tenantId;

    let query = this.supabase
      .from('mobpos_records')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: true })
      .limit(500);

    if (this.state.lastSyncedAt) {
      query = query.gt('updated_at', this.state.lastSyncedAt.toISOString());
    }

    const { data, error } = await query;
    if (error || !data) return 0;

    let appliedCount = 0;
    for (const row of data as SyncRecordRow[]) {
      await this.handleIncomingRemoteRow(row);
      appliedCount++;
    }

    if (data.length > 0) {
      const latest = (data[data.length - 1] as SyncRecordRow).updated_at;
      if (latest) await this.saveLastSyncedTime(new Date(latest));
    }

    return appliedCount;
  }

  // ------------------------------------------------------------
  // Full Snapshot Operations (mobpos_stores)
  // ------------------------------------------------------------

  /**
   * Pushes specific store snapshots to mobpos_stores table in parallel.
   * Blazingly fast (~150-300ms) because it only uploads the modified stores.
   */
  public async pushStoreSnapshots(stores: string[]): Promise<number> {
    if (!this.supabase) throw new Error('عميل Supabase غير مهيأ');
    if (!this.state.isOnline) throw new Error('لا يوجد اتصال بالإنترنت');
    await indexedDBUtils.flushPendingWrites();

    const tenantId = this.state.tenantId;
    const uniqueStores = Array.from(new Set(stores.filter(s => SYNCABLE_STORES.has(s))));
    if (uniqueStores.length === 0) return 0;

    const results = await Promise.allSettled(
      uniqueStores.map(async (store) => {
        const rawData = await indexedDBUtils.getAll(store);
        const data = Array.isArray(rawData) ? rawData : [];

        const { error } = await this.supabase!
          .from('mobpos_stores')
          .upsert(
            {
              tenant_id: tenantId,
              store,
              data,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_id,store' }
          );

        if (error) {
          throw new Error(`فشل رفع لقطة "${store}": ${this.formatFriendlyErrorMessage(error.message)}`);
        }
        return store;
      })
    );

    let successCount = 0;
    const failedStores: string[] = [];

    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        successCount++;
      } else {
        const s = uniqueStores[idx];
        failedStores.push(s);
        console.warn(`[SyncEngine] Auto snapshot failed for "${s}":`, res.reason);
      }
    });

    if (successCount > 0) {
      await this.saveLastSyncedTime(new Date());
    }

    if (failedStores.length > 0 && successCount === 0) {
      throw new Error(`فشل رفع لقطات: ${failedStores.join(', ')}`);
    }

    return successCount;
  }

  /** Push full store snapshots to mobpos_stores table */
  public async pushAllSnapshots(): Promise<number> {
    if (!this.supabase) throw new Error('عميل Supabase غير مهيأ');
    if (!this.state.isOnline) throw new Error('لا يوجد اتصال بالإنترنت');
    await indexedDBUtils.flushPendingWrites();

    const tenantId = this.state.tenantId;
    let count = 0;

    // Prioritize essential business stores
    const CORE_STORES = [
      'users',
      'categories',
      'inventory',
      'imeiUnits',
      'sales',
      'safes',
      'transactions',
      'customers',
      'maintenance',
      'suppliers',
      'purchases',
    ];

    const allStores = Array.from(SYNCABLE_STORES);
    const sortedStores = [
      ...CORE_STORES.filter(s => SYNCABLE_STORES.has(s)),
      ...allStores.filter(s => !CORE_STORES.includes(s)),
    ];

    this.isPushingSnapshot = true;
    try {
      const CHUNK_SIZE = 4;
      for (let i = 0; i < sortedStores.length; i += CHUNK_SIZE) {
        const chunk = sortedStores.slice(i, i + CHUNK_SIZE);
        const results = await Promise.allSettled(
          chunk.map(async (store) => {
            const rawData = await indexedDBUtils.getAll(store);
            const data = Array.isArray(rawData) ? rawData : [];

            const { error } = await this.supabase!
              .from('mobpos_stores')
              .upsert(
                {
                  tenant_id: tenantId,
                  store,
                  data,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'tenant_id,store' }
              );

            if (error) {
              if (CORE_STORES.includes(store)) {
                throw new Error(`فشل رفع لقطة "${store}": ${this.formatFriendlyErrorMessage(error.message)}`);
              } else {
                console.warn(`[SyncEngine] Non-core store snapshot notice for "${store}":`, error.message);
                return null;
              }
            }
            return store;
          })
        );

        for (const res of results) {
          if (res.status === 'fulfilled' && res.value) {
            count++;
          } else if (res.status === 'rejected') {
            throw res.reason;
          }
        }
      }

      await this.saveLastSyncedTime(new Date());
      return count;
    } finally {
      this.isPushingSnapshot = false;
    }
  }

  /**
   * Comprehensive manual sync:
   * Drains all pending delta records, pulls latest remote changes, and uploads a fresh snapshot to mobpos_stores.
   */
  public async syncNow(): Promise<{
    outboxDrained: boolean;
    snapshotPushed: boolean;
    catchUpCount: number;
    error?: string;
  }> {
    if (!this.config.url || !this.config.anonKey) {
      return { outboxDrained: false, snapshotPushed: false, catchUpCount: 0, error: 'أدخل رابط ومفتاح Supabase أولاً' };
    }
    if (!this.state.isOnline) {
      return { outboxDrained: false, snapshotPushed: false, catchUpCount: 0, error: 'لا يوجد اتصال بالإنترنت' };
    }

    this.consecutiveErrors = 0;
    this.isBackgroundRetrying = false;
    this.state.errorMessage = null;
    this.isUserTriggeredSync = true;
    this.isDraining = true;
    this.evaluateStatus();

    let outboxDrained = false;
    let snapshotPushed = false;
    let catchUpCount = 0;
    let errorMsg: string | undefined;

    try {
      // 1. Drain pending deltas from outbox
      await this.drainOutboxInternal();
      outboxDrained = true;

      // 2. Pull remote catch-up
      catchUpCount = await this.pullCatchUp();

      // 3. Push full snapshot
      await this.pushAllSnapshots();
      snapshotPushed = true;

      this.state.errorMessage = null;
      await this.saveLastSyncedTime(new Date());
    } catch (err) {
      console.error('[SyncEngine] syncNow failed:', err);
      const raw = err instanceof Error ? err.message : 'فشلت المزامنة';
      errorMsg = this.formatFriendlyErrorMessage(raw);
      this.state.errorMessage = errorMsg;
    } finally {
      this.isDraining = false;
      this.isUserTriggeredSync = false;
      await this.refreshOutboxCount();
      this.evaluateStatus();
    }

    return {
      outboxDrained,
      snapshotPushed,
      catchUpCount,
      error: errorMsg,
    };
  }

  /** Pull full store snapshots from mobpos_stores table and replace local stores */
  public async pullAllSnapshots(): Promise<number> {
    if (!this.supabase) throw new Error('عميل Supabase غير مهيأ');
    const tenantId = this.state.tenantId;

    const { data, error } = await this.supabase
      .from('mobpos_stores')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error || !data) throw new Error(`فشل جلب لقطات المتاجر: ${error?.message || 'لا توجد بيانات'}`);

    const stores: Record<string, { id: string }[]> = {};
    for (const row of data as { tenant_id: string; store: string; data: unknown }[]) {
      if (row.tenant_id !== tenantId || !SYNCABLE_STORES.has(row.store) || !Array.isArray(row.data)) continue;
      stores[row.store] = row.data as { id: string }[];
    }

    setRemoteApplying(true);
    try {
      await indexedDBUtils.flushPendingWrites();
      await indexedDBUtils.replaceStoresData(stores);
      await indexedDBUtils.flushPendingWrites();
    } finally {
      setRemoteApplying(false);
    }

    await this.saveLastSyncedTime(new Date());
    return Object.keys(stores).length;
  }

  /** Clear pending outbox tasks (maintenance / discard) */
  public async clearOutbox(): Promise<void> {
    await indexedDBUtils.clearStore(indexedDBUtils.STORES.syncOutbox);
    await this.refreshOutboxCount();
  }
}

// Global Singleton Instance
export const syncEngine = new SyncEngine();
