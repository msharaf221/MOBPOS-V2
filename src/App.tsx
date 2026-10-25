import { useState, useEffect } from 'react';
import { useStore } from './hooks/useStore';
import { ActiveLicense, PLAN_FEATURES } from './license/types';
import { clearLicense, verifyStoredActivation, isLicenseExpired } from './license/engine';
import { maybeRunScheduledBackup, requestPersistentStorage } from './utils/backup';
import LicenseActivation from './components/LicenseActivation';
import LicenseExpired from './components/LicenseExpired';
import MasterAdmin from './components/MasterAdmin';
import Login from './components/Login';
import ForcePasswordChange from './components/ForcePasswordChange';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import POS from './components/POS';
import IMEIManager from './components/IMEIManager';
import MaintenanceBoard from './components/MaintenanceBoard';
import Customers from './components/Customers';
import Inventory from './components/Inventory';
import InventoryAudit from './components/InventoryAudit';
import SideAccounts from './components/SideAccounts';
import Sales from './components/Sales';
import Safes from './components/Safes';
import Suppliers from './components/Suppliers';
import Purchases from './components/Purchases';
import Users from './components/Users';
import Finance from './components/Finance';
import Settings from './components/Settings';
import ReportPreview from './components/ReportPreview';
import AuditLog from './components/AuditLog';
import { demoAppSettings, getDemoShowcaseData } from './data/demoShowcase';
import { isLanClient, fetchLanServerInfo } from './utils/lanSync';
import { useLanSync } from './hooks/useLanSync';
import { syncEngine } from './services/SyncEngine';
import { applyStoreDelta } from './hooks/store/applyDeltas';

const isDevDemo =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('demo');

type PageType = 'dashboard' | 'pos' | 'inventory' | 'inventoryAudit' | 'imei' | 'maintenance' | 'customers' | 'sales' | 'safes' | 'finance' | 'sideAccounts' | 'suppliers' | 'purchases' | 'users' | 'settings' | 'audit';
type AppScreen = 'license' | 'expired' | 'device' | 'app';

