import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  BranchConfig,
  BranchMetrics,
  SaleRecord,
  SaleItem,
  Safe,
  Transaction,
  InventoryItem,
  MaintenanceOrder,
  Customer,
  ImeiUnit,
} from '../types';
import { canonicalStoreName } from '../../../shared/sync/contract.ts';
import {
  adaptCustomer,
  adaptInventoryItem,
  adaptImeiUnit,
  adaptMaintenance,
  adaptSale,
  adaptSafe,
  adaptTransaction,
  countAvailableImeiByInventory,
  normalizeIncoming,
  toMap,
} from './sync/records';
import { normalizeRecord } from '../../../shared/sync/normalize.ts';
import {
  isOperationalExpense,
  isOperationalIncome,
  calculateInventoryValuation,
  roundMoney,
} from '../../../shared/accounting/financialCalculations.ts';
import { enqueueOutbox, flushOutbox, getOutboxCount } from './sync/outbox';

const STORAGE_KEY_BRANCHES = 'mobpos_companion_branches_v1';
const BRANCH_FETCH_TIMEOUT_MS = 18_000;
const METRICS_CACHE_TTL_MS = 20_000;
const REALTIME_RECONNECT_INTERVAL_MS = 20_000;
const MAX_DELTA_RECORDS = 2000;

