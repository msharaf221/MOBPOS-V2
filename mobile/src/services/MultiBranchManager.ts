import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  BranchConfig,
  BranchMetrics,
  SaleRecord,
  Safe,
  Transaction,
  InventoryItem,
  MaintenanceOrder,
  Customer,
} from '../types';

const STORAGE_KEY_BRANCHES = 'mobpos_companion_branches_v1';
const STORAGE_KEY_SETTINGS = 'mobpos_companion_settings_v1';

// Default initial branch seeded with the active MOBPOS project credentials
const DEFAULT_BRANCHES: BranchConfig[] = [
  {
    id: 'b_main',
    name: 'فرع وسط البلد (الرئيسي)',
    city: 'القاهرة',
    code: 'CAI-01',
    color: '#06b6d4', // Cyan
    supabaseUrl: 'https://tbxyyaumefhdgmpccidq.supabase.co',
    supabaseAnonKey: '',
    tenantId: 'mv8h9gjda52288ce43198a5bab2d9f89',
    enabled: true,
    createdAt: new Date().toISOString(),
    status: 'connected',
  },
  {
    id: 'b_second',
    name: 'فرع المعادي',
    city: 'القاهرة',
    code: 'MAA-02',
    color: '#8b5cf6', // Violet
    supabaseUrl: '',
    supabaseAnonKey: '',
    tenantId: 'branch_maadi_02',
    enabled: true,
    createdAt: new Date().toISOString(),
    status: 'offline',
  },
];

