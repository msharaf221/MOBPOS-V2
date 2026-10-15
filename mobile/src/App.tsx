import { useState, useEffect, useCallback } from 'react';
import type { BranchConfig, BranchMetrics, SaleRecord } from './types';
import { multiBranchManager } from './services/MultiBranchManager';
import { Header } from './components/Header';
import { BottomNav, type NavTab } from './components/BottomNav';
import { DashboardTab } from './components/DashboardTab';
import { SalesTab } from './components/SalesTab';
import { SafesTab } from './components/SafesTab';
import { InventoryTab } from './components/InventoryTab';
import { SettingsTab } from './components/SettingsTab';
import { InvoiceDetailModal } from './components/InvoiceDetailModal';
import { BranchEditModal } from './components/BranchEditModal';
import { MaintenanceModal } from './components/MaintenanceModal';
import { DebtsModal } from './components/DebtsModal';

export default function App() {
  const [branches, setBranches] = useState<BranchConfig[]>(() => multiBranchManager.getBranches());
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  const [metrics, setMetrics] = useState<BranchMetrics>(() => ({
    branchId: 'all',
    branchName: 'جميع الفروع',
    branchColor: '#38bdf8',
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
  }));

  const [perBranchMetrics, setPerBranchMetrics] = useState<BranchMetrics[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // App settings
  const [hideAmounts, setHideAmounts] = useState<boolean>(() => {
    return localStorage.getItem('mobpos_companion_hide_amounts') === 'true';
  });
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30);

  // Modals state
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [branchEditState, setBranchEditState] = useState<{ isOpen: boolean; branch: BranchConfig | null }>({
    isOpen: false,
    branch: null,
  });
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [isDebtsModalOpen, setIsDebtsModalOpen] = useState(false);

  // Load and refresh metrics
  const refreshMetrics = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const currentBranches = multiBranchManager.getBranches();
      setBranches(currentBranches);

      if (selectedBranchId === 'all') {
        const res = await multiBranchManager.fetchAggregateMetrics(currentBranches);
        setMetrics(res.combined);
        setPerBranchMetrics(res.perBranch);
      } else {
        const singleBranch = currentBranches.find(b => b.id === selectedBranchId);
        if (singleBranch) {
          const branchRes = await multiBranchManager.fetchBranchMetrics(singleBranch);
          setMetrics(branchRes);
          setPerBranchMetrics([branchRes]);
        }
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    refreshMetrics().catch(() => undefined);
  }, [refreshMetrics]);

  // Subscribe to manager changes
  useEffect(() => {
    const unsub = multiBranchManager.subscribe(() => {
      setBranches(multiBranchManager.getBranches());
    });
    return unsub;
  }, []);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      refreshMetrics().catch(() => undefined);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval, refreshMetrics]);

  const toggleHideAmounts = () => {
    setHideAmounts(prev => {
      const next = !prev;
      localStorage.setItem('mobpos_companion_hide_amounts', String(next));
      return next;
    });
  };

  const handleSaveBranch = (
    branchData: Omit<BranchConfig, 'id' | 'createdAt'>,
    existingId?: string
  ) => {
    if (existingId) {
      multiBranchManager.updateBranch(existingId, branchData);
    } else {
      multiBranchManager.addBranch(branchData);
    }
    refreshMetrics();
  };

  const handleDeleteBranch = (id: string) => {
    multiBranchManager.deleteBranch(id);
    if (selectedBranchId === id) {
      setSelectedBranchId('all');
    }
    refreshMetrics();
  };

  const handleToggleBranchEnabled = (id: string, enabled: boolean) => {
    multiBranchManager.updateBranch(id, { enabled });
    refreshMetrics();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex justify-center selection:bg-cyan-500 selection:text-black">
      {/* Background ambient light effects */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-cyan-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-96 h-96 bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Container constrained to Mobile Form Factor */}
      <div className="w-full max-w-md min-h-screen flex flex-col relative z-10 border-x border-slate-850/50 shadow-2xl">
        {/* Header */}
        <Header
          branches={branches}
          selectedBranchId={selectedBranchId}
          onSelectBranch={setSelectedBranchId}
          onOpenAddBranch={() => setBranchEditState({ isOpen: true, branch: null })}
          hideAmounts={hideAmounts}
          onToggleHideAmounts={toggleHideAmounts}
          isRefreshing={isRefreshing}
          onRefresh={refreshMetrics}
          lastSyncedAt={metrics.lastSyncedAt}
        />

        {/* Tab Content */}
        <main className="flex-1 px-4 py-3 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <DashboardTab
              metrics={metrics}
              perBranchMetrics={perBranchMetrics}
              isAllBranches={selectedBranchId === 'all'}
              hideAmounts={hideAmounts}
              onSelectSale={sale => setSelectedSale(sale)}
              onNavigateToTab={setActiveTab}
              onOpenMaintenanceModal={() => setIsMaintenanceModalOpen(true)}
              onOpenDebtsModal={() => setIsDebtsModalOpen(true)}
            />
          )}

          {activeTab === 'sales' && (
            <SalesTab
              sales={metrics.recentSales}
              hideAmounts={hideAmounts}
              onSelectSale={sale => setSelectedSale(sale)}
            />
          )}

          {activeTab === 'safes' && (
            <SafesTab
              safes={metrics.safesList}
              transactions={metrics.recentTransactions}
              hideAmounts={hideAmounts}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryTab
              inventory={metrics.inventoryList}
              hideAmounts={hideAmounts}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              branches={branches}
              onOpenAddBranch={() => setBranchEditState({ isOpen: true, branch: null })}
              onEditBranch={branch => setBranchEditState({ isOpen: true, branch })}
              onToggleBranchEnabled={handleToggleBranchEnabled}
              hideAmounts={hideAmounts}
              onToggleHideAmounts={toggleHideAmounts}
              autoRefreshInterval={autoRefreshInterval}
              onChangeAutoRefresh={setAutoRefreshInterval}
            />
          )}
        </main>

        {/* Bottom Navigation */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          pendingLowStockCount={metrics.lowStockCount}
          activeMaintenanceCount={metrics.activeMaintenanceCount}
        />

        {/* Modals */}
        <InvoiceDetailModal
          sale={selectedSale}
          isOpen={Boolean(selectedSale)}
          onClose={() => setSelectedSale(null)}
          hideAmounts={hideAmounts}
        />

        <BranchEditModal
          branch={branchEditState.branch}
          isOpen={branchEditState.isOpen}
          onClose={() => setBranchEditState({ isOpen: false, branch: null })}
          onSave={handleSaveBranch}
          onDelete={branchEditState.branch ? handleDeleteBranch : undefined}
        />

        <MaintenanceModal
          orders={metrics.maintenanceList}
          isOpen={isMaintenanceModalOpen}
          onClose={() => setIsMaintenanceModalOpen(false)}
          hideAmounts={hideAmounts}
        />

        <DebtsModal
          customers={metrics.customersList}
          isOpen={isDebtsModalOpen}
          onClose={() => setIsDebtsModalOpen(false)}
          hideAmounts={hideAmounts}
        />
      </div>
    </div>
  );
}