/** معرّف الجهاز الثابت للإيكوا suppression في المزامنة (بدل توليد واحد لكل عملية) */
const DEVICE_CLIENT_ID_KEY = 'mobpos_companion_device_client_id';
function getDeviceClientId(): string {
  try {
    let id = localStorage.getItem(DEVICE_CLIENT_ID_KEY);
    if (!id) {
      id = `mob_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(DEVICE_CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return `mob_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * 🔴 FIX: عزل المستأجرين (Tenant Isolation).
 * معرّف الموحّد المطابق للديسكتوب (`default-tenant`) يُستخدم كاحتياطي فقط؛
 * لكن عمليات الكتابة (بيع / مصروف / صيانة) تُرفض الآن إذا كان مسار tenant
 * مفقوداً لتجنب كتابة البيانات تحت مستأجر خاطئ.
 */
const UNIFIED_DEFAULT_TENANT = 'default-tenant';

function withTimeout<T>(
  promise: Promise<T>,
  ms = BRANCH_FETCH_TIMEOUT_MS,
  errorMsg = 'انتهت مهلة الاتصال بالفرع'
): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(errorMsg));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

// Default initial branch configuration
const DEFAULT_BRANCHES: BranchConfig[] = [
  {
    id: 'b_main',
    name: 'الفرع الرئيسي',
    city: 'المركز الرئيسي',
    code: 'HQ-01',
    color: '#06b6d4', // Cyan
    supabaseUrl: '',
    supabaseAnonKey: '',
    tenantId: '',
    enabled: true,
    createdAt: new Date().toISOString(),
    status: 'offline',
  },
];

class MultiBranchManager {
  private clients: Map<string, SupabaseClient> = new Map();
  private channels: Map<string, ReturnType<SupabaseClient['channel']>> = new Map();
  private listeners: Set<() => void> = new Set();
  private metricsCache: Map<string, { metrics: BranchMetrics; timestamp: number }> = new Map();
  private realtimeHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private realtimeReconnectAttempts: Map<string, number> = new Map();

  public getBranches(): BranchConfig[] {
    if (typeof localStorage === 'undefined') return DEFAULT_BRANCHES;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_BRANCHES);
      if (!stored) {
        this.saveBranches(DEFAULT_BRANCHES);
        return DEFAULT_BRANCHES;
      }
      return JSON.parse(stored) as BranchConfig[];
    } catch {
      return DEFAULT_BRANCHES;
    }
  }

  public saveBranches(branches: BranchConfig[]): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_BRANCHES, JSON.stringify(branches));
    this.notify();
  }

  public addBranch(branch: Omit<BranchConfig, 'id' | 'createdAt'>): BranchConfig {
    const branches = this.getBranches();
    const newBranch: BranchConfig = {
      ...branch,
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      status: 'offline',
    };
    branches.push(newBranch);
    this.saveBranches(branches);
    return newBranch;
  }

  public updateBranch(id: string, updates: Partial<BranchConfig>): void {
    const branches = this.getBranches().map(b => (b.id === id ? { ...b, ...updates } : b));
    this.saveBranches(branches);
    if (
      updates.supabaseUrl !== undefined ||
      updates.supabaseAnonKey !== undefined ||
      // 🔴 FIX: الجلسة/العميل لهما رأس السر — أي تغيير فيه يفرض إعادة إنشاء العميل
      updates.tenantSecret !== undefined
    ) {
      const oldCh = this.channels.get(id);
      if (oldCh) void oldCh.unsubscribe();
      this.channels.delete(id);
      this.clients.delete(id);
      this.metricsCache.delete(id);
    }
  }

  public deleteBranch(id: string): void {
    const branches = this.getBranches().filter(b => b.id !== id);
    this.saveBranches(branches);
    const oldCh = this.channels.get(id);
    if (oldCh) void oldCh.unsubscribe();
    this.channels.delete(id);
    this.clients.delete(id);
    this.metricsCache.delete(id);
  }

  /**
   * استيراد إعدادات الفرع والمزامنة من كود الاقتران السريع (QR Code)
   */
  public importFromPairingCode(code: string): { ok: boolean; branch?: BranchConfig; error?: string } {
    try {
      const clean = code.trim();
      let jsonStr = '';
      if (clean.startsWith('MOBPOS_PAIR:')) {
        const b64 = clean.slice('MOBPOS_PAIR:'.length);
        const globalBuffer = (globalThis as unknown as { Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } } }).Buffer;
        jsonStr = globalBuffer
          ? globalBuffer.from(b64, 'base64').toString('utf8')
          : decodeURIComponent(escape(atob(b64)));
      } else {
        jsonStr = clean;
      }
      const data = JSON.parse(jsonStr) as {
        v?: number;
        app?: string;
        url?: string;
        key?: string;
        tenantId?: string;
        tenantSecret?: string;
        userEmail?: string;
        userName?: string;
        expiresAt?: number;
      };

      if (!data.url || !data.key) {
        return { ok: false, error: 'رمز الاقتران غير صالح أو مفقود الرابط/المفتاح' };
      }
      if (data.expiresAt && Date.now() > data.expiresAt) {
        return { ok: false, error: 'انتهت صلاحية رمز الاقتران — اطلب رمزاً جديداً من الديسكتوب' };
      }

      const branches = this.getBranches();
      const rawShop = (data as any).shopName || (data as any).branchName || data.userName;
      const branchName = rawShop ? `متجر ${rawShop}` : 'الفرع الرئيسي';

      // Check if existing branch matches 'b_main' or the same tenantId
      const existingIdx = branches.findIndex(b => b.id === 'b_main' || (data.tenantId && b.tenantId === data.tenantId));
      let targetBranch: BranchConfig;

      if (existingIdx >= 0) {
        targetBranch = {
          ...branches[existingIdx],
          name: branches[existingIdx].name === 'الفرع الرئيسي' || branches[existingIdx].name === 'الفرع المتزامن' ? branchName : branches[existingIdx].name,
          supabaseUrl: data.url,
          supabaseAnonKey: data.key,
          tenantId: data.tenantId || 'default-tenant',
          tenantSecret: data.tenantSecret || '',
          userEmail: data.userEmail,
          userName: data.userName,
          enabled: true,
          status: 'syncing',
        };
        branches[existingIdx] = targetBranch;
        this.saveBranches(branches);
        this.updateBranch(targetBranch.id, targetBranch);
      } else {
        targetBranch = this.addBranch({
          name: branchName,
          city: branchName,
          code: 'MAIN-01',
          color: '#38bdf8',
          supabaseUrl: data.url,
          supabaseAnonKey: data.key,
          tenantId: data.tenantId || 'default-tenant',
          tenantSecret: data.tenantSecret || '',
          userEmail: data.userEmail,
          userName: data.userName,
          enabled: true,
        });
      }

      return { ok: true, branch: targetBranch };
    } catch {
      return { ok: false, error: 'فشل فك تشفير رمز الاقتران' };
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  public getClient(branch: BranchConfig): SupabaseClient | null {
    if (!branch.supabaseUrl || !branch.supabaseAnonKey) return null;
    const cleanUrl = branch.supabaseUrl.trim().replace(/\/+$/, '');
    const cleanKey = branch.supabaseAnonKey.trim();
    if (!cleanUrl.startsWith('http') || cleanKey.length < 20) return null;

    if (!this.clients.has(branch.id)) {
      // 🔴 SECURITY: مع مخطط RLS الصارم (Step 8) يُرفَق سر المستأجر كرأس ثابت
      // على كل الاستعلامات والـ Realtime حتى يعرض Supabase مستأجر هذا الفرع فقط.
      const tenantSecret = (branch.tenantSecret || '').trim();
      const client = createClient(cleanUrl, cleanKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: tenantSecret ? { headers: { 'x-tenant-secret': tenantSecret } } : {},
      });
      this.clients.set(branch.id, client);
    }
    return this.clients.get(branch.id) || null;
  }

  public setupRealtimeForBranch(
    branch: BranchConfig,
    onLiveChange?: (evt?: { table: string; eventType: string; branchId: string; branchName: string; data?: any }) => void
  ): void {
    const client = this.getClient(branch);
    if (!client) return;

    if (this.channels.has(branch.id)) {
      const oldCh = this.channels.get(branch.id);
      if (oldCh) void oldCh.unsubscribe();
      this.channels.delete(branch.id);
    }

    try {
      const tenantFilter = branch.tenantId ? branch.tenantId.trim() : '';
      if (!tenantFilter) {
        console.info(`[MultiBranch Live] Skipping realtime for ${branch.name}: no Tenant ID configured`);
        return;
      }
      const deviceClientId = getDeviceClientId();
      const channel = client
        .channel(`branch_${branch.id}_live_${Date.now()}`)
        .on(
          'postgres_changes',
          // 🔴 FIX: فلترة tenant_id — السابق كان يستقبل أحداث كل المستأجرين على المشروع
          { event: '*', schema: 'public', table: 'mobpos_records', filter: `tenant_id=eq.${tenantFilter}` },
          (payload) => {
            // تجاهل صدى تعديلات هذا الجهاز نفسه
            const rowClientId = (payload.new as { client_id?: string } | null)?.client_id
              ?? (payload.old as { client_id?: string } | null)?.client_id;
            if (rowClientId && rowClientId === deviceClientId) return;

            console.log(`[MultiBranch Live] Record update on ${branch.name}:`, payload.eventType);
            this.metricsCache.delete(branch.id);
            if (onLiveChange) {
              onLiveChange({
                table: 'mobpos_records',
                eventType: payload.eventType,
                branchId: branch.id,
                branchName: branch.name,
                data: (payload.new as any) || (payload.old as any),
              });
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'mobpos_stores', filter: `tenant_id=eq.${tenantFilter}` },
          (payload) => {
            console.log(`[MultiBranch Live] Snapshot update on ${branch.name}:`, payload.eventType);
            this.metricsCache.delete(branch.id);
            if (onLiveChange) {
              onLiveChange({
                table: 'mobpos_stores',
                eventType: payload.eventType,
                branchId: branch.id,
                branchName: branch.name,
                data: (payload.new as any) || (payload.old as any),
              });
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[MultiBranch Live] Subscribed to realtime updates for ${branch.name}`);
            this.updateBranch(branch.id, { status: 'connected' });
            this.realtimeReconnectAttempts.set(branch.id, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // 🔴 FIX: Auto-reconnect عند فقد الاتصال بدل سكوت
            console.warn(`[MultiBranch Live] Channel ${status} for ${branch.name}, scheduling reconnect...`);
            this.updateBranch(branch.id, { status: 'error' });
            const attempts = this.realtimeReconnectAttempts.get(branch.id) || 0;
            if (attempts < 10) {
              const delay = Math.min(REALTIME_RECONNECT_INTERVAL_MS * Math.pow(1.5, attempts), 120_000);
              this.realtimeReconnectAttempts.set(branch.id, attempts + 1);
              setTimeout(() => {
                console.info(`[MultiBranch Live] Reconnect attempt ${attempts + 1} for ${branch.name}...`);
                this.setupRealtimeForBranch(branch, onLiveChange);
              }, delay);
            }
          }
        });

      this.channels.set(branch.id, channel);
    } catch (e) {
      console.warn(`[MultiBranch Live] Failed to subscribe realtime for ${branch.name}:`, e);
    }
  }

  public setupAllRealtime(
    onLiveChange?: (evt?: { table: string; eventType: string; branchId: string; branchName: string; data?: any }) => void
  ): () => void {
    const branches = this.getBranches().filter(b => b.enabled && b.supabaseUrl && b.supabaseAnonKey);
    for (const b of branches) {
      this.setupRealtimeForBranch(b, onLiveChange);
    }

    // 🔴 FIX: Heartbeat دوري كل 20 ثانية — يفحص حالة القنوات ويعيد الاتصال
    // لو القناة ماتت صامتاً (مشكلة شائعة مع Supabase Realtime على الموبايل)
    if (this.realtimeHeartbeatTimer) clearInterval(this.realtimeHeartbeatTimer);
    this.realtimeHeartbeatTimer = setInterval(() => {
      const activeBranches = this.getBranches().filter(b => b.enabled && b.supabaseUrl && b.supabaseAnonKey);
      for (const b of activeBranches) {
        if (!this.channels.has(b.id)) {
          console.info(`[MultiBranch Live] Heartbeat: reconnecting dead channel for ${b.name}`);
          this.setupRealtimeForBranch(b, onLiveChange);
        }
      }
    }, REALTIME_RECONNECT_INTERVAL_MS);

    return () => {
      if (this.realtimeHeartbeatTimer) {
        clearInterval(this.realtimeHeartbeatTimer);
        this.realtimeHeartbeatTimer = null;
      }
      for (const [, ch] of this.channels.entries()) {
        void ch.unsubscribe();
      }
      this.channels.clear();
      this.realtimeReconnectAttempts.clear();
    };
  }

  /**
   * Fetches live data from Supabase for a single branch.
   * Merges baseline snapshots from `mobpos_stores` with recent deltas from `mobpos_records`.
   * Normalizes desktop models to mobile types with 100% schema alignment.
   */
  // ------------------------------------------------------------
  //  Offline cache — آخر لقطة ناجحة لكل فرع
  // ------------------------------------------------------------
  private metricsCacheKey(branch: BranchConfig): string {
    const tenant = (branch.tenantId || '').trim();
    return `mobpos_metrics_cache_v1_${branch.id}_${tenant}`;
  }

  /** يحفظ لقطة مبسطة من آخر قراءة ناجحة عشان الشاشات تفضل شغالة أوفلاين. */
  private persistMetricsCache(branch: BranchConfig, metrics: BranchMetrics): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const slim: BranchMetrics = {
        ...metrics,
        recentSales: metrics.recentSales.slice(0, 40),
        recentTransactions: metrics.recentTransactions.slice(0, 40),
        inventoryList: metrics.inventoryList.slice(0, 1500),
        imeiUnitsList: metrics.imeiUnitsList.slice(0, 2500),
      };
      localStorage.setItem(
        this.metricsCacheKey(branch),
        JSON.stringify({ savedAt: Date.now(), metrics: slim })
      );
    } catch {
      // التخزين ممتلئ — الكاش في الذاكرة كفاية
    }
  }

  /** يرجّع آخر لقطة محفوظة (أو null لو مفيش). */
  private loadMetricsCache(branch: BranchConfig): BranchMetrics | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(this.metricsCacheKey(branch));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { savedAt?: number; metrics?: BranchMetrics };
      if (!parsed?.metrics) return null;
      return {
        ...parsed.metrics,
        branchId: branch.id,
        branchName: branch.name,
        branchColor: branch.color,
        pendingOutboxCount: getOutboxCount(branch.id),
      };
    } catch {
      return null;
    }
  }

  public async fetchBranchMetrics(branch: BranchConfig, forceRefresh = false): Promise<BranchMetrics> {
    const client = this.getClient(branch);

    if (!client) {
      this.updateBranch(branch.id, {
        status: 'offline',
        errorMessage: 'يرجى إدخال Supabase URL ومفتاح Anon Key في إعدادات الفرع',
      });
      return this.getEmptyMetrics(branch.id, branch.name, branch.color);
    }

    // إعادة إرسال أي كتابات فشلت قبل قراءة البيانات عشان المستخدم يشوفها فوراً
    if (getOutboxCount(branch.id) > 0) {
      try {
        await this.flushPendingRecords(branch);
      } catch (flushErr) {
        console.warn('[MultiBranch] Outbox flush before read failed:', flushErr);
      }
    }

    if (!forceRefresh) {
      const cached = this.metricsCache.get(branch.id);
      if (cached && Date.now() - cached.timestamp < METRICS_CACHE_TTL_MS) {
        return cached.metrics;
      }
    }

    try {
      const metrics = await withTimeout(
        (async (): Promise<BranchMetrics> => {
          let activeTenantId = branch.tenantId ? branch.tenantId.trim() : '';

          // 1. اكتشاف Tenant آمن: فقط إذا كانت القاعدة تحتوي على مستأجر واحد بالضبط.
          // 🔴 FIX: السابق كان يتبنى "أول tenant يُلقى" مباشرة حتى لو المشروع مشترك
          // بين عدة محلات — ما كان قد يعرض بيانات محل آخر. الآن الاعتماد التلقائي
          // يحدث فقط في حالة المستأجر الوحيد، وإلا نطلب تحديد المعرف يدوياً.
          if (!activeTenantId) {
            try {
              const tenantIds = new Set<string>();
              try {
                const { data: sRows } = await client.from('mobpos_stores').select('tenant_id').limit(50);
                (sRows || []).forEach((r: { tenant_id?: string }) => r?.tenant_id && tenantIds.add(String(r.tenant_id)));
              } catch { /* الجدول قد لا يكون موجوداً بعد */ }
              try {
                const { data: rRows } = await client
                  .from('mobpos_records')
                  .select('tenant_id')
                  .is('deleted_at', null)
                  .limit(50);
                (rRows || []).forEach((r: { tenant_id?: string }) => r?.tenant_id && tenantIds.add(String(r.tenant_id)));
              } catch { /* بديل دون فشل */ }

              if (tenantIds.size === 1) {
                const [discovered] = Array.from(tenantIds);
                activeTenantId = discovered;
                console.info(`[MultiBranch] Auto-discovered sole tenantId: ${activeTenantId}`);
                this.updateBranch(branch.id, { tenantId: activeTenantId });
              } else if (tenantIds.size > 1) {
                this.updateBranch(branch.id, {
                  status: 'error',
                  errorMessage: 'يوجد أكثر من معرف متجر في هذا المشروع — مراجعة "معرف المتجر" (Tenant ID) في إعدادات الفرع',
                });
                return this.getEmptyMetrics(branch.id, branch.name, branch.color);
              }
            } catch (discoverErr) {
              console.warn('[MultiBranch] Auto-discovery warning:', discoverErr);
            }
          }

      // Raw store containers — canonical desktop names only
      const rawStores: Record<string, any[]> = {
        inventory: [],
        imeiUnits: [],
        customers: [],
        safes: [],
        users: [],
        categories: [],
        maintenance: [],
        sales: [],
        transactions: [],
      };

      const overlayRecord = (store: string, record: any, updatedAt?: string) => {
        const normalized = normalizeIncoming(store, record, {
          id: record?.id,
          updatedAt,
        });
        const list = rawStores[store];
        if (!list) return;
        const recordId = String(normalized.id || '');
        if (!recordId) return;
        const index = list.findIndex((item: any) => String(item.id) === recordId);
        if (index >= 0) {
          list[index] = { ...list[index], ...normalized };
        } else {
          list.unshift({ ...normalized, id: recordId });
        }
      };

      // 2. Fetch Baseline Snapshots from mobpos_stores
      try {
        let storeQuery = client.from('mobpos_stores').select('*');
        if (activeTenantId) {
          storeQuery = storeQuery.eq('tenant_id', activeTenantId);
        }
        const { data: storeRows, error: storeErr } = await storeQuery;

        if (storeRows && storeRows.length > 0) {
          for (const row of storeRows) {
            // 🔴 FIX: العمود اسمه `store` (مش store_name)، والمخزن القانوني
            // لـ IMEI هو `imeiUnits` (مش imei_units). دعم الأسماء القديمة هنا
            // بيرجّع المنتجات والأجهزة اللي كانت مختفية.
            const store = canonicalStoreName(row.store);
            if (!store || !Array.isArray(row.data)) continue;
            rawStores[store] = row.data.map((record: any) =>
              normalizeIncoming(store, record, { id: record?.id })
            );
          }
        }
      } catch (storeFetchErr) {
        console.warn(`[MultiBranch] Error fetching mobpos_stores for ${branch.name}:`, storeFetchErr);
      }

      // 3. Fetch Real-time Deltas from mobpos_records and overlay on top of baseline
      // 🔴 FIX: رفع الحد من 600 → 2000 مع pagination كامل عشان ما نفوّتش أي تغيير.
      try {
        let allDeltaRows: any[] = [];
        let deltaOffset = 0;
        const DELTA_PAGE_SIZE = 500;

        while (allDeltaRows.length < MAX_DELTA_RECORDS) {
          let deltaQuery = client
            .from('mobpos_records')
            .select('*')
            .order('updated_at', { ascending: false })
            .range(deltaOffset, deltaOffset + DELTA_PAGE_SIZE - 1);
          if (activeTenantId) {
            deltaQuery = deltaQuery.eq('tenant_id', activeTenantId);
          }
          const { data: pageRows, error: deltaErr } = await deltaQuery;
          if (deltaErr || !pageRows || pageRows.length === 0) break;
          allDeltaRows = allDeltaRows.concat(pageRows);
          deltaOffset += DELTA_PAGE_SIZE;
          // صفحة غير مكتملة → وصلنا لآخر البيانات
          if (pageRows.length < DELTA_PAGE_SIZE) break;
        }

        if (allDeltaRows.length > 0) {
          // Overlay deltas onto corresponding store arrays (الأحدث الأول)
          for (const row of allDeltaRows) {
            const store = canonicalStoreName(row.store);
            if (!store) continue;
            const recordData = row.data;
            const recordId = row.record_id || recordData?.id;
            if (!recordId) continue;

            if (!rawStores[store]) {
              rawStores[store] = [];
            }

            if (row.deleted_at) {
              const dIdx = rawStores[store].findIndex((item: any) => item.id === recordId);
              if (dIdx >= 0) rawStores[store].splice(dIdx, 1);
              continue;
            }
            if (!recordData) continue;

            // الأحدث الأول: مش بنستبدل سجل موجود أحدث بنسخة أقدم
            const existingIdx = rawStores[store].findIndex((item: any) => item.id === recordId);
            if (existingIdx >= 0) {
              const existingUpdated = String(rawStores[store][existingIdx]?.updated_at || '');
              const incomingUpdated = String(row.updated_at || '');
              if (existingUpdated && incomingUpdated && existingUpdated > incomingUpdated) continue;
            }
            overlayRecord(store, { ...recordData, id: recordId }, row.updated_at);
          }
        }
      } catch (deltaFetchErr) {
        console.warn(`[MultiBranch] Error fetching mobpos_records deltas for ${branch.name}:`, deltaFetchErr);
      }

      // 4. Build Lookup Maps for Schema Normalization
      const inventoryMap = toMap(rawStores.inventory || []);
      const imeiMap = toMap(rawStores.imeiUnits || []);
      const customersMap = toMap(rawStores.customers || []);
      const usersMap = toMap(rawStores.users || []);
      const safesMap = toMap(rawStores.safes || []);
      const categoriesMap = toMap(rawStores.categories || []);

      const branchLike = { id: branch.id, name: branch.name, color: branch.color };

      // 5. Normalize IMEI Units + counts
      const normalizedImeiUnits: ImeiUnit[] = (rawStores.imeiUnits || [])
        .map((unit: any) => adaptImeiUnit(unit, branchLike))
        .filter((unit: ImeiUnit) => Boolean(unit.id));
      const availableImeiCounts = countAvailableImeiByInventory(normalizedImeiUnits);

      // 6. Normalize Sales Records
      const normalizedSales: SaleRecord[] = (rawStores.sales || [])
        .map((sale: any) => adaptSale(sale, {
          inventory: inventoryMap,
          imei: imeiMap,
          customers: customersMap,
          users: usersMap,
          safes: safesMap,
        }, branchLike))
        .filter((sale: SaleRecord) => Boolean(sale.id));

      // Sort sales descending by date
      normalizedSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // 7. Normalize Inventory Items
      const normalizedInventory: InventoryItem[] = (rawStores.inventory || [])
        .map((item: any) => adaptInventoryItem(
          item,
          branchLike,
          categoriesMap,
          availableImeiCounts.get(String(item.id)) || 0
        ))
        .filter((item: InventoryItem) => Boolean(item.id));

      // 8. Normalize Safes
      const normalizedSafes: Safe[] = (rawStores.safes || [])
        .map((safe: any) => adaptSafe(safe, branchLike))
        .filter((safe: Safe) => Boolean(safe.id));

      // 9. Normalize Transactions
      const normalizedTransactions: Transaction[] = (rawStores.transactions || [])
        .map((tx: any) => adaptTransaction(tx, branchLike, { safes: safesMap, users: usersMap }))
        .filter((tx: Transaction) => Boolean(tx.id));

      // Sort transactions descending by date
      normalizedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // 10. Normalize Maintenance Orders
      const normalizedMaintenance: MaintenanceOrder[] = (rawStores.maintenance || [])
        .map((order: any) => adaptMaintenance(order, branchLike))
        .filter((order: MaintenanceOrder) => Boolean(order.id));

      // 11. Normalize Customers
      const normalizedCustomers: Customer[] = (rawStores.customers || [])
        .map((customer: any) => adaptCustomer(customer, branchLike))
        .filter((customer: Customer) => Boolean(customer.id));

      // 11. Calculate Real KPIs (Separating Sales, Maintenance, Revenue, Profit, Liquidity & Stock)
      const now = new Date();
      const todayDateStr = now.toISOString().slice(0, 10);

      // A. Merchandise Sales
      const todaySales = normalizedSales.filter(s => {
        const d = (s.date || s.createdAt || '').slice(0, 10);
        return d === todayDateStr;
      });
      const todaySalesTotal = todaySales.reduce((acc, s) => acc + (Number(s.finalTotal) || 0), 0);
      const todaySalesProfit = todaySales.reduce(
        (acc, s) => acc + (s.profit && Number(s.profit) > 0 ? Number(s.profit) : 0),
        0
      );
      const todayCashCollected = todaySales.reduce((acc, s) => acc + (Number(s.paidAmount) || 0), 0);

      // B. Maintenance Inflow & Profit (Delivered today)
      const todayDeliveredMaintenance = normalizedMaintenance.filter(m => {
        if (m.status !== 'delivered') return false;
        const d = (m.deliveryDate || m.deliveredAt || '').slice(0, 10);
        return d === todayDateStr;
      });
      const todayMaintTx = normalizedTransactions.filter(t => {
        const d = (t.date || (t as any).createdAt || '').slice(0, 10);
        return d === todayDateStr && (t.type === 'maintenance' || (t.category || '').includes('صيانة'));
      });
      const txMaintTotal = todayMaintTx.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      const ticketMaintTotal = todayDeliveredMaintenance.reduce(
        (acc, m) => acc + (Number(m.finalPrice) || Number(m.collectedAmount) || 0),
        0
      );
      const todayMaintenanceIncome = Math.max(ticketMaintTotal, txMaintTotal);
      const todayMaintenanceProfit = todayDeliveredMaintenance.reduce((acc, m) => {
        const rev = Number(m.finalPrice) || Number(m.collectedAmount) || 0;
        const cost = Number(m.costPrice) || 0;
        return acc + Math.max(0, rev - cost);
      }, 0);
      const todayMaintenanceCount = todayDeliveredMaintenance.length;
      const activeMaintenanceCount = normalizedMaintenance.filter(
        m => m.status !== 'delivered' && m.status !== 'cancelled'
      ).length;

      // C. Expenses & Outflows (الفصل الصارم: مصروفات التشغيل والهوالك فقط — استبعاد السحب ورأس المال وشراء المخزون)
      const todayExpenses = normalizedTransactions.filter(t => {
        const d = (t.date || (t as any).createdAt || '').slice(0, 10);
        return d === todayDateStr && isOperationalExpense(t as any);
      });
      const todayExpensesTotal = roundMoney(
        todayExpenses.reduce((acc, t) => acc + Math.abs(Number(t.amount) || 0), 0)
      );

      // أي إيرادات تشغيلية أخرى بخلاف المبيعات والصيانة
      const todayOtherOperatingIncomeTx = normalizedTransactions.filter(t => {
        const d = (t.date || (t as any).createdAt || '').slice(0, 10);
        return (
          d === todayDateStr &&
          isOperationalIncome(t as any) &&
          t.type !== 'maintenance' &&
          !(t.category || '').includes('صيانة')
        );
      });
      const todayOtherOperatingIncome = roundMoney(
        todayOtherOperatingIncomeTx.reduce((acc, t) => acc + Math.abs(Number(t.amount) || 0), 0)
      );

      // D. Total Revenue, Gross Profit & Net Operating Profit (معادلة موحدة دقيقة)
      // 1. إجمالي الإيرادات = مبيعات البضاعة + إيرادات الصيانة المحصلة + أي إيرادات تشغيلية أخرى
      const todayTotalRevenue = roundMoney(todaySalesTotal + todayMaintenanceIncome + todayOtherOperatingIncome);
      // 2. مجمل الربح (قبل المصروفات) = ربح مبيعات البضاعة + ربح الصيانة + الإيرادات التشغيلية الأخرى
      const todayGrossProfit = roundMoney(todaySalesProfit + todayMaintenanceProfit + todayOtherOperatingIncome);
      // 3. صافي الربح الحقيقي = مجمل الربح - المصروفات التشغيلية اليومية
      const todayNetProfit = roundMoney(todayGrossProfit - todayExpensesTotal);
      const todayProfitTotal = todayNetProfit;

      // E. Safes Cash Liquidity
      const totalSafesBalance = roundMoney(
        normalizedSafes.reduce((acc, s) => acc + (Number(s.balance) || 0), 0)
      );

      // F. Inventory Valuation (Capital locked in stock vs retail expected value)
      const inventoryVal = calculateInventoryValuation(normalizedInventory);
      const inventoryCostValue = inventoryVal.totalCapitalAtCost;
      const inventorySellValue = inventoryVal.totalRetailValue;
      const inventoryTotalItemsCount = inventoryVal.totalPiecesCount;
      const lowStockCount = normalizedInventory.filter(i => (i.quantity || 0) <= (i.minQuantity || 2)).length;

      // G. Debts
      const totalCustomerDebts = normalizedCustomers.reduce((acc, c) => acc + Math.max(0, Number(c.balance) || 0), 0);

      // Hourly breakdown for today (9 AM to 11 PM)
      const hourlyBuckets: Record<string, number> = {};
      for (let h = 9; h <= 23; h++) {
        const label = `${h > 12 ? h - 12 : h} ${h >= 12 ? 'م' : 'ص'}`;
        hourlyBuckets[label] = 0;
      }
      todaySales.forEach(s => {
        const dt = new Date(s.date || s.createdAt || now);
        const h = dt.getHours();
        if (h >= 9 && h <= 23) {
          const label = `${h > 12 ? h - 12 : h} ${h >= 12 ? 'م' : 'ص'}`;
          hourlyBuckets[label] = (hourlyBuckets[label] || 0) + (Number(s.finalTotal) || 0);
        }
      });
      const hourlySales = Object.entries(hourlyBuckets).map(([hour, total]) => ({ hour, total }));

      return {
        branchId: branch.id,
        branchName: branch.name,
        branchColor: branch.color,
        todaySalesTotal,
        todaySalesProfit,
        todayInvoicesCount: todaySales.length,
        todayCashCollected,
        todayMaintenanceIncome,
        todayMaintenanceProfit,
        todayMaintenanceCount,
        activeMaintenanceCount,
        todayTotalRevenue,
        todayProfitTotal,
        todayGrossProfit,
        todayNetProfit,
        todayExpensesTotal,
        totalSafesBalance,
        inventoryCostValue,
        inventorySellValue,
        inventoryTotalItemsCount,
        lowStockCount,
        totalCustomerDebts,
        hourlySales,
        recentSales: normalizedSales.slice(0, 100),
        recentTransactions: normalizedTransactions.slice(0, 100),
        safesList: normalizedSafes,
        inventoryList: normalizedInventory,
        maintenanceList: normalizedMaintenance,
        customersList: normalizedCustomers,
        imeiUnitsList: normalizedImeiUnits,
        pendingOutboxCount: getOutboxCount(branch.id),
        lastSyncedAt: new Date().toISOString(),
      };
    })(),
    BRANCH_FETCH_TIMEOUT_MS,
    `انتهت مهلة الاتصال بالفرع (${branch.name}) بعد 18 ثانية`
  );

      this.metricsCache.set(branch.id, { metrics, timestamp: Date.now() });
      this.persistMetricsCache(branch, metrics);
      this.updateBranch(branch.id, {
        status: 'connected',
        lastSyncAt: metrics.lastSyncedAt,
        errorMessage: undefined,
      });
      return metrics;
    } catch (err) {
      console.error(`[MultiBranch] Error fetching branch ${branch.name}:`, err);
      const errMsg = err instanceof Error ? err.message : 'خطأ بالاتصال بالفرع';
      this.updateBranch(branch.id, {
        status: 'error',
        errorMessage: errMsg,
      });
      // الرجوع لكاش الذاكرة ثم الكاش المحفوظ (عشان البيع يشتغل أوفلاين)
      const cached = this.metricsCache.get(branch.id);
      if (cached) {
        return cached.metrics;
      }
      const offline = this.loadMetricsCache(branch);
      if (offline) {
        this.metricsCache.set(branch.id, { metrics: offline, timestamp: Date.now() });
        return offline;
      }
      return this.getEmptyMetrics(branch.id, branch.name, branch.color);
    }
  }

  /**
   * Aggregates metrics across all enabled branches.
   * Uses Promise.allSettled so a dead/slow branch never blocks healthy branches.
   */
  public async fetchAggregateMetrics(
    branches: BranchConfig[],
    forceRefresh = false
  ): Promise<{
    combined: BranchMetrics;
    perBranch: BranchMetrics[];
  }> {
    const enabled = branches.filter(b => b.enabled);
    if (enabled.length === 0) {
      const empty = this.getEmptyMetrics('all', 'جميع الفروع', '#38bdf8');
      return { combined: empty, perBranch: [] };
    }

    const settled = await Promise.allSettled(
      enabled.map(b => this.fetchBranchMetrics(b, forceRefresh))
    );

    const perBranch: BranchMetrics[] = settled.map((res, idx) => {
      if (res.status === 'fulfilled') {
        return res.value;
      }
      const b = enabled[idx];
      console.error(`[MultiBranch] Branch failed during aggregation: ${b.name}`, res.reason);
      const cached = this.metricsCache.get(b.id);
      if (cached) return cached.metrics;
      return this.getEmptyMetrics(b.id, b.name, b.color);
    });

    const combined: BranchMetrics = {
      branchId: 'all',
      branchName: 'جميع الفروع مجمعة',
      branchColor: '#38bdf8',
      todaySalesTotal: perBranch.reduce((acc, m) => acc + m.todaySalesTotal, 0),
      todaySalesProfit: perBranch.reduce((acc, m) => acc + (m.todaySalesProfit || 0), 0),
      todayInvoicesCount: perBranch.reduce((acc, m) => acc + m.todayInvoicesCount, 0),
      todayCashCollected: perBranch.reduce((acc, m) => acc + m.todayCashCollected, 0),
      todayMaintenanceIncome: perBranch.reduce((acc, m) => acc + (m.todayMaintenanceIncome || 0), 0),
      todayMaintenanceProfit: perBranch.reduce((acc, m) => acc + (m.todayMaintenanceProfit || 0), 0),
      todayMaintenanceCount: perBranch.reduce((acc, m) => acc + (m.todayMaintenanceCount || 0), 0),
      activeMaintenanceCount: perBranch.reduce((acc, m) => acc + m.activeMaintenanceCount, 0),
      todayTotalRevenue: perBranch.reduce((acc, m) => acc + (m.todayTotalRevenue || m.todaySalesTotal), 0),
      todayProfitTotal: perBranch.reduce((acc, m) => acc + m.todayProfitTotal, 0),
      todayGrossProfit: perBranch.reduce((acc, m) => acc + (m.todayGrossProfit || (m.todaySalesProfit + m.todayMaintenanceProfit)), 0),
      todayNetProfit: perBranch.reduce((acc, m) => acc + (m.todayNetProfit ?? m.todayProfitTotal), 0),
      todayExpensesTotal: perBranch.reduce((acc, m) => acc + m.todayExpensesTotal, 0),
      totalSafesBalance: perBranch.reduce((acc, m) => acc + m.totalSafesBalance, 0),
      inventoryCostValue: perBranch.reduce((acc, m) => acc + (m.inventoryCostValue || 0), 0),
      inventorySellValue: perBranch.reduce((acc, m) => acc + (m.inventorySellValue || 0), 0),
      inventoryTotalItemsCount: perBranch.reduce((acc, m) => acc + (m.inventoryTotalItemsCount || 0), 0),
      lowStockCount: perBranch.reduce((acc, m) => acc + m.lowStockCount, 0),
      totalCustomerDebts: perBranch.reduce((acc, m) => acc + m.totalCustomerDebts, 0),
      hourlySales: this.combineHourly(perBranch),
      recentSales: perBranch
        .flatMap(m => m.recentSales)
        .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())
        .slice(0, 100),
      recentTransactions: perBranch
        .flatMap(m => m.recentTransactions)
        .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())
        .slice(0, 100),
      safesList: perBranch.flatMap(m => m.safesList),
      inventoryList: perBranch.flatMap(m => m.inventoryList),
      maintenanceList: perBranch.flatMap(m => m.maintenanceList),
      customersList: perBranch.flatMap(m => m.customersList),
      imeiUnitsList: perBranch.flatMap(m => m.imeiUnitsList),
      pendingOutboxCount: perBranch.reduce((acc, m) => acc + (m.pendingOutboxCount || 0), 0),
      lastSyncedAt: new Date().toISOString(),
    };

    return { combined, perBranch };
  }

  private combineHourly(metrics: BranchMetrics[]): { hour: string; total: number }[] {
    if (metrics.length === 0) return [];
    const base = (metrics[0]?.hourlySales || []).map(h => ({ hour: h.hour, total: 0 }));
    metrics.forEach(m => {
      m.hourlySales.forEach((h, idx) => {
        if (base[idx]) base[idx].total += h.total;
      });
    });
    return base;
  }

  public getEmptyMetrics(id: string, name: string, color: string): BranchMetrics {
    const hourlySales: { hour: string; total: number }[] = [];
    for (let h = 9; h <= 23; h++) {
      const label = `${h > 12 ? h - 12 : h} ${h >= 12 ? 'م' : 'ص'}`;
      hourlySales.push({ hour: label, total: 0 });
    }

    return {
      branchId: id,
      branchName: name,
      branchColor: color,
      todaySalesTotal: 0,
      todaySalesProfit: 0,
      todayInvoicesCount: 0,
      todayCashCollected: 0,
      todayMaintenanceIncome: 0,
      todayMaintenanceProfit: 0,
      todayMaintenanceCount: 0,
      activeMaintenanceCount: 0,
      todayTotalRevenue: 0,
      todayProfitTotal: 0,
      todayGrossProfit: 0,
      todayNetProfit: 0,
      todayExpensesTotal: 0,
      totalSafesBalance: 0,
      inventoryCostValue: 0,
      inventorySellValue: 0,
      inventoryTotalItemsCount: 0,
      lowStockCount: 0,
      totalCustomerDebts: 0,
      hourlySales,
      recentSales: [],
      recentTransactions: [],
      safesList: [],
      inventoryList: [],
      maintenanceList: [],
      customersList: [],
      imeiUnitsList: [],
      pendingOutboxCount: 0,
      lastSyncedAt: undefined,
    };
  }

  /**
   * البحث الفوري عن الصنف بالباركود أو رقم IMEI من الذاكرة ومن سحابة Supabase مباشرة.
   *
   * 🔴 FIX: كانت الدالة تقرأ عمود `store_name` والمخزن `imei_units`، وده مش
   * موجود في قاعدة البيانات (العمود `store` والمخزن `imeiUnits`) — فكان البحث
   * السحابي بيرجع فاضي دايماً. كمان بترجّع `imeiUnitId` عشان البيع يعلّم
   * الوحدة مباعة بدل ما يفضل الجهاز "متاح" في الديسكتوب.
   */
  public async searchInventoryByBarcodeOrImei(
    branchId: string,
    scannedCode: string
  ): Promise<{
    item: InventoryItem;
    matchedType: 'barcode' | 'imei';
    imei?: string;
    imeiUnitId?: string;
  } | null> {
    const clean = scannedCode.trim();
    if (!clean) return null;
    const lower = clean.toLowerCase();

    const branch = this.getBranches().find(b => b.id === branchId) || this.getBranches()[0];
    const metrics = branch ? this.metricsCache.get(branch.id)?.metrics : null;

    const buildItem = (raw: any, branchRef: BranchConfig, parent?: any): InventoryItem => {
      const source = parent || raw;
      const hasImei = Boolean(source.hasIMEI ?? source.hasImei ?? Boolean(parent));
      return {
        id: String(source.id),
        name: source.name || 'منتج غير مسمى',
        category: source.category || (hasImei ? 'موبايلات' : ''),
        categoryId: source.categoryId || undefined,
        quantity: Number(source.quantity) || 0,
        minQuantity: Number(source.minQuantity) || 2,
        costPrice: Number(raw.costPrice ?? raw.purchasePrice ?? source.costPrice) || 0,
        sellPrice: Number(raw.sellPrice ?? raw.sellingPrice ?? source.sellPrice) || 0,
        code: source.code || undefined,
        barcode: source.barcode || source.code || '',
        hasImei,
        hasIMEI: hasImei,
        createdAt: source.createdAt || undefined,
        branchId: branchRef.id,
        branchName: branchRef.name,
      };
    };

    // 1. البحث في قائمة الأصناف المحلية بالذاكرة
    if (metrics?.inventoryList) {
      const foundDirect = metrics.inventoryList.find(
        (it: InventoryItem) =>
          (it.barcode || '').trim().toLowerCase() === lower ||
          (it.code || '').trim().toLowerCase() === lower ||
          (it.id && it.id.toLowerCase() === lower)
      );
      if (foundDirect) {
        return { item: foundDirect, matchedType: 'barcode' };
      }

      // مطابقة IMEI من القائمة المحلية (لو الأجهزة محمّلة بالفعل)
      const localUnit = (metrics.imeiUnitsList || []).find(unit => {
        const m1 = String(unit.imei1 || unit.imei || '').trim().toLowerCase();
        const m2 = String(unit.imei2 || '').trim().toLowerCase();
        const sn = String(unit.serialNumber || '').trim().toLowerCase();
        return m1 === lower || m2 === lower || sn === lower;
      });
      if (localUnit) {
        const parent =
          metrics.inventoryList.find(i => i.id === (localUnit.inventoryId || localUnit.productId)) ||
          metrics.inventoryList.find(i => i.name === localUnit.productName);
        if (parent) {
          return {
            item: parent,
            matchedType: 'imei',
            imei: localUnit.imei1 || localUnit.imei || clean,
            imeiUnitId: localUnit.id,
          };
        }
      }
    }

    // 2. البحث في سحابة Supabase مباشرة إذا كان الفرع متصلاً
    if (branch && branch.supabaseUrl && branch.supabaseAnonKey) {
      const client = this.getClient(branch);
      const tenantId = branch.tenantId ? branch.tenantId.trim() : '';
      if (client) {
        const cacheItem = (item: InventoryItem) => {
          if (metrics && !metrics.inventoryList.some((i: InventoryItem) => i.id === item.id)) {
            metrics.inventoryList.push(item);
          }
        };

        try {
          // أ) البحث في mobpos_records عن الصنف بالباركود
          let invQuery = client
            .from('mobpos_records')
            .select('data')
            .eq('store', 'inventory')
            .is('deleted_at', null)
            .limit(200);
          if (tenantId) invQuery = invQuery.eq('tenant_id', tenantId);

          const { data: recData } = await invQuery;
          if (Array.isArray(recData)) {
            for (const r of recData) {
              const d = r?.data || {};
              const bcode = String(d.barcode || d.code || '').trim().toLowerCase();
              if (bcode === lower || String(d.id || '').toLowerCase() === lower) {
                const item = buildItem(d, branch);
                cacheItem(item);
                return { item, matchedType: 'barcode' };
              }
            }
          }

          // ب) البحث في mobpos_records عن وحدات IMEI (المخزن القانوني imeiUnits)
          let imeiQuery = client
            .from('mobpos_records')
            .select('data')
            .eq('store', 'imeiUnits')
            .is('deleted_at', null)
            .limit(300);
          if (tenantId) imeiQuery = imeiQuery.eq('tenant_id', tenantId);

          const { data: imeiData } = await imeiQuery;
          if (Array.isArray(imeiData)) {
            for (const r of imeiData) {
              const u = r?.data || {};
              const m1 = String(u.imei1 || u.imei || '').trim().toLowerCase();
              const m2 = String(u.imei2 || '').trim().toLowerCase();
              const sn = String(u.serialNumber || '').trim().toLowerCase();
              if (m1 !== lower && m2 !== lower && sn !== lower) continue;

              const invId = u.inventoryId || u.productId;
              let matchedItem = metrics?.inventoryList.find((i: InventoryItem) => i.id === invId);
              if (!matchedItem && invId) {
                let fetchItemQuery = client
                  .from('mobpos_records')
                  .select('data')
                  .eq('store', 'inventory')
                  .eq('record_id', invId)
                  .is('deleted_at', null)
                  .limit(1);
                if (tenantId) fetchItemQuery = fetchItemQuery.eq('tenant_id', tenantId);
                const { data: singleItem } = await fetchItemQuery;
                if (singleItem && singleItem[0]?.data) {
                  matchedItem = buildItem(singleItem[0].data, branch);
                  cacheItem(matchedItem);
                }
              }
              if (matchedItem) {
                return {
                  item: matchedItem,
                  matchedType: 'imei',
                  imei: u.imei1 || u.imei || clean,
                  imeiUnitId: String(u.id),
                };
              }
              // لو المنتج الأب مش موجود، نرجّع بيانات الوحدة نفسها كصنف
              const fallbackItem = buildItem(u, branch);
              cacheItem(fallbackItem);
              return {
                item: fallbackItem,
                matchedType: 'imei',
                imei: u.imei1 || u.imei || clean,
                imeiUnitId: String(u.id),
              };
            }
          }

          // ج) البحث في لقطة mobpos_stores الشاملة (العمود store وليس store_name)
          let storeQuery = client
            .from('mobpos_stores')
            .select('store, data')
            .in('store', ['inventory', 'imeiUnits']);
          if (tenantId) storeQuery = storeQuery.eq('tenant_id', tenantId);

          const { data: storesData } = await storeQuery;
          if (Array.isArray(storesData)) {
            const invStore = storesData.find(s => s.store === 'inventory')?.data;
            const imeiStore = storesData.find(s => s.store === 'imeiUnits')?.data;
            const invList: any[] = Array.isArray(invStore) ? invStore : [];
            const imeiList: any[] = Array.isArray(imeiStore) ? imeiStore : [];

            const foundInStore = invList.find(
              (d: any) =>
                String(d.barcode || d.code || '').trim().toLowerCase() === lower ||
                String(d.id || '').toLowerCase() === lower
            );
            if (foundInStore) {
              const item = buildItem(foundInStore, branch);
              cacheItem(item);
              return { item, matchedType: 'barcode' };
            }

            const foundUnit = imeiList.find((u: any) => {
              const m1 = String(u.imei1 || u.imei || '').trim().toLowerCase();
              const m2 = String(u.imei2 || '').trim().toLowerCase();
              const sn = String(u.serialNumber || '').trim().toLowerCase();
              return m1 === lower || m2 === lower || sn === lower;
            });
            if (foundUnit) {
              const parentItem = invList.find(
                (i: any) => String(i.id) === String(foundUnit.inventoryId || foundUnit.productId)
              );
              const item = buildItem(foundUnit, branch, parentItem);
              cacheItem(item);
              return {
                item,
                matchedType: 'imei',
                imei: foundUnit.imei1 || foundUnit.imei || clean,
                imeiUnitId: String(foundUnit.id),
              };
            }
          }
        } catch (searchErr) {
          console.warn('[MultiBranch] Barcode search in Supabase failed:', searchErr);
        }
      }
    }

    return null;
  }

  /**
   * Pushes granular records directly to `mobpos_records` on the branch's Supabase instance.
   * Broadcasts immediately via Supabase Realtime to Desktop Electron and all mobile devices!
   */
  public async pushRecordsToBranch(
    branch: BranchConfig,
    records: Array<{ store: string; recordId: string; data: any; isDelete?: boolean; version?: number }>,
    options?: { skipOutbox?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    const queueForRetry = (error: string) => {
      if (options?.skipOutbox) return;
      try {
        enqueueOutbox(branch.id, records, error);
      } catch (queueErr) {
        console.warn('[MultiBranch] Could not persist outbox:', queueErr);
      }
    };

    const client = this.getClient(branch);
    if (!client) {
      const error = 'الفرع غير مهيأ بالربط السحابي (Supabase)';
      queueForRetry(error);
      return { success: false, error };
    }

    const tenantId = branch.tenantId ? branch.tenantId.trim() : '';
    if (!tenantId) {
      console.error(`[MultiBranch] Cannot push to ${branch.name}: missing Tenant ID`);
      const error = 'يرجى تحديد معرف المتجر (Tenant ID) من إعدادات الفرع قبل إرسال البيانات للسحابة';
      // مش بنحطها في الـoutbox لأنها مش هتنجح غير بعد تعديل الإعدادات
      return { success: false, error };
    }
    const nowIso = new Date().toISOString();
    const clientId = getDeviceClientId();

    const rows = records.map(r => ({
      tenant_id: tenantId,
      store: r.store,
      record_id: r.recordId,
      data: r.isDelete ? {} : (r.data || {}),
      // ترقية الإصدار بدل تثبيت version:1 دائماً حتى تُوثَّق التعارضات
      version: (Number(r.version) || 0) + 1,
      client_id: clientId,
      updated_at: nowIso,
      deleted_at: r.isDelete ? nowIso : null,
    }));

    try {
      const { error } = await client
        .from('mobpos_records')
        .upsert(rows, { onConflict: 'tenant_id,store,record_id' });

      if (error) {
        console.error(`[MultiBranch] Failed to push records to ${branch.name}:`, error);
        queueForRetry(error.message);
        return { success: false, error: error.message };
      }

      // Invalidate cache immediately so next read fetches fresh state
      this.metricsCache.delete(branch.id);
      this.notify();
      return { success: true };
    } catch (e: any) {
      console.error(`[MultiBranch] Exception pushing records to ${branch.name}:`, e);
      const error = e?.message || 'خطأ أثناء إرسال البيانات للسحابة';
      queueForRetry(error);
      return { success: false, error };
    }
  }

  /**
   * يعيد إرسال كل السجلات المعلّقة لفرع معيّن.
   * بيُستدعى قبل قراءة البيانات وفي أي retry دوري.
   */
  public async flushPendingRecords(
    branch: BranchConfig
  ): Promise<{ sent: number; error?: string }> {
    return flushOutbox(branch.id, records =>
      this.pushRecordsToBranch(branch, records as any, { skipOutbox: true })
    );
  }

  /**
   * 🔴 FIX: جلب الحالة الحالية للسجل من السحابة قبل الحساب على الجهاز
   * (Read-Modify-Write) — السابق كان يحسب أرضيات الخزنة وكميات المخزون
   * من الكاش المحلي القديم، مما يسبب ضياع تحديثات مالية عند البيع المتزامن
   * من الديسكتوب والموبايل.
   */
  private async fetchFreshRecords(
    branch: BranchConfig,
    store: string,
    recordIds: string[]
  ): Promise<Map<string, { data: Record<string, any>; version: number }>> {
    const fresh = new Map<string, { data: Record<string, any>; version: number }>();
    const client = this.getClient(branch);
    const tenantId = branch.tenantId ? branch.tenantId.trim() : '';
    if (!client || !tenantId || recordIds.length === 0) return fresh;

    try {
      const builder = client
        .from('mobpos_records')
        .select('record_id, data, version')
        .eq('tenant_id', tenantId)
        .eq('store', store)
        .is('deleted_at', null)
        .in('record_id', recordIds)
        .order('updated_at', { ascending: false });

      const result = await withTimeout(
        builder as unknown as Promise<{
          data: Array<{ record_id: string; data: Record<string, any>; version?: number }> | null;
          error: { message: string } | null;
        }>
      ) as { data: Array<{ record_id: string; data: Record<string, any>; version?: number }> | null; error: { message: string } | null };
      const { data, error } = result;

      if (error || !data) return fresh;
      for (const row of data) {
        if (!row?.record_id || !row.data) continue;
        // الاستعلام مرتب تنازلياً بالتحديث — أول نجاح لكل معرف هو الأحدث
        if (!fresh.has(row.record_id)) {
          fresh.set(row.record_id, { data: row.data, version: Number(row.version) || 0 });
        }
      }
    } catch (err) {
      console.warn(`[MultiBranch] fetchFreshRecords(${store}) failed, falling back to cached values:`, err);
    }
    return fresh;
  }

  /** يدمج سجلاً طازجاً من السحابة على الكائن الممرر إن وجدت نسخة أحدث */
  private applyFreshData<T extends Record<string, any>>(
    cached: T,
    fresh: { data: Record<string, any>; version: number } | undefined,
    numericKeys: string[]
  ): { merged: T; version: number } {
    if (!fresh) return { merged: cached, version: Number((cached as any).version) || 0 };
    const merged: Record<string, any> = { ...cached };
    for (const key of numericKeys) {
      const rawVal = fresh.data[key];
      if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
        merged[key] = Number(rawVal) || 0;
      }
    }
    // أي حقول أخرى موجودة في النسخة السحابية (لدمج الحالة بشكل عام)
    return { merged: { ...merged, ...fresh.data } as T, version: fresh.version };
  }

  /**
   * Executes an atomic sale from Mobile:
   * 1. Records sale invoice in `mobpos_records` (`sales`)
   * 2. Updates safe balance and logs cash transaction (`safes`, `transactions`)
   * 3. Deducts sold quantities from inventory (`inventory`)
   * 4. Marks sold IMEI units and links them to the invoice (`imeiUnits`)
   * 5. Creates/updates the customer and his debt (`customers`)
   *
   * كل سجل بيتطبّع بـ`normalizeRecord` قبل الإرسال عشان يطابق سكيما الديسكتوب
   * حتى لو الواجهة بعتت حقول بأسماء مختلفة.
   */
  public async submitSale(
    branch: BranchConfig,
    sale: SaleRecord,
    options?: {
      safe?: Safe;
      deductions?: Array<{ item: InventoryItem; quantity: number }>;
      customer?: Customer;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const tenantId = branch.tenantId ? branch.tenantId.trim() : '';
    if (!tenantId) {
      return {
        success: false,
        error: 'يرجى تحديد معرف المتجر (Tenant ID) من إعدادات الفرع قبل البيع بالسحابة',
      };
    }

    const nowIso = new Date().toISOString();
    const branchCtx = { branchId: branch.id, branchName: branch.name, now: nowIso };

    // ── Read-Modify-Write: جلب الحالة الحالية من السحابة قبل الحساب ──
    const safeId = options?.safe?.id;
    const customerId = options?.customer?.id;
    const deductionIds = (options?.deductions || []).map(d => d.item.id).filter(Boolean);
    const imeiUnitIds = sale.items
      .map(item => item.imeiUnitId)
      .filter((id): id is string => Boolean(id));

    const freshSafes = safeId ? await this.fetchFreshRecords(branch, 'safes', [safeId]) : new Map();
    const freshCustomers = customerId ? await this.fetchFreshRecords(branch, 'customers', [customerId]) : new Map();
    const freshInventory = deductionIds.length > 0
      ? await this.fetchFreshRecords(branch, 'inventory', deductionIds)
      : new Map();
    const freshImei = imeiUnitIds.length > 0
      ? await this.fetchFreshRecords(branch, 'imeiUnits', imeiUnitIds)
      : new Map();

    // 1. Sale invoice — متوافقة 100% مع واجهة ديسكتوب ومحرك المزامنة
    let desktopPaymentMethod: 'cash' | 'card' | 'installment' = 'cash';
    const pmLower = String(sale.paymentMethod || '').toLowerCase();
    if (
      pmLower.includes('card') ||
      pmLower.includes('فيزا') ||
      pmLower.includes('بطاقة') ||
      pmLower.includes('instapay') ||
      pmLower.includes('إنستاباي') ||
      pmLower.includes('محفظة')
    ) {
      desktopPaymentMethod = 'card';
    } else if (
      pmLower.includes('installment') ||
      pmLower.includes('آجل') ||
      pmLower.includes('تقسيط') ||
      pmLower.includes('debt')
    ) {
      desktopPaymentMethod = 'installment';
    }

    const netTotal = Number(sale.finalTotal) || 0;
    const discountVal = Number(sale.discount || 0);
    const grossSubtotal = Number(sale.total) || (netTotal + discountVal);
    const paidVal = Number(sale.paidAmount ?? netTotal);
    const remainingVal = Number(sale.remainingAmount ?? Math.max(0, netTotal - paidVal));
    const resolvedCustomerId = sale.customerId || options?.customer?.id || '';
    const resolvedCustomerName =
      sale.customerName || options?.customer?.name || (resolvedCustomerId ? 'عميل مسجل' : 'عميل نقدي');
    const resolvedCustomerPhone = sale.customerPhone || options?.customer?.phone || '';

    const normalizedSaleItems = sale.items.map((it, idx) => {
      const invId = it.inventoryId || it.id || `item_${idx}`;
      const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
      const costPrice = Number(it.costPrice ?? it.cost ?? 0);
      const qty = Number(it.quantity) || 1;
      const lineTotal = Number(it.total ?? unitPrice * qty);

      return {
        id: it.id || `sale_item_${idx}`,
        inventoryId: invId,
        imeiUnitId: it.imeiUnitId || '',
        name: it.name,
        quantity: qty,
        unitPrice,
        costPrice,
        total: lineTotal,
        returnedQuantity: 0,
        imei: it.imei,
      };
    });

    const totalCost = normalizedSaleItems.reduce((acc, it) => acc + it.costPrice * it.quantity, 0);
    const finalProfit = totalCost > 0
      ? Math.max(0, netTotal - totalCost)
      : (sale.profit && sale.profit < netTotal ? sale.profit : 0);

    const recordsToPush: Array<{
      store: string;
      recordId: string;
      data: Record<string, unknown>;
      version?: number;
      isDelete?: boolean;
    }> = [];

    recordsToPush.push({
      store: 'sales',
      recordId: sale.id,
      data: normalizeRecord(
        'sales',
        {
          id: sale.id,
          invoiceNumber: sale.invoiceNumber,
          date: sale.date,
          createdAt: sale.createdAt || sale.date || nowIso,
          subtotal: grossSubtotal,
          discount: discountVal,
          total: netTotal, // في الديسكتوب: total هو الصافي بعد الخصم
          finalTotal: netTotal,
          paid: paidVal,
          paidAmount: paidVal,
          remaining: remainingVal,
          remainingAmount: remainingVal,
          profit: finalProfit,
          paymentMethod: desktopPaymentMethod,
          safeId: sale.safeId || safeId || '',
          safeName: sale.safeName || options?.safe?.name || 'الخزينة الرئيسية',
          cashierId: 'mobile_pos',
          cashierName: sale.cashierName || 'كاشير الموبايل',
          customerId: resolvedCustomerId,
          customerName: resolvedCustomerName,
          customerPhone: resolvedCustomerPhone,
          items: normalizedSaleItems,
          notes: sale.notes || `فاتورة مبيعات من تطبيق الموبايل (${branch.name})`,
        },
        { ...branchCtx, id: sale.id }
      ),
    });

    // 2. Safe balance and cash transaction
    const cashCollected = Number(sale.paidAmount ?? sale.finalTotal) || 0;
    if (cashCollected > 0 && options?.safe) {
      // الرصيد الجديد يُحسب من آخر نسخة سحابية (وليس الكاش المحلي)
      const freshSafe = freshSafes.get(options.safe.id);
      const { merged: baseSafe, version: safeVersion } = this.applyFreshData(
        options.safe as any,
        freshSafe,
        ['balance']
      );
      recordsToPush.push({
        store: 'safes',
        recordId: options.safe.id,
        version: safeVersion,
        data: normalizeRecord(
          'safes',
          { ...baseSafe, balance: (Number(baseSafe.balance) || 0) + cashCollected },
          { ...branchCtx, id: options.safe.id }
        ),
      });

      const txId = `tx_sale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      recordsToPush.push({
        store: 'transactions',
        recordId: txId,
        data: normalizeRecord(
          'transactions',
          {
            id: txId,
            type: 'sale',
            amount: cashCollected,
            safeId: options.safe.id,
            safeName: options.safe.name,
            referenceId: sale.id,
            description: `مبيعات فاتورة #${sale.invoiceNumber || sale.id.slice(0, 8)}`,
            // 🔴 مهم: الديسكتوب بيفلتر التقارير بـcreatedAt
            createdAt: sale.createdAt || sale.date || nowIso,
            date: sale.createdAt || sale.date || nowIso,
            userName: sale.cashierName || 'كاشير الموبايل',
          },
          { ...branchCtx, id: txId }
        ),
      });
    }

    // 3. Inventory deduction
    if (options?.deductions && options.deductions.length > 0) {
      for (const d of options.deductions) {
        // الخصم من الكمية السحابية الحالية (وليس الكاش القديم)
        const freshItem = freshInventory.get(d.item.id);
        const { merged: baseItem, version: itemVersion } = this.applyFreshData(
          d.item as any,
          freshItem,
          ['quantity']
        );
        const newQty = Math.max(0, (Number(baseItem.quantity) || 0) - d.quantity);
        recordsToPush.push({
          store: 'inventory',
          recordId: d.item.id,
          version: itemVersion,
          data: normalizeRecord(
            'inventory',
            { ...baseItem, quantity: newQty, updatedAt: nowIso },
            { ...branchCtx, id: d.item.id }
          ),
        });
      }
    }

    // 4. Mark sold IMEI units (وإلا تفضل "متاحة" في الديسكتوب)
    if (imeiUnitIds.length > 0) {
      const localUnits = this.metricsCache.get(branch.id)?.metrics.imeiUnitsList || [];
      for (const unitId of imeiUnitIds) {
        const freshUnit = freshImei.get(unitId);
        const cachedUnit = localUnits.find(unit => unit.id === unitId);
        const baseUnit = freshUnit?.data || (cachedUnit as unknown as Record<string, unknown> | undefined);
        if (!baseUnit) continue;

        recordsToPush.push({
          store: 'imeiUnits',
          recordId: unitId,
          version: freshUnit?.version,
          data: normalizeRecord(
            'imeiUnits',
            {
              ...baseUnit,
              id: unitId,
              status: 'sold',
              saleId: sale.id,
              customerId: resolvedCustomerId,
              sellPrice: Number(sale.finalTotal) || Number(baseUnit.sellPrice) || 0,
              updatedAt: nowIso,
            },
            { ...branchCtx, id: unitId }
          ),
        });
      }
    }

    // 5. Customer & debt
    if (options?.customer) {
      const freshCustomer = freshCustomers.get(options.customer.id);
      const { merged: baseCustomer, version: customerVersion } = this.applyFreshData(
        options.customer as any,
        freshCustomer,
        ['balance']
      );
      const newCustomerBalance =
        (Number(baseCustomer.balance) || 0) + Math.max(0, remainingVal);
      recordsToPush.push({
        store: 'customers',
        recordId: options.customer.id,
        version: customerVersion,
        data: normalizeRecord(
          'customers',
          {
            ...baseCustomer,
            name: baseCustomer.name || options.customer.name,
            phone: baseCustomer.phone || options.customer.phone,
            balance: newCustomerBalance,
          },
          { ...branchCtx, id: options.customer.id }
        ),
      });
    }

    return await this.pushRecordsToBranch(branch, recordsToPush);
  }

  /**
   * Submits a financial transaction (Expense or Cash Inflow) from Mobile.
   */
  public async submitTransaction(
    branch: BranchConfig,
    tx: {
      type: 'expense' | 'deposit';
      amount: number;
      safe: Safe;
      description: string;
      category?: string;
      userName?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const isOutflow = tx.type === 'expense';
    const amountVal = Math.abs(Number(tx.amount) || 0);
    const tenantId = branch.tenantId ? branch.tenantId.trim() : '';
    if (!tenantId) {
      return {
        success: false,
        error: 'يرجى تحديد معرف المتجر (Tenant ID) من إعدادات الفرع قبل إرسال معاملات الخزينة للسحابة',
      };
    }

    // رصيد الخزنة يُحسب من آخر نسخة سحابية — لا من الكاش المحلي
    const freshSafeMap = await this.fetchFreshRecords(branch, 'safes', [tx.safe.id]);
    const freshSafe = freshSafeMap.get(tx.safe.id);
    const { merged: baseSafe, version: safeVersion } = this.applyFreshData(
      tx.safe as any,
      freshSafe,
      ['balance']
    );
    const newSafeBalance = (Number(baseSafe.balance) || 0) + (isOutflow ? -amountVal : amountVal);
    const branchCtx = { branchId: branch.id, branchName: branch.name, now: nowIso };

    // 🔴 FIX: `deposit` مش نوع موجود في الديسكتوب — normalizeRecord بيحوله
    // لـ`capital`، وحركات المصروف بتتسجل بقيمة سالبة (-amountVal) لمطابقة الديسكتوب
    const txAmountForLedger = isOutflow ? -amountVal : amountVal;
    const records = [
      {
        store: 'transactions',
        recordId: txId,
        data: normalizeRecord(
          'transactions',
          {
            id: txId,
            type: tx.type,
            amount: txAmountForLedger,
            safeId: tx.safe.id,
            safeName: tx.safe.name,
            description: tx.description,
            category: tx.category || (isOutflow ? 'مصروفات عامة' : 'إيداع نقدي'),
            createdAt: nowIso,
            date: nowIso,
            userId: 'mobile_pos',
            userName: tx.userName || 'تطبيق الموبايل',
          },
          { ...branchCtx, id: txId }
        ),
      },
      {
        store: 'safes',
        recordId: tx.safe.id,
        version: safeVersion,
        data: normalizeRecord(
          'safes',
          { ...baseSafe, balance: newSafeBalance },
          { ...branchCtx, id: tx.safe.id }
        ),
      },
    ];

    return await this.pushRecordsToBranch(branch, records);
  }

  /**
   * Submits or updates a maintenance repair ticket from Mobile.
   */
  public async submitMaintenanceOrder(
    branch: BranchConfig,
    order: MaintenanceOrder,
    safeForDeposit?: Safe
  ): Promise<{ success: boolean; error?: string }> {
    const nowIso = new Date().toISOString();
    const finalAmount = Number(order.finalPrice || order.expectedPrice || 0);
    const costPrice = Number(order.costPrice || 0);
    const profit = Math.max(0, finalAmount - costPrice);
    const branchCtx = { branchId: branch.id, branchName: branch.name, now: nowIso };

    // Map status for desktop compatibility (desktop uses: received, in_progress, completed, delivered, cancelled)
    let desktopStatus: 'received' | 'in_progress' | 'completed' | 'delivered' | 'cancelled' = 'received';
    if (order.status === 'delivered') desktopStatus = 'delivered';
    else if (order.status === 'ready' || order.status === 'completed') desktopStatus = 'completed';
    else if (order.status === 'repairing' || order.status === 'inspecting') desktopStatus = 'in_progress';
    else if (order.status === 'cancelled') desktopStatus = 'cancelled';

    let safeToUse = safeForDeposit;
    if (!safeToUse && order.status === 'delivered' && order.safeId) {
      try {
        const freshSafeMap = await this.fetchFreshRecords(branch, 'safes', [order.safeId]);
        const fetched = freshSafeMap.get(order.safeId);
        if (fetched?.data) {
          safeToUse = {
            id: order.safeId,
            name: fetched.data.name || 'الخزينة',
            type: fetched.data.type || 'cash',
            balance: Number(fetched.data.balance) || 0,
            branchId: branch.id,
            branchName: branch.name,
          };
        }
      } catch {
        // Fallback silently if fetch fails
      }
    }

    const maintenanceData = normalizeRecord(
      'maintenance',
      {
        ...order,
        deviceType: order.deviceType || order.deviceModel || 'جهاز صيانة',
        deviceModel: order.deviceModel || order.deviceType || 'جهاز صيانة',
        problem: order.problem || 'صيانة عامة',
        diagnosis: order.diagnosis || order.problem || 'فحص وإصلاح',
        status: desktopStatus,
        estimatedCost: Number(order.expectedPrice || order.finalPrice || 0),
        finalCost: finalAmount,
        collectedAmount: order.status === 'delivered' ? finalAmount : 0,
        costPrice,
        profit: order.status === 'delivered' ? profit : 0,
        receivedAt: order.receivedDate || order.receivedAt || nowIso,
        receivedDate: order.receivedDate || order.receivedAt || nowIso,
        deliveredAt: order.status === 'delivered' ? (order.deliveryDate || order.deliveredAt || nowIso) : '',
        deliveryDate: order.status === 'delivered' ? (order.deliveryDate || order.deliveredAt || nowIso) : '',
        safeId: safeToUse ? safeToUse.id : (order.safeId || ''),
        createdAt: (order as any).createdAt || nowIso,
      },
      { ...branchCtx, id: order.id }
    );

    const records: Array<{
      store: string;
      recordId: string;
      data: Record<string, unknown>;
      version?: number;
    }> = [
      {
        store: 'maintenance',
        recordId: order.id,
        data: maintenanceData,
      },
    ];

    // If order was delivered and finalPrice was collected into a safe:
    if (order.status === 'delivered' && finalAmount > 0 && safeToUse) {
      const freshSafeMap = await this.fetchFreshRecords(branch, 'safes', [safeToUse.id]);
      const freshSafe = freshSafeMap.get(safeToUse.id);
      const { merged: baseSafe, version: safeVersion } = this.applyFreshData(
        safeToUse as any,
        freshSafe,
        ['balance']
      );

      const newBal = (Number(baseSafe.balance) || 0) + finalAmount;
      const txId = `tx_maint_${Date.now()}`;

      records.push(
        {
          store: 'safes',
          recordId: safeToUse.id,
          version: safeVersion,
          data: normalizeRecord(
            'safes',
            { ...baseSafe, balance: newBal },
            { ...branchCtx, id: safeToUse.id }
          ),
        },
        {
          store: 'transactions',
          recordId: txId,
          data: normalizeRecord(
            'transactions',
            {
              id: txId,
              type: 'maintenance',
              amount: finalAmount,
              safeId: safeToUse.id,
              safeName: safeToUse.name,
              referenceId: order.id,
              description: `إيراد تسليم صيانة #${order.ticketNumber || order.id.slice(0, 8)} (${order.deviceModel})`,
              category: 'صيانة',
              createdAt: nowIso, // الديسكتوب بيفلتر التقارير بـcreatedAt
              date: nowIso,
              userId: 'mobile_pos',
              userName: 'تطبيق الموبايل',
            },
            { ...branchCtx, id: txId }
          ),
        }
      );
    }

    return await this.pushRecordsToBranch(branch, records);
  }

  /**
   * يضمن وجود قسم (Category) للمنتج القادم من الموبايل.
   * بيرجع `categoryId` الموجود أو المنشأ حديثاً.
   */
  private async resolveCategoryForItem(
    branch: BranchConfig,
    name: string,
    hasIMEI: boolean
  ): Promise<{ categoryId: string; categoryRecord?: { id: string; name: string; type: string } }> {
    const cleanName = name.trim();
    if (!cleanName) return { categoryId: '' };

    const client = this.getClient(branch);
    const tenantId = branch.tenantId ? branch.tenantId.trim() : '';
    if (!client || !tenantId) return { categoryId: '' };

    try {
      const { data } = await client
        .from('mobpos_records')
        .select('record_id, data')
        .eq('tenant_id', tenantId)
        .eq('store', 'categories')
        .is('deleted_at', null)
        .limit(500);

      const rows = (data || []) as Array<{ record_id?: string; data?: any }>;
      const match = rows.find(row => String(row.data?.name || '').trim() === cleanName);
      if (match) {
        return { categoryId: match.record_id || match.data?.id || '' };
      }

      const categoryRecord = {
        id: `cat_mobile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        type: hasIMEI ? 'device' : 'accessory',
      };
      return { categoryId: categoryRecord.id, categoryRecord };
    } catch (err) {
      console.warn('[MultiBranch] Could not resolve product category:', err);
      return { categoryId: '' };
    }
  }

  /**
   * Creates or updates a product in inventory from Mobile.
   */
  public async submitInventoryItem(
    branch: BranchConfig,
    item: InventoryItem
  ): Promise<{ success: boolean; error?: string }> {
    const nowIso = new Date().toISOString();
    const hasIMEI = Boolean(item.hasIMEI ?? item.hasImei);
    const categoryName = String(item.category || '').trim();

    let categoryId = String(item.categoryId || '').trim();
    let categoryRecord: { id: string; name: string; type: string } | undefined;
    if (!categoryId && categoryName) {
      const resolved = await this.resolveCategoryForItem(branch, categoryName, hasIMEI);
      categoryId = resolved.categoryId;
      categoryRecord = resolved.categoryRecord;
    }

    const records: Array<{ store: string; recordId: string; data: Record<string, unknown> }> = [];

    if (categoryRecord) {
      records.push({
        store: 'categories',
        recordId: categoryRecord.id,
        data: normalizeRecord('categories', categoryRecord, {
          id: categoryRecord.id,
          branchId: branch.id,
          branchName: branch.name,
          now: nowIso,
        }),
      });
    }

    records.push({
      store: 'inventory',
      recordId: item.id,
      data: normalizeRecord(
        'inventory',
        {
          ...item,
          hasIMEI,
          categoryId,
          category: categoryName,
          createdAt: item.createdAt || nowIso,
          updatedAt: nowIso,
        },
        { id: item.id, branchId: branch.id, branchName: branch.name, now: nowIso }
      ),
    });

    return await this.pushRecordsToBranch(branch, records);
  }
}

export const multiBranchManager = new MultiBranchManager();