class MultiBranchManager {
  private clients: Map<string, SupabaseClient> = new Map();
  private channels: Map<string, ReturnType<SupabaseClient['channel']>> = new Map();
  private listeners: Set<() => void> = new Set();
  private metricsCache: Map<string, BranchMetrics> = new Map();

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
    // Invalidate client if credentials changed
    if (updates.supabaseUrl || updates.supabaseAnonKey) {
      this.clients.delete(id);
    }
  }

  public deleteBranch(id: string): void {
    const branches = this.getBranches().filter(b => b.id !== id);
    this.saveBranches(branches);
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
      const client = createClient(cleanUrl, cleanKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      this.clients.set(branch.id, client);
    }
    return this.clients.get(branch.id) || null;
  }

  /**
   * Fetches live data from Supabase for a single branch.
   * If credentials are not yet set or offline, returns realistic offline/demo data.
   */
  public async fetchBranchMetrics(branch: BranchConfig): Promise<BranchMetrics> {
    const client = this.getClient(branch);

    if (!client) {
      // Return cached or mock preview data for this branch
      return this.generateMockMetrics(branch);
    }

    try {
      const tenantId = branch.tenantId.trim();

      // 1. Fetch sales
      const { data: salesRows, error: salesErr } = await client
        .from('mobpos_records')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('store', 'sales')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(200);

      if (salesErr) {
        console.warn(`[MultiBranch] Branch ${branch.name} sales fetch error:`, salesErr.message);
      }

      // 2. Fetch safes
      const { data: safesRows } = await client
        .from('mobpos_records')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('store', 'safes')
        .is('deleted_at', null);

      // 3. Fetch transactions
      const { data: txRows } = await client
        .from('mobpos_records')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('store', 'transactions')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(100);

      // 4. Fetch inventory
      const { data: invRows } = await client
        .from('mobpos_records')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('store', 'inventory')
        .is('deleted_at', null)
        .limit(300);

      // 5. Fetch maintenance
      const { data: maintRows } = await client
        .from('mobpos_records')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('store', 'maintenance')
        .is('deleted_at', null)
        .limit(100);

      // 6. Fetch customers
      const { data: custRows } = await client
        .from('mobpos_records')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('store', 'customers')
        .is('deleted_at', null)
        .limit(150);

      const sales: SaleRecord[] = (salesRows || []).map(r => ({
        ...r.data,
        id: r.record_id,
        branchId: branch.id,
        branchName: branch.name,
        branchColor: branch.color,
      }));

      const safes: Safe[] = (safesRows || []).map(r => ({
        ...r.data,
        id: r.record_id,
        branchId: branch.id,
        branchName: branch.name,
      }));

      const transactions: Transaction[] = (txRows || []).map(r => ({
        ...r.data,
        id: r.record_id,
        branchId: branch.id,
        branchName: branch.name,
        branchColor: branch.color,
      }));

      const inventory: InventoryItem[] = (invRows || []).map(r => ({
        ...r.data,
        id: r.record_id,
        branchId: branch.id,
        branchName: branch.name,
      }));

      const maintenance: MaintenanceOrder[] = (maintRows || []).map(r => ({
        ...r.data,
        id: r.record_id,
        branchId: branch.id,
        branchName: branch.name,
      }));

      const customers: Customer[] = (custRows || []).map(r => ({
        ...r.data,
        id: r.record_id,
        branchId: branch.id,
        branchName: branch.name,
      }));

      // Calculate today's metrics
      const now = new Date();
      const todayDateStr = now.toISOString().slice(0, 10);

      const todaySales = sales.filter(s => {
        const d = (s.date || s.createdAt || '').slice(0, 10);
        return d === todayDateStr;
      });

      const todaySalesTotal = todaySales.reduce((acc, s) => acc + (Number(s.finalTotal) || 0), 0);
      const todayProfitTotal = todaySales.reduce((acc, s) => acc + (Number(s.profit) || (s.finalTotal * 0.18)), 0);
      const todayCashCollected = todaySales.reduce((acc, s) => acc + (Number(s.paidAmount || s.finalTotal) || 0), 0);

      const todayExpenses = transactions.filter(t => {
        const d = (t.date || '').slice(0, 10);
        return d === todayDateStr && (t.type === 'expense' || t.type === 'withdrawal');
      });
      const todayExpensesTotal = todayExpenses.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

      const totalSafesBalance = safes.reduce((acc, s) => acc + (Number(s.balance) || 0), 0);
      const lowStockCount = inventory.filter(i => (i.quantity || 0) <= (i.minQuantity || 2)).length;
      const activeMaintenanceCount = maintenance.filter(m => m.status !== 'delivered' && m.status !== 'cancelled').length;
      const totalCustomerDebts = customers.reduce((acc, c) => acc + Math.max(0, Number(c.balance) || 0), 0);

      // Hourly breakdown for today
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

      const metrics: BranchMetrics = {
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
        recentSales: sales.slice(0, 30),
        recentTransactions: transactions.slice(0, 30),
        safesList: safes,
        inventoryList: inventory,
        maintenanceList: maintenance,
        customersList: customers,
        lastSyncedAt: new Date().toISOString(),
      };

      this.metricsCache.set(branch.id, metrics);
      this.updateBranch(branch.id, { status: 'connected', lastSyncAt: metrics.lastSyncedAt });
      return metrics;
    } catch (err) {
      console.error(`[MultiBranch] Error fetching branch ${branch.name}:`, err);
      this.updateBranch(branch.id, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'خطأ بالاتصال بالفرع',
      });
      return this.generateMockMetrics(branch);
    }
  }

  /**
   * Aggregates metrics across all selected/enabled branches.
   */
  public async fetchAggregateMetrics(branches: BranchConfig[]): Promise<{
    combined: BranchMetrics;
    perBranch: BranchMetrics[];
  }> {
    const enabled = branches.filter(b => b.enabled);
    if (enabled.length === 0) {
      const empty = this.getEmptyMetrics('all', 'جميع الفروع', '#38bdf8');
      return { combined: empty, perBranch: [] };
    }

    const perBranch = await Promise.all(enabled.map(b => this.fetchBranchMetrics(b)));

    // Combine all
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
        .slice(0, 50),
      recentTransactions: perBranch
        .flatMap(m => m.recentTransactions)
        .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())
        .slice(0, 50),
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
    const base = metrics[0].hourlySales.map(h => ({ hour: h.hour, total: 0 }));
    metrics.forEach(m => {
      m.hourlySales.forEach((h, idx) => {
        if (base[idx]) base[idx].total += h.total;
      });
    });
    return base;
  }

  private getEmptyMetrics(id: string, name: string, color: string): BranchMetrics {
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
      hourlySales: [],
      recentSales: [],
      recentTransactions: [],
      safesList: [],
      inventoryList: [],
      maintenanceList: [],
      customersList: [],
    };
  }

  /** Generates realistic preview data if the branch is newly added or Supabase isn't reachable yet */
  private generateMockMetrics(branch: BranchConfig): BranchMetrics {
    const isMain = branch.id === 'b_main';
    const mult = isMain ? 1.0 : 0.65;

    const mockSales: SaleRecord[] = [
      {
        id: `sale_${branch.id}_1`,
        invoiceNumber: `${branch.code || 'B'}-INV-1042`,
        date: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        total: 18500 * mult,
        finalTotal: 18500 * mult,
        paidAmount: 18500 * mult,
        profit: 2200 * mult,
        paymentMethod: 'نقدي (كاش)',
        cashierName: isMain ? 'أحمد كمال' : 'محمود سامي',
        customerName: 'كريم عبد العزيز',
        branchId: branch.id,
        branchName: branch.name,
        branchColor: branch.color,
        items: [
          { id: '1', name: 'Samsung Galaxy A55 5G 256GB', quantity: 1, price: 17800 * mult, imei: '354892109845123' },
          { id: '2', name: 'جراب شفاف ماج سيف أصلي', quantity: 1, price: 350 * mult },
          { id: '3', name: 'لاصقة حماية 9D سيراميك', quantity: 1, price: 350 * mult },
        ],
      },
      {
        id: `sale_${branch.id}_2`,
        invoiceNumber: `${branch.code || 'B'}-INV-1041`,
        date: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        total: 4200 * mult,
        finalTotal: 4200 * mult,
        paidAmount: 4200 * mult,
        profit: 950 * mult,
        paymentMethod: 'إنستاباي / تحويل بنكي',
        cashierName: isMain ? 'أحمد كمال' : 'محمود سامي',
        customerName: 'عميل نقدي',
        branchId: branch.id,
        branchName: branch.name,
        branchColor: branch.color,
        items: [
          { id: '4', name: 'سماعة AirPods Pro 2 الأصلية', quantity: 1, price: 4200 * mult },
        ],
      },
      {
        id: `sale_${branch.id}_3`,
        invoiceNumber: `${branch.code || 'B'}-INV-1040`,
        date: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
        total: 850 * mult,
        finalTotal: 850 * mult,
        paidAmount: 850 * mult,
        profit: 320 * mult,
        paymentMethod: 'نقدي (كاش)',
        cashierName: isMain ? 'أحمد كمال' : 'محمود سامي',
        customerName: 'طارق الدسوقي',
        branchId: branch.id,
        branchName: branch.name,
        branchColor: branch.color,
        items: [
          { id: '5', name: 'شاحن أنكر 20W أصلي Type-C', quantity: 1, price: 550 * mult },
          { id: '6', name: 'كابل شحن ايفون قماش معتمد', quantity: 1, price: 300 * mult },
        ],
      },
    ];

    const mockSafes: Safe[] = [
      { id: `s_${branch.id}_1`, name: 'درج الكاشير الرئيسي', type: 'cash', balance: isMain ? 24500 : 14200, branchId: branch.id, branchName: branch.name },
      { id: `s_${branch.id}_2`, name: 'خزينة المحل الحديدية', type: 'cash', balance: isMain ? 85000 : 42000, branchId: branch.id, branchName: branch.name },
      { id: `s_${branch.id}_3`, name: 'محفظة إنستاباي / فودافون كاش', type: 'wallet', balance: isMain ? 12300 : 6800, branchId: branch.id, branchName: branch.name },
    ];

    const mockTransactions: Transaction[] = [
      {
        id: `tx_${branch.id}_1`,
        date: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        type: 'expense',
        amount: 150,
        safeId: `s_${branch.id}_1`,
        safeName: 'درج الكاشير الرئيسي',
        description: 'بوفيه وضيافة وشاي للعملاء',
        category: 'مصروفات تشغيل',
        userName: isMain ? 'أحمد كمال' : 'محمود سامي',
        branchId: branch.id,
        branchName: branch.name,
        branchColor: branch.color,
      },
      {
        id: `tx_${branch.id}_2`,
        date: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        type: 'expense',
        amount: 800,
        safeId: `s_${branch.id}_1`,
        safeName: 'درج الكاشير الرئيسي',
        description: 'شراء كراتين شحن وأكياس لوجو',
        category: 'مستلزمات تعبئة',
        userName: isMain ? 'أحمد كمال' : 'محمود سامي',
        branchId: branch.id,
        branchName: branch.name,
        branchColor: branch.color,
      },
    ];

    const mockInventory: InventoryItem[] = [
      { id: `inv_1`, name: 'iPhone 15 Pro Max 256GB تيتانيوم', quantity: 2, minQuantity: 3, sellPrice: 56000, costPrice: 52000, hasImei: true, branchId: branch.id, branchName: branch.name },
      { id: `inv_2`, name: 'شاشة سامسونج A54 أصلية توكيل', quantity: 1, minQuantity: 2, sellPrice: 2800, costPrice: 2200, branchId: branch.id, branchName: branch.name },
      { id: `inv_3`, name: 'باور بانك أنكر 20,000 مللي أمبير', quantity: 0, minQuantity: 4, sellPrice: 1950, costPrice: 1500, branchId: branch.id, branchName: branch.name },
      { id: `inv_4`, name: 'سماعة Joyroom Pro اللاسلكية', quantity: 8, minQuantity: 3, sellPrice: 750, costPrice: 500, branchId: branch.id, branchName: branch.name },
    ];

    const mockMaintenance: MaintenanceOrder[] = [
      {
        id: `maint_1`,
        ticketNumber: `${branch.code || 'B'}-M-201`,
        customerName: 'إبراهيم حسن',
        customerPhone: '01012345678',
        deviceModel: 'iPhone 13 Pro',
        problem: 'تغيير بطارية أصلية + فحص شحن',
        status: 'repairing',
        costPrice: 900,
        finalPrice: 1600,
        receivedDate: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
        branchId: branch.id,
        branchName: branch.name,
      },
      {
        id: `maint_2`,
        ticketNumber: `${branch.code || 'B'}-M-202`,
        customerName: 'سارة فهمي',
        customerPhone: '01198765432',
        deviceModel: 'Xiaomi Redmi Note 12',
        problem: 'شاشة مكسورة - تغيير شاشة كاملة',
        status: 'ready',
        costPrice: 850,
        finalPrice: 1400,
        receivedDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        branchId: branch.id,
        branchName: branch.name,
      },
    ];

    const mockCustomers: Customer[] = [
      { id: `cust_1`, name: 'شركة النور للاتصالات', phone: '01000000001', balance: 14500, branchId: branch.id, branchName: branch.name },
      { id: `cust_2`, name: 'المهندس حسام الدين', phone: '01222222222', balance: 3200, branchId: branch.id, branchName: branch.name },
    ];

    const hourlySales = [
      { hour: '10 ص', total: 1200 * mult },
      { hour: '12 م', total: 4500 * mult },
      { hour: '2 م', total: 2800 * mult },
      { hour: '4 م', total: 6200 * mult },
      { hour: '6 م', total: 9800 * mult },
      { hour: '8 م', total: 14500 * mult },
      { hour: '10 م', total: 7200 * mult },
    ];

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchColor: branch.color,
      todaySalesTotal: isMain ? 46200 : 28400,
      todayProfitTotal: isMain ? 8600 : 5100,
      todayInvoicesCount: isMain ? 18 : 11,
      todayCashCollected: isMain ? 43500 : 27000,
      todayExpensesTotal: isMain ? 950 : 600,
      totalSafesBalance: mockSafes.reduce((acc, s) => acc + s.balance, 0),
      lowStockCount: 3,
      activeMaintenanceCount: 2,
      totalCustomerDebts: isMain ? 17700 : 8400,
      hourlySales,
      recentSales: mockSales,
      recentTransactions: mockTransactions,
      safesList: mockSafes,
      inventoryList: mockInventory,
      maintenanceList: mockMaintenance,
      customersList: mockCustomers,
      lastSyncedAt: new Date().toISOString(),
    };
  }
}

export const multiBranchManager = new MultiBranchManager();