export default function App() {
  const store = useStore();
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');
  const [screen, setScreen] = useState<AppScreen>('license');
  const [license, setLicense] = useState<ActiveLicense | null>(null);
  const [masterOverlay, setMasterOverlay] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMasterShortcut =
        e.shiftKey &&
        (e.key === 'M' || e.key === 'm') &&
        (e.ctrlKey || e.altKey);
      if (!isMasterShortcut) return;
      e.preventDefault();
      setMasterOverlay(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (screen !== 'app' || !license) return;
    const interval = setInterval(() => {
      if (isLicenseExpired(license.expiresAt, license.lifetime)) {
        setScreen('expired');
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [screen, license]);

  useEffect(() => {
    syncEngine.setStoreDispatcher((storeName, action) => {
      type Identifiable = { id: string; [key: string]: unknown };
      const storeSetters: Record<string, (val: unknown) => void> = {
        users: store.setUsers as (val: unknown) => void,
        customers: store.setCustomers as (val: unknown) => void,
        categories: store.setCategories as (val: unknown) => void,
        inventory: store.setInventory as (val: unknown) => void,
        imeiUnits: store.setImeiUnits as (val: unknown) => void,
        sales: store.setSales as (val: unknown) => void,
        saleReturns: store.setSaleReturns as (val: unknown) => void,
        maintenance: store.setMaintenance as (val: unknown) => void,
        safes: store.setSafes as (val: unknown) => void,
        transactions: store.setTransactions as (val: unknown) => void,
        suppliers: store.setSuppliers as (val: unknown) => void,
        purchases: store.setPurchases as (val: unknown) => void,
        stockWastes: store.setStockWastes as (val: unknown) => void,
        inventoryAudits: store.setInventoryAudits as (val: unknown) => void,
        sideAccountEntries: store.setSideAccountEntries as (val: unknown) => void,
        notifications: store.setNotifications as (val: unknown) => void,
        auditLogs: store.setAuditLogs as (val: unknown) => void,
      };

      const setter = storeSetters[storeName];
      if (!setter) return;

      // 🔴 FIX: تُطبَّق الدلتا عبر applyStoreDelta المشترك (نفس القواعد المستخدمة
      // في useStoreDispatcher وجسر LAN sync) بدل منطق مكرر يدوي داخله انحراف،
      // مع الحفاظ على الـ functional update حتى لا تُكتَرش الدِلتا المتتابعة.
      const setRecords = setter as unknown as (
        fn: (prev: Identifiable[]) => Identifiable[]
      ) => void;

      if (action.type === 'delete' && action.id) {
        setRecords(prev => applyStoreDelta(prev, 'delete', [{ id: action.id }], storeName));
      } else if (action.type === 'upsert' && action.item) {
        setRecords(prev => applyStoreDelta(prev, 'upsert', [action.item], storeName));
      } else if (action.type === 'replace' && Array.isArray(action.items)) {
        setter(action.items);
      }
    });

    syncEngine.setLicense(license);
    syncEngine.init();
  }, [license, store.setUsers, store.setCustomers, store.setCategories, store.setInventory, store.setImeiUnits, store.setSales, store.setSaleReturns, store.setMaintenance, store.setSafes, store.setTransactions, store.setSuppliers, store.setPurchases, store.setStockWastes, store.setInventoryAudits, store.setSideAccountEntries, store.setNotifications, store.setAuditLogs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isDevDemo) {
        setLicense({
          keyId: 'demo',
          key: 'demo',
          plan: 'lifetime',
          shopName: 'موبايل ستور',
          activatedAt: new Date().toISOString(),
          expiresAt: '',
          lifetime: true,
          maxUsers: 8,
          deviceId: 'demo',
        });
        setScreen('app');
        return;
      }

      if (isLanClient()) {
        try {
          const lanInfo = await fetchLanServerInfo();
          if (lanInfo && lanInfo.status === 'online') {
            setLicense({
              keyId: 'lan-client',
              key: 'lan-client',
              plan: 'lifetime',
              shopName: lanInfo.shopName || 'MOBPOS',
              activatedAt: new Date().toISOString(),
              expiresAt: '',
              lifetime: true,
              maxUsers: 99,
              deviceId: 'lan-client',
            });
            setScreen('app');
            return;
          }
        } catch {
          // fall through
        }
      }

      const check = await verifyStoredActivation();
      if (cancelled) return;

      if (check.status === 'ok' && check.license) {
        setLicense(check.license);
        setScreen('app');
        return;
      }
      if (check.status === 'expired' && check.license) {
        setLicense(check.license);
        setScreen('expired');
        return;
      }
      if (check.status === 'device_mismatch') {
        setLicense(check.license || null);
        setScreen('device');
        return;
      }
      setLicense(null);
      setScreen('license');
    })();
    return () => { cancelled = true; };
  }, []);

  // LAN sync extracted to dedicated hook
  useLanSync(screen === 'app', store);

  useEffect(() => {
    const html = document.documentElement;
    if (store.isDarkMode) {
      html.classList.add('dark');
      html.style.colorScheme = 'dark';
    } else {
      html.classList.remove('dark');
      html.style.colorScheme = 'light';
    }
  }, [store.isDarkMode]);

  const backupReady = screen === 'app' && !store.isLoading && !!store.currentUser;
  useEffect(() => {
    if (!backupReady) return;
    requestPersistentStorage();
    const kickoff = setTimeout(() => {
      maybeRunScheduledBackup().catch(() => undefined);
    }, 5000);
    const interval = setInterval(() => {
      maybeRunScheduledBackup().catch(() => undefined);
    }, 30 * 60 * 1000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [backupReady]);

  useEffect(() => {
    if (!isDevDemo || store.isLoading) return;
    if (sessionStorage.getItem('mobpos-demo-seeded') === '1') return;
    const data = getDemoShowcaseData();
    store.setUsers(data.users);
    store.setCustomers(data.customers);
    store.setCategories(data.categories);
    store.setInventory(data.inventory);
    store.setImeiUnits(data.imeiUnits);
    store.setSales(data.sales);
    store.setSaleReturns(data.saleReturns);
    store.setMaintenance(data.maintenance);
    store.setSafes(data.safes);
    store.setTransactions(data.transactions);
    store.setSuppliers(data.suppliers);
    store.setPurchases(data.purchases);
    store.setStockWastes(data.stockWastes);
    store.setInventoryAudits(data.inventoryAudits);
    store.setSideAccountEntries(data.sideAccountEntries);
    store.setNotifications(data.notifications);
    store.setAppSettings(demoAppSettings);
    store.setIsDarkMode(false);
    store.setCurrentUser(data.users[0]);
    sessionStorage.setItem('mobpos-demo-seeded', '1');
  }, [store.isLoading]);

  const handleLicenseActivated = (activeLicense: ActiveLicense) => {
    setLicense(activeLicense);
    setScreen('app');
  };

  const handleLogin = async (username: string, password: string): Promise<boolean> => {
    const user = await store.login(username, password);
    return user !== null;
  };

  const isModuleAvailable = (moduleId: string): boolean => {
    if (!license) return false;
    return PLAN_FEATURES[license.plan].modules.includes(moduleId);
  };

  const handleNavigate = (page: string) => {
    if (isModuleAvailable(page)) {
      setCurrentPage(page as PageType);
    } else {
      alert(`هذه الميزة غير متاحة في باقتك الحالية (${PLAN_FEATURES[license?.plan || 'basic'].nameAr})\n\nقم بالترقية للباقة الاحترافية للحصول على جميع المميزات.`);
    }
  };

  if (masterOverlay) {
    return <MasterAdmin onBack={() => setMasterOverlay(false)} />;
  }

  if (screen === 'device') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-white mb-3">الجهاز غير مطابق</h1>
          <p className="text-slate-300 text-sm leading-relaxed mb-6">
            هذا الترخيص تم تفعيله على جهاز مختلف ولا يمكن نقله بين الأجهزة.
            كل مفتاح يعمل على جهاز واحد فقط.
            <br />
            إذا كنت تريد تفعيل النظام على هذا الجهاز، ستحتاج إلى مفتاح تفعيل جديد من مزود النظام.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                clearLicense();
                setLicense(null);
                setScreen('license');
              }}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition"
            >
              إدخال مفتاح تفعيل جديد
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'license') {
    return (
      <LicenseActivation
        onActivated={handleLicenseActivated}
        onMasterAccess={() => setMasterOverlay(true)}
      />
    );
  }

  if (screen === 'expired' && license) {
    return (
      <LicenseExpired
        expiredLicense={license}
        onRenewed={(newLicense) => {
          setLicense(newLicense);
          setScreen('app');
        }}
        onDeactivate={() => {
          clearLicense();
          setLicense(null);
          setScreen('license');
        }}
      />
    );
  }

  if (store.isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-white/10 backdrop-blur rounded-2xl mx-auto mb-4 flex items-center justify-center animate-pulse">
            <span className="text-4xl">📱</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">{store.appSettings.shopName || license?.shopName || 'MOBPOS'}</h1>
          <p className="text-blue-200 mb-4">جاري تحميل البيانات...</p>
          <div className="w-48 h-2 bg-white/20 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-white rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (!store.currentUser) {
    return <Login onLogin={handleLogin} shopName={store.appSettings.shopName} />;
  }

  if (store.currentUser.mustChangePassword) {
    return (
      <ForcePasswordChange
        currentUser={store.currentUser}
        onChangePassword={store.changePassword}
        onLogout={store.logout}
        shopName={store.appSettings.shopName}
      />
    );
  }

  const handleDeactivateLicense = () => {
    if (confirm('هل أنت متأكد من إلغاء تفعيل الترخيص على هذا الجهاز؟')) {
      clearLicense();
      setLicense(null);
      setScreen('license');
      store.logout();
    }
  };

  const renderAccessDenied = () => (
    <div className="flex items-center justify-center h-64">
      <div className="text-center text-slate-500">
        <p className="text-lg font-bold mb-2">غير مصرح</p>
        <p className="text-sm">ليس لديك صلاحية الوصول لهذه الصفحة</p>
      </div>
    </div>
  );

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            statistics={store.getStatistics()}
            sales={store.sales}
            maintenance={store.maintenance}
            categories={store.categories}
            inventory={store.inventory}
          />
        );
      case 'pos':
        return (
          <POS
            inventory={store.inventory}
            imeiUnits={store.imeiUnits}
            customers={store.customers}
            categories={store.categories}
            safes={store.safes}
            shopName={store.appSettings.shopName}
            receiptFooter={store.appSettings.receiptFooter}
            onCreateSale={store.createSale}
            onAddCustomer={store.addCustomer}
            onAddInventoryItem={store.addInventoryItem}
          />
        );
      case 'inventory':
        return (
          <Inventory
            inventory={store.inventory}
            categories={store.categories}
            imeiUnits={store.imeiUnits}
            suppliers={store.suppliers}
            onAddItem={store.addInventoryItem}
            onUpdateItem={store.updateInventoryItem}
            onDeleteItem={store.deleteInventoryItem}
            onAddCategory={store.addCategory}
            onRecordWaste={store.recordStockWaste}
          />
        );
      case 'inventoryAudit':
        return (
          <InventoryAudit
            inventory={store.inventory}
            categories={store.categories}
            imeiUnits={store.imeiUnits}
            audits={store.inventoryAudits}
            users={store.users}
            onCreateAudit={store.createInventoryAudit}
            onApplyAudit={store.applyInventoryAudit}
            onDeleteAudit={store.deleteInventoryAudit}
          />
        );
      case 'imei':
        return (
          <IMEIManager
            imeiUnits={store.imeiUnits}
            inventory={store.inventory}
            customers={store.customers}
            onAddIMEI={store.addIMEIUnit}
            onUpdateIMEI={store.updateIMEIUnit}
            onDeleteIMEI={store.deleteIMEIUnit}
            getIMEIHistory={store.getIMEIHistory}
          />
        );
      case 'maintenance':
        return (
          <MaintenanceBoard
            maintenance={store.maintenance}
            inventory={store.inventory}
            categories={store.categories}
            safes={store.safes}
            customers={store.customers}
            onCreateMaintenance={store.createMaintenance}
            onUpdateMaintenance={store.updateMaintenance}
            onAddPart={store.addMaintenancePart}
            onRemovePart={store.removeMaintenancePart}
            onDeliverMaintenance={store.deliverMaintenance}
          />
        );
      case 'customers':
        return (
          <Customers
            customers={store.customers}
            sales={store.sales}
            imeiUnits={store.imeiUnits}
            inventory={store.inventory}
            maintenance={store.maintenance}
            safes={store.safes}
            onAddCustomer={store.addCustomer}
            onUpdateCustomer={store.updateCustomer}
            onDeleteCustomer={store.deleteCustomer}
            onRecordPayment={store.recordCustomerPayment}
          />
        );
      case 'sales':
        return (
          <Sales
            sales={store.sales}
            saleReturns={store.saleReturns}
            customers={store.customers}
            inventory={store.inventory}
            imeiUnits={store.imeiUnits}
            users={store.users}
            shopName={store.appSettings.shopName}
            receiptFooter={store.appSettings.receiptFooter}
            onProcessReturn={store.processSaleReturn}
          />
        );
      case 'safes':
        return (
          <Safes
            safes={store.safes}
            transactions={store.transactions}
            currentUser={store.currentUser}
            onAddSafe={store.addSafe}
            onDeleteSafe={store.deleteSafe}
            onTransfer={store.transferBetweenSafes}
          />
        );
      case 'finance':
        return (
          <Finance
            transactions={store.transactions}
            safes={store.safes}
            sales={store.sales}
            maintenance={store.maintenance}
            saleReturns={store.saleReturns}
            stockWastes={store.stockWastes}
            shopName={store.appSettings.shopName}
            onAddTransaction={store.addTransaction}
            onDeleteTransaction={store.deleteTransaction}
            onRecordWalletTransaction={store.recordWalletTransaction}
          />
        );
      case 'sideAccounts':
        return (
          <SideAccounts
            entries={store.sideAccountEntries}
            safes={store.safes}
            onAddEntry={store.addSideAccountEntry}
            onUpdateEntry={store.updateSideAccountEntry}
            onDeleteEntry={store.deleteSideAccountEntry}
          />
        );
      case 'suppliers':
        return (
          <Suppliers
            suppliers={store.suppliers}
            onUpdate={store.updateSuppliers}
          />
        );
      case 'purchases':
        return (
          <Purchases
            purchases={store.purchases}
            suppliers={store.suppliers}
            inventory={store.inventory}
            safes={store.safes}
            users={store.users}
            shopName={store.appSettings.shopName}
            onCreatePurchase={store.createPurchase}
            onPaySupplier={store.recordSupplierPayment}
          />
        );
      case 'users':
        if (store.currentUser?.role !== 'admin') return renderAccessDenied();
        return (
          <Users
            users={store.users}
            currentUser={store.currentUser!}
            onUpdate={store.updateUsers}
          />
        );
      case 'audit':
        if (store.currentUser?.role !== 'admin') return renderAccessDenied();
        return (
          <AuditLog
            auditLogs={store.auditLogs}
            users={store.users}
            currentUser={store.currentUser}
            onClearLogs={store.clearAuditLogs}
          />
        );
      case 'settings':
        if (store.currentUser?.role !== 'admin') return renderAccessDenied();
        return (
          <Settings
            currentUser={store.currentUser!}
            isDarkMode={store.isDarkMode}
            onToggleDarkMode={() => store.setIsDarkMode(prev => !prev)}
            onResetData={store.resetAllData}
            settings={store.appSettings}
            onSaveSettings={store.setAppSettings}
            onChangePassword={store.changePassword}
            onOpenMaster={() => setMasterOverlay(true)}
            license={license}
            onLicenseUpdated={(updated) => setLicense(updated)}
            onLicenseDeactivated={() => {
              clearLicense();
              setLicense(null);
              setScreen('license');
            }}
          />
        );
      default:
        return (
          <Dashboard
            statistics={store.getStatistics()}
            sales={store.sales}
            maintenance={store.maintenance}
            categories={store.categories}
            inventory={store.inventory}
          />
        );
    }
  };

  return (
    <>
      <Layout
        currentUser={store.currentUser}
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onLogout={store.logout}
        isDarkMode={store.isDarkMode}
        onToggleDarkMode={() => store.setIsDarkMode(!store.isDarkMode)}
        notifications={store.notifications}
        onMarkNotificationRead={store.markNotificationAsRead}
        onMarkAllNotificationsRead={store.markAllNotificationsAsRead}
        onDismissNotification={store.dismissNotification}
        onClearAllNotifications={store.clearAllNotifications}
        license={license}
        onDeactivateLicense={handleDeactivateLicense}
        shopName={store.appSettings.shopName || license?.shopName || 'MOBPOS'}
      >
        {renderPage()}
      </Layout>
      <ReportPreview />
    </>
  );
}
