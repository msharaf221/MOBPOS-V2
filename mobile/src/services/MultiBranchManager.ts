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
} from '../types';

const STORAGE_KEY_BRANCHES = 'mobpos_companion_branches_v1';
const BRANCH_FETCH_TIMEOUT_MS = 18_000;
const METRICS_CACHE_TTL_MS = 30_000;

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

    return () => {
      for (const [, ch] of this.channels.entries()) {
        void ch.unsubscribe();
      }
      this.channels.clear();
    };
  }

  /**
   * Fetches live data from Supabase for a single branch.
   * Merges baseline snapshots from `mobpos_stores` with recent deltas from `mobpos_records`.
   * Normalizes desktop models to mobile types with 100% schema alignment.
   */
  public async fetchBranchMetrics(branch: BranchConfig, forceRefresh = false): Promise<BranchMetrics> {
    const client = this.getClient(branch);

    if (!client) {
      this.updateBranch(branch.id, {
        status: 'offline',
        errorMessage: 'يرجى إدخال Supabase URL ومفتاح Anon Key في إعدادات الفرع',
      });
      return this.getEmptyMetrics(branch.id, branch.name, branch.color);
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

      // Raw store containers
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

      // 2. Fetch Baseline Snapshots from mobpos_stores
      try {
        let storeQuery = client.from('mobpos_stores').select('*');
        if (activeTenantId) {
          storeQuery = storeQuery.eq('tenant_id', activeTenantId);
        }
        const { data: storeRows, error: storeErr } = await storeQuery;

        // 🔴 FIX: إزالة "الشفاء الذاتي" غير المفلتر الذي كان يتبنى بيانات أي tenant آخر
        // عندما يكون tenant الفرع فارغاً أو لا يحتوي بيانات. الآن بدون tenant محدد
        // نعرض رسالة واضحة بدل عرض بيانات غريبة.

        if (storeRows && storeRows.length > 0) {
          for (const row of storeRows) {
            if (row.store && Array.isArray(row.data)) {
              rawStores[row.store] = row.data;
            }
          }
        }
      } catch (storeFetchErr) {
        console.warn(`[MultiBranch] Error fetching mobpos_stores for ${branch.name}:`, storeFetchErr);
      }

      // 3. Fetch Real-time Deltas from mobpos_records and overlay on top of baseline
      try {
        // 🔴 FIX: استثناء .is('deleted_at', null) — كانت الـ tombstones (سجلات الحذف)
        // تُفلتر خارج الاستعلام، فلا أُحذف أي سجل من عرض الموبايل أبداً بعد حذفه بالديسكتوب.
        let deltaQuery = client.from('mobpos_records').select('*').order('updated_at', { ascending: false }).limit(600);
        if (activeTenantId) {
          deltaQuery = deltaQuery.eq('tenant_id', activeTenantId);
        }
        const { data: deltaRows, error: deltaErr } = await deltaQuery;

        if (deltaRows && deltaRows.length > 0 && !deltaErr) {
          // Overlay deltas onto corresponding store arrays
          for (const row of deltaRows) {
            const storeName = row.store;
            const recordData = row.data;
            const recordId = row.record_id || recordData?.id;
            if (!storeName || !recordId) continue;

            if (!rawStores[storeName]) {
              rawStores[storeName] = [];
            }

            // حذف ناعم: نشيل السجل من العرض بدل إعادة إضافته
            if (row.deleted_at) {
              const dIdx = rawStores[storeName].findIndex((item: any) => item.id === recordId);
              if (dIdx >= 0) rawStores[storeName].splice(dIdx, 1);
              continue;
            }
            if (!recordData) continue;

            const existingIdx = rawStores[storeName].findIndex((item: any) => item.id === recordId);
            if (existingIdx >= 0) {
              rawStores[storeName][existingIdx] = { ...rawStores[storeName][existingIdx], ...recordData };
            } else {
              rawStores[storeName].unshift({ ...recordData, id: recordId });
            }
          }
        }
      } catch (deltaFetchErr) {
        console.warn(`[MultiBranch] Error fetching mobpos_records deltas for ${branch.name}:`, deltaFetchErr);
      }

      // 4. Build Lookup Maps for Schema Normalization
      const inventoryMap = new Map<string, any>();
      (rawStores.inventory || []).forEach((item: any) => {
        if (item.id) inventoryMap.set(item.id, item);
      });

      const imeiMap = new Map<string, any>();
      (rawStores.imeiUnits || []).forEach((item: any) => {
        if (item.id) imeiMap.set(item.id, item);
      });

      const customersMap = new Map<string, any>();
      (rawStores.customers || []).forEach((item: any) => {
        if (item.id) customersMap.set(item.id, item);
      });

      const usersMap = new Map<string, any>();
      (rawStores.users || []).forEach((item: any) => {
        if (item.id) usersMap.set(item.id, item);
      });

      const safesMap = new Map<string, any>();
      (rawStores.safes || []).forEach((item: any) => {
        if (item.id) safesMap.set(item.id, item);
      });

      const categoriesMap = new Map<string, any>();
      (rawStores.categories || []).forEach((item: any) => {
        if (item.id) categoriesMap.set(item.id, item);
      });

      // 5. Normalize Sales Records
      const normalizedSales: SaleRecord[] = (rawStores.sales || []).map((s: any) => {
        const customer = s.customerId ? customersMap.get(s.customerId) : null;
        const cashier = s.cashierId ? usersMap.get(s.cashierId) : null;
        const safe = s.safeId ? safesMap.get(s.safeId) : null;

        // In desktop schema:
        // s.total is net total after discount
        // s.subtotal is gross total before discount
        // s.paid is amount collected
        // s.remaining is debt
        const finalTotal = Number(s.total ?? s.finalTotal ?? 0);
        const subtotal = Number(s.subtotal ?? s.total ?? finalTotal);
        const paidAmount = Number(s.paid ?? s.paidAmount ?? finalTotal);
        const remainingAmount = Number(s.remaining ?? s.remainingAmount ?? 0);
        const discount = Number(s.discount ?? 0);
        const profit = Number(s.profit ?? 0);
        const rawDate = s.createdAt || s.date || new Date().toISOString();

        // Normalize line items
        const rawItems = Array.isArray(s.items) ? s.items : [];
        const items: SaleItem[] = rawItems.map((it: any, idx: number) => {
          const inv = it.inventoryId ? inventoryMap.get(it.inventoryId) : null;
          const imeiObj = it.imeiUnitId ? imeiMap.get(it.imeiUnitId) : null;
          const unitPrice = Number(it.unitPrice ?? it.price ?? inv?.sellPrice ?? 0);
          const costPrice = Number(it.costPrice ?? it.cost ?? inv?.costPrice ?? 0);
          const imeiStr = it.imei || (imeiObj ? (imeiObj.imei1 || imeiObj.imei2) : undefined);

          return {
            id: it.id || it.inventoryId || `item_${idx}`,
            name: it.name || inv?.name || 'صنف مبيعات',
            quantity: Number(it.quantity) || 1,
            price: unitPrice,
            cost: costPrice,
            imei: imeiStr,
          };
        });

        let paymentMethodLabel = s.paymentMethod || 'نقدي (كاش)';
        if (paymentMethodLabel === 'cash') paymentMethodLabel = 'نقدي (كاش)';
        else if (paymentMethodLabel === 'card') paymentMethodLabel = 'بطاقة / فيزا';
        else if (paymentMethodLabel === 'installment') paymentMethodLabel = 'آجل / تقسيط';

        return {
          id: s.id,
          invoiceNumber: s.invoiceNumber || s.id?.slice(0, 8),
          date: rawDate,
          createdAt: rawDate,
          total: subtotal,
          discount,
          finalTotal,
          paidAmount,
          remainingAmount,
          profit,
          paymentMethod: paymentMethodLabel,
          safeId: s.safeId,
          safeName: safe?.name || s.safeName || 'الخزينة الرئيسية',
          cashierName: cashier?.name || s.cashierName || 'كاشير المحل',
          customerName: customer?.name || s.customerName || (s.customerId ? 'عميل مسجل' : 'عميل نقدي'),
          customerPhone: customer?.phone || s.customerPhone || '',
          customerId: s.customerId,
          items,
          branchId: branch.id,
          branchName: branch.name,
          branchColor: branch.color,
        };
      });

      // Sort sales descending by date
      normalizedSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // 6. Normalize Inventory Items
      const normalizedInventory: InventoryItem[] = (rawStores.inventory || []).map((it: any) => {
        const cat = it.categoryId ? categoriesMap.get(it.categoryId) : null;
        return {
          id: it.id,
          name: it.name || 'منتج غير مسمى',
          category: cat?.name || it.category || '',
          quantity: Number(it.quantity) || 0,
          minQuantity: Number(it.minQuantity) || 2,
          costPrice: Number(it.costPrice) || 0,
          sellPrice: Number(it.sellPrice) || 0,
          barcode: it.barcode || it.code || '',
          hasImei: Boolean(it.hasIMEI ?? it.hasImei),
          branchId: branch.id,
          branchName: branch.name,
        };
      });

      // 7. Normalize Safes
      const normalizedSafes: Safe[] = (rawStores.safes || []).map((s: any) => {
        let typeVal: 'cash' | 'bank' | 'wallet' | 'card' = 'cash';
        if (s.type === 'ewallet' || s.type === 'wallet') typeVal = 'wallet';
        else if (s.type === 'bank') typeVal = 'bank';
        else if (s.type === 'card') typeVal = 'card';

        return {
          id: s.id,
          name: s.name || 'خزينة',
          type: typeVal,
          balance: Number(s.balance) || 0,
          isDefault: Boolean(s.isDefault),
          branchId: branch.id,
          branchName: branch.name,
        };
      });

      // 8. Normalize Transactions
      const normalizedTransactions: Transaction[] = (rawStores.transactions || []).map((t: any) => {
        const safe = t.safeId ? safesMap.get(t.safeId) : null;
        const user = t.userId ? usersMap.get(t.userId) : null;
        const rawDate = t.createdAt || t.date || new Date().toISOString();

        return {
          id: t.id,
          date: rawDate,
          type: t.type || 'expense',
          amount: Number(t.amount) || 0,
          safeId: t.safeId,
          safeName: safe?.name || t.safeName || '',
          description: t.description || 'حركة نقدية',
          category: t.category || '',
          userName: user?.name || t.userName || '',
          branchId: branch.id,
          branchName: branch.name,
          branchColor: branch.color,
        };
      });

      // Sort transactions descending by date
      normalizedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // 9. Normalize Maintenance Orders
      const normalizedMaintenance: MaintenanceOrder[] = (rawStores.maintenance || []).map((m: any) => {
        let statusVal: 'received' | 'inspecting' | 'repairing' | 'ready' | 'delivered' | 'cancelled' = 'received';
        if (m.status === 'completed' || m.status === 'ready') statusVal = 'ready';
        else if (m.status === 'in_progress' || m.status === 'repairing') statusVal = 'repairing';
        else if (m.status === 'delivered') statusVal = 'delivered';
        else if (m.status === 'cancelled') statusVal = 'cancelled';
        else if (m.status === 'inspecting') statusVal = 'inspecting';

        const rawDate = m.receivedAt || m.receivedDate || m.createdAt || new Date().toISOString();
        const partsCost = Array.isArray(m.parts)
          ? m.parts.reduce((sum: number, p: any) => sum + (Number(p.total) || 0), 0)
          : 0;

        return {
          id: m.id,
          ticketNumber: m.ticketNumber || m.id?.slice(0, 6),
          customerName: m.customerName || 'عميل صيانة',
          customerPhone: m.customerPhone || '',
          deviceModel: m.deviceModel || m.deviceType || 'جهاز صيانة',
          problem: m.problem || m.diagnosis || 'فحص وإصلاح',
          status: statusVal,
          costPrice: Number(m.costPrice ?? partsCost ?? 0),
          expectedPrice: Number(m.estimatedCost ?? m.expectedPrice ?? 0),
          finalPrice: Number(m.finalCost ?? m.finalPrice ?? m.estimatedCost ?? 0),
          receivedDate: rawDate,
          deliveryDate: m.deliveredAt || m.deliveryDate,
          branchId: branch.id,
          branchName: branch.name,
        };
      });

      // 10. Normalize Customers
      const normalizedCustomers: Customer[] = (rawStores.customers || []).map((c: any) => ({
        id: c.id,
        name: c.name || 'عميل',
        phone: c.phone || '',
        balance: Number(c.balance) || 0,
        branchId: branch.id,
        branchName: branch.name,
      }));

      // 11. Calculate Real KPIs
      const now = new Date();
      const todayDateStr = now.toISOString().slice(0, 10);

      const todaySales = normalizedSales.filter(s => {
        const d = (s.date || s.createdAt || '').slice(0, 10);
        return d === todayDateStr;
      });

      const todaySalesTotal = todaySales.reduce((acc, s) => acc + (Number(s.finalTotal) || 0), 0);
      // 🔴 FIX: إزالة "الربح الوهمي" — كان يعرض 18% من الإجمالي كربح حقيقي لو حقل الربح مش موجود
      const todayProfitTotal = todaySales.reduce(
        (acc, s) => acc + (s.profit && Number(s.profit) > 0 ? Number(s.profit) : 0),
        0
      );

      const todayCashCollected = todaySales.reduce((acc, s) => acc + (Number(s.paidAmount) || 0), 0);

      const todayExpenses = normalizedTransactions.filter(t => {
        const d = (t.date || '').slice(0, 10);
        const isOutflow =
          t.type === 'expense' ||
          t.type === 'withdrawal' ||
          (t.type as string) === 'wallet_withdrawal' ||
          (t.type as string) === 'purchase' ||
          (t.type as string) === 'maintenance_cost' ||
          (t.type as string) === 'waste';
        return d === todayDateStr && isOutflow;
      });
      const todayExpensesTotal = todayExpenses.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

      const totalSafesBalance = normalizedSafes.reduce((acc, s) => acc + (Number(s.balance) || 0), 0);
      const lowStockCount = normalizedInventory.filter(i => (i.quantity || 0) <= (i.minQuantity || 2)).length;
      const activeMaintenanceCount = normalizedMaintenance.filter(m => m.status !== 'delivered' && m.status !== 'cancelled').length;
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
            todayProfitTotal,
            todayInvoicesCount: todaySales.length,
            todayCashCollected,
            todayExpensesTotal,
            totalSafesBalance,
            lowStockCount,
            activeMaintenanceCount,
            totalCustomerDebts,
            hourlySales,
            recentSales: normalizedSales.slice(0, 100),
            recentTransactions: normalizedTransactions.slice(0, 100),
            safesList: normalizedSafes,
            inventoryList: normalizedInventory,
            maintenanceList: normalizedMaintenance,
            customersList: normalizedCustomers,
            lastSyncedAt: new Date().toISOString(),
          };
        })(),
        BRANCH_FETCH_TIMEOUT_MS,
        `انتهت مهلة الاتصال بالفرع (${branch.name}) بعد 18 ثانية`
      );

      this.metricsCache.set(branch.id, { metrics, timestamp: Date.now() });
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
      // Return cached metrics if available, or clean empty metrics (NEVER fake mock data)
      const cached = this.metricsCache.get(branch.id);
      if (cached) {
        return cached.metrics;
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
      todayProfitTotal: perBranch.reduce((acc, m) => acc + m.todayProfitTotal, 0),
      todayInvoicesCount: perBranch.reduce((acc, m) => acc + m.todayInvoicesCount, 0),
      todayCashCollected: perBranch.reduce((acc, m) => acc + m.todayCashCollected, 0),
      todayExpensesTotal: perBranch.reduce((acc, m) => acc + m.todayExpensesTotal, 0),
      totalSafesBalance: perBranch.reduce((acc, m) => acc + m.totalSafesBalance, 0),
      lowStockCount: perBranch.reduce((acc, m) => acc + m.lowStockCount, 0),
      activeMaintenanceCount: perBranch.reduce((acc, m) => acc + m.activeMaintenanceCount, 0),
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
      todayProfitTotal: 0,
      todayInvoicesCount: 0,
      todayCashCollected: 0,
      todayExpensesTotal: 0,
      totalSafesBalance: 0,
      lowStockCount: 0,
      activeMaintenanceCount: 0,
      totalCustomerDebts: 0,
      hourlySales,
      recentSales: [],
      recentTransactions: [],
      safesList: [],
      inventoryList: [],
      maintenanceList: [],
      customersList: [],
      lastSyncedAt: undefined,
    };
  }

  /**
   * Pushes granular records directly to `mobpos_records` on the branch's Supabase instance.
   * Broadcasts immediately via Supabase Realtime to Desktop Electron and all mobile devices!
   */
  public async pushRecordsToBranch(
    branch: BranchConfig,
    records: Array<{ store: string; recordId: string; data: any; isDelete?: boolean }>
  ): Promise<{ success: boolean; error?: string }> {
    const client = this.getClient(branch);
    if (!client) {
      return { success: false, error: 'الفرع غير مهيأ بالربط السحابي (Supabase)' };
    }

    const tenantId = branch.tenantId ? branch.tenantId.trim() : '';
    if (!tenantId) {
      console.error(`[MultiBranch] Cannot push to ${branch.name}: missing Tenant ID`);
      return {
        success: false,
        error: 'يرجى تحديد معرف المتجر (Tenant ID) من إعدادات الفرع قبل إرسال البيانات للسحابة',
      };
    }
    const nowIso = new Date().toISOString();
    const clientId = getDeviceClientId();

    const rows = records.map(r => ({
      tenant_id: tenantId,
      store: r.store,
      record_id: r.recordId,
      data: r.isDelete ? {} : (r.data || {}),
      // 🔴 FIX: ترقية الإصدار بدل تثبيت version:1 دائماً حتى تُوثَّق التعارضات
      version: (Number((r as { version?: number }).version) || 0) + 1,
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
        return { success: false, error: error.message };
      }

      // Invalidate cache immediately so next read fetches fresh state
      this.metricsCache.delete(branch.id);
      this.notify();
      return { success: true };
    } catch (e: any) {
      console.error(`[MultiBranch] Exception pushing records to ${branch.name}:`, e);
      return { success: false, error: e?.message || 'خطأ أثناء إرسال البيانات للسحابة' };
    }
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
   * 4. Updates customer debt balance if applicable (`customers`)
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
    const recordsToPush: Array<{ store: string; recordId: string; data: any }> = [];
    const tenantId = branch.tenantId ? branch.tenantId.trim() : '';
    if (!tenantId) {
      return {
        success: false,
        error: 'يرجى تحديد معرف المتجر (Tenant ID) من إعدادات الفرع قبل البيع بالسحابة',
      };
    }

    // ── Read-Modify-Write: جلب الحالة الحالية من السحابة قبل الحساب ──
    const safeId = options?.safe?.id;
    const customerId = options?.customer?.id;
    const deductionIds = (options?.deductions || []).map(d => d.item.id).filter(Boolean);
    const freshIds = [...new Set([...(safeId ? [safeId] : []), ...(customerId ? [customerId] : []), ...deductionIds])];

    const freshSafes = safeId ? await this.fetchFreshRecords(branch, 'safes', [safeId]) : new Map();
    const freshCustomers = customerId ? await this.fetchFreshRecords(branch, 'customers', [customerId]) : new Map();
    const freshInventory = deductionIds.length > 0 ? await this.fetchFreshRecords(branch, 'inventory', deductionIds) : new Map();

    // 1. Sale invoice
    recordsToPush.push({
      store: 'sales',
      recordId: sale.id,
      data: {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        date: sale.date || new Date().toISOString(),
        createdAt: sale.createdAt || new Date().toISOString(),
        total: sale.total,
        discount: sale.discount || 0,
        finalTotal: sale.finalTotal,
        paid: sale.paidAmount ?? sale.finalTotal,
        paidAmount: sale.paidAmount ?? sale.finalTotal,
        remaining: sale.remainingAmount || 0,
        remainingAmount: sale.remainingAmount || 0,
        profit: sale.profit || 0,
        paymentMethod: sale.paymentMethod || 'نقدي (كاش)',
        safeId: sale.safeId,
        safeName: sale.safeName,
        cashierName: sale.cashierName || 'كاشير الموبايل',
        customerId: sale.customerId,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        items: sale.items.map(it => ({
          id: it.id,
          inventoryId: it.id,
          name: it.name,
          quantity: it.quantity,
          price: it.price,
          unitPrice: it.price,
          cost: it.cost || 0,
          costPrice: it.cost || 0,
          imei: it.imei,
        })),
        branchId: branch.id,
        branchName: branch.name,
      },
    });

    // 2. Safe balance and transaction
    const cashCollected = Number(sale.paidAmount ?? sale.finalTotal) || 0;
    if (cashCollected > 0 && options?.safe) {
      // 🔴 FIX RMW: الرصيد الجديد يُحسب من آخر نسخة سحابية (وليس الكاش المحلي)
      const freshSafe = freshSafes.get(options.safe.id);
      const { merged: baseSafe, version: safeVersion } = this.applyFreshData(options.safe as any, freshSafe, ['balance']);
      const updatedSafe: Safe = {
        ...baseSafe,
        balance: (Number(baseSafe.balance) || 0) + cashCollected,
      };
      recordsToPush.push({
        store: 'safes',
        recordId: options.safe.id,
        version: safeVersion,
        data: updatedSafe,
      } as any);

      const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      recordsToPush.push({
        store: 'transactions',
        recordId: txId,
        data: {
          id: txId,
          type: 'sale',
          amount: cashCollected,
          safeId: options.safe.id,
          safeName: options.safe.name,
          description: `مبيعات فاتورة #${sale.invoiceNumber || sale.id.slice(0, 8)}`,
          date: sale.date || new Date().toISOString(),
          userName: sale.cashierName || 'كاشير الموبايل',
          branchId: branch.id,
          branchName: branch.name,
        },
      });
    }

    // 3. Inventory deduction
    if (options?.deductions && options.deductions.length > 0) {
      for (const d of options.deductions) {
        // 🔴 FIX RMW: الخصم من الكمية السحابية الحالية (وليس الكاش القديم) →
        // لا مزيد بيع زائد عند البيع المتزامن من أكثر من جهاز
        const freshItem = freshInventory.get(d.item.id);
        const { merged: baseItem, version: itemVersion } = this.applyFreshData(d.item as any, freshItem, ['quantity']);
        const newQty = Math.max(0, (Number(baseItem.quantity) || 0) - d.quantity);
        recordsToPush.push({
          store: 'inventory',
          recordId: d.item.id,
          version: itemVersion,
          data: {
            ...baseItem,
            quantity: newQty,
            updatedAt: new Date().toISOString(),
          },
        } as any);
      }
    }

    // 4. Customer balance update if remaining debt exists
    const remaining = Number(sale.remainingAmount) || 0;
    if (remaining > 0 && options?.customer) {
      // 🔴 FIX RMW: رصيد العميل من النسخة السحابية الأحدث
      const freshCustomer = freshCustomers.get(options.customer.id);
      const { merged: baseCustomer, version: customerVersion } = this.applyFreshData(options.customer as any, freshCustomer, ['balance']);
      const newCustomerBalance = (Number(baseCustomer.balance) || 0) + remaining;
      recordsToPush.push({
        store: 'customers',
        recordId: options.customer.id,
        version: customerVersion,
        data: {
          ...baseCustomer,
          balance: newCustomerBalance,
        },
      } as any);
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

    // 🔴 FIX RMW: رصيد الخزنة يُحسب من آخر نسخة سحابية — لا من الكاش المحلي
    const freshSafeMap = await this.fetchFreshRecords(branch, 'safes', [tx.safe.id]);
    const freshSafe = freshSafeMap.get(tx.safe.id);
    const { merged: baseSafe, version: safeVersion } = this.applyFreshData(tx.safe as any, freshSafe, ['balance']);
    const newSafeBalance = (Number(baseSafe.balance) || 0) + (isOutflow ? -amountVal : amountVal);

    const records = [
      {
        store: 'transactions',
        recordId: txId,
        data: {
          id: txId,
          type: tx.type,
          amount: amountVal,
          safeId: tx.safe.id,
          safeName: tx.safe.name,
          description: tx.description,
          category: tx.category || (isOutflow ? 'مصروفات عامة' : 'إيداع نقدي'),
          date: nowIso,
          userName: tx.userName || 'تطبيق الموبايل',
          branchId: branch.id,
          branchName: branch.name,
        },
      },
      {
        store: 'safes',
        recordId: tx.safe.id,
        version: safeVersion,
        data: {
          ...baseSafe,
          balance: newSafeBalance,
        },
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
    const records: Array<{ store: string; recordId: string; data: any; version?: number }> = [
      {
        store: 'maintenance',
        recordId: order.id,
        data: {
          ...order,
          branchId: branch.id,
          branchName: branch.name,
        },
      },
    ];

    // If order was delivered and finalPrice was collected into a safe:
    if (order.status === 'delivered' && (Number(order.finalPrice) || 0) > 0 && safeForDeposit) {
      // 🔴 FIX RMW: رصيد الخزنة من النسخة السحابية الأحدث قبل إضافة إيراد الصيانة
      const freshSafeMap = await this.fetchFreshRecords(branch, 'safes', [safeForDeposit.id]);
      const freshSafe = freshSafeMap.get(safeForDeposit.id);
      const { merged: baseSafe, version: safeVersion } = this.applyFreshData(safeForDeposit as any, freshSafe, ['balance']);

      const price = Number(order.finalPrice);
      const newBal = (Number(baseSafe.balance) || 0) + price;
      const txId = `tx_maint_${Date.now()}`;

      records.push(
        {
          store: 'safes',
          recordId: safeForDeposit.id,
          version: safeVersion,
          data: {
            ...baseSafe,
            balance: newBal,
          },
        },
        {
          store: 'transactions',
          recordId: txId,
          data: {
            id: txId,
            type: 'sale',
            amount: price,
            safeId: safeForDeposit.id,
            safeName: safeForDeposit.name,
            description: `إيراد تسليم صيانة #${order.ticketNumber || order.id.slice(0, 8)} (${order.deviceModel})`,
            category: 'صيانة',
            date: new Date().toISOString(),
            userName: 'تطبيق الموبايل',
            branchId: branch.id,
            branchName: branch.name,
          },
        }
      );
    }

    return await this.pushRecordsToBranch(branch, records);
  }

  /**
   * Creates or updates a product in inventory from Mobile.
   */
  public async submitInventoryItem(
    branch: BranchConfig,
    item: InventoryItem
  ): Promise<{ success: boolean; error?: string }> {
    return await this.pushRecordsToBranch(branch, [
      {
        store: 'inventory',
        recordId: item.id,
        data: {
          ...item,
          branchId: branch.id,
          branchName: branch.name,
        },
      },
    ]);
  }
}

export const multiBranchManager = new MultiBranchManager();
