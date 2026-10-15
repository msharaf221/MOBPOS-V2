// ============================================================
//  محرك المزامنة السحابية اللحظية (Cloud Auto Sync Engine)
//  Offline-First + Supabase Realtime + Last-Write-Wins + Outbox
// ============================================================

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { indexedDBUtils, onStoreDelta, setRemoteApplying } from '../hooks/useIndexedDB.ts';
import type { ActiveLicense } from '../license/types.ts';
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
const INITIAL_BACKOFF_MS = 1500;
const MAX_BACKOFF_MS = 30000;
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
  private backoffMs = INITIAL_BACKOFF_MS;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeDelta: (() => void) | null = null;
  private initialized = false;

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

    // Periodic check & outbox flush interval (every 15s)
    this.heartbeatTimer = setInterval(() => {
      if (this.state.isOnline && this.state.pendingCount > 0 && !this.isDraining) {
        void this.triggerDrain();
      }
    }, 15000);
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
    } else if (this.isDraining) {
      this.state.status = 'syncing';
    } else if (this.state.errorMessage) {
      this.state.status = 'error';
    } else {
      this.state.status = 'synced';
    }
    this.emitState();
  }

  private handleOnline = (): void => {
    this.state.isOnline = true;
    this.evaluateStatus();
    void this.triggerDrain();
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
        global: {
          headers: validToken
            ? { Authorization: `Bearer ${validToken}` }
            : {},
        },
      });

      // If we have an existing session token, configure it
      if (validToken && this.config.refreshToken) {
        void this.supabase.auth.setSession({
          access_token: validToken,
          refresh_token: this.config.refreshToken,
        }).catch(err => console.warn('[SyncEngine] setSession failed:', err));
      }

      this.setupRealtimeSubscription();
      this.evaluateStatus();
      if (this.state.isOnline) {
        void this.triggerDrain();
      }
    } catch (err) {
      console.error('[SyncEngine] Client init failed:', err);
      this.state.errorMessage = err instanceof Error ? err.message : 'فشل إعداد عميل Supabase';
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
        void this.triggerDrain();
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

  public async triggerDrain(): Promise<void> {
    if (this.isDraining) return;
    if (!this.state.isOnline || !this.supabase) {
      this.evaluateStatus();
      return;
    }
    if (!this.config.autoSyncEnabled || !this.isLicenseValid()) {
      this.evaluateStatus();
      return;
    }

    this.isDraining = true;
    this.evaluateStatus();

    try {
      while (true) {
        const items = await indexedDBUtils.getAll<OutboxItem>(indexedDBUtils.STORES.syncOutbox);
        if (items.length === 0) {
          this.state.errorMessage = null;
          this.backoffMs = INITIAL_BACKOFF_MS;
          await this.saveLastSyncedTime(new Date());
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

        // Send upsert to Supabase mobpos_records
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
    } catch (err) {
      console.warn('[SyncEngine] Drain failed, backing off:', err);
      const rawMsg = err instanceof Error ? err.message : 'فشل رفع البيانات للسحابة';

      // Auto-recovery: If JWT was malformed (e.g. Expected 3 parts in JWT; got 1),
      // clear the invalid token from localStorage, reset client, and retry immediately with clean anonKey!
      if (rawMsg.includes('Expected 3 parts in JWT') || rawMsg.includes('invalid JWT')) {
        console.warn('[SyncEngine] Malformed JWT detected in request, purging token and switching to anon key');
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(CFG_ACCESS_TOKEN);
        }
        this.config.accessToken = undefined;
        this.state.errorMessage = null;
        this.reconnect();
        return;
      }

      this.state.errorMessage = rawMsg;
      // Schedule exponential retry
      if (this.drainTimer) clearTimeout(this.drainTimer);
      this.drainTimer = setTimeout(() => {
        this.drainTimer = null;
        void this.triggerDrain();
      }, this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    } finally {
      this.isDraining = false;
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

  /** Push full store snapshots to mobpos_stores table */
  public async pushAllSnapshots(): Promise<number> {
    if (!this.supabase) throw new Error('عميل Supabase غير مهيأ');
    await indexedDBUtils.flushPendingWrites();

    const tenantId = this.state.tenantId;
    let count = 0;

    for (const store of SYNCABLE_STORES) {
      const data = await indexedDBUtils.getAll(store);
      const { error } = await this.supabase
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

      if (error) throw new Error(`فشل رفع لقطة "${store}": ${error.message}`);
      count++;
    }

    await this.saveLastSyncedTime(new Date());
    return count;
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
