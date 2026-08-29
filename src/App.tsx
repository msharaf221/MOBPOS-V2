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
import Users from './components/Users';
import Finance from './components/Finance';
import Settings from './components/Settings';
import ReportPreview from './components/ReportPreview';

type PageType = 'dashboard' | 'pos' | 'inventory' | 'inventoryAudit' | 'imei' | 'maintenance' | 'customers' | 'sales' | 'safes' | 'finance' | 'sideAccounts' | 'suppliers' | 'users' | 'settings';
type AppScreen = 'license' | 'expired' | 'device' | 'app';

export default function App() {
  const store = useStore();
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');
  const [screen, setScreen] = useState<AppScreen>('license');
  const [license, setLicense] = useState<ActiveLicense | null>(null);
  const [masterOverlay, setMasterOverlay] = useState(false);

  // ===== MASTER PANEL SHORTCUT =====
  // The master panel used to be reachable only from the activation screen, so
  // once the app was activated there was no way back in. A global shortcut now
  // opens it as an overlay on top of whatever screen is showing.
  // Both Ctrl+Shift+M and Alt+Shift+M work because Chrome reserves
  // Ctrl+Shift+M for its own profile switcher.
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

  // Check expiry while app is running (every minute)
  useEffect(() => {
    if (screen !== 'app' || !license) return;
    const interval = setInterval(() => {
      if (isLicenseExpired(license.expiresAt, license.lifetime)) {
        setScreen('expired');
      }
    }, 60000); // check every minute
    return () => clearInterval(interval);
  }, [screen, license]);

  // Verify the stored license on load: re-check the digital signature,
  // expiration, and that we are still on the device it was activated on.
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      // none / invalid
      setLicense(null);
      setScreen('license');
    })();
    return () => { cancelled = true; };
  }, []);

  // Apply dark mode
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

  // ===== AUTOMATIC DAILY BACKUP =====
  // Runs when the app is fully loaded (after login), then re-checks every 30
  // minutes so a shop that keeps the system open all day still gets its
  // daily backup. Also asks the browser to make storage persistent.
  const backupReady = screen === 'app' && !store.isLoading && !!store.currentUser;
  useEffect(() => {
    if (!backupReady) return;

    // Protect IndexedDB data from browser eviction
    requestPersistentStorage();

    // Run shortly after startup, then periodically
    const kickoff = setTimeout(() => {
      maybeRunScheduledBackup().catch(() => undefined);
    }, 5000);
    const interval = setInterval(() => {
      maybeRunScheduledBackup().catch(() => undefined);
    }, 30 * 60 * 1000); // every 30 minutes

    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [backupReady]);

  // Handle license activation
  const handleLicenseActivated = (activeLicense: ActiveLicense) => {
    setLicense(activeLicense);
    setScreen('app');
  };

  // Handle login
  const handleLogin = async (username: string, password: string): Promise<boolean> => {
    const user = await store.login(username, password);
    return user !== null;
  };

  // Check if module is available
  const isModuleAvailable = (moduleId: string): boolean => {
    if (!license) return false;
    return PLAN_FEATURES[license.plan].modules.includes(moduleId);
  };

  // Navigate with plan check
  const handleNavigate = (page: string) => {
    if (isModuleAvailable(page)) {
      setCurrentPage(page as PageType);
    } else {
      alert(`هذه الميزة غير متاحة في باقتك الحالية (${PLAN_FEATURES[license?.plan || 'basic'].nameAr})\n\nقم بالترقية للباقة الاحترافية للحصول على جميع المميزات.`);
    }
  };

  // ===== OVERLAY: MASTER ADMIN =====
  // Rendered before every other screen so it can be opened from anywhere
  // (including after activation). Going back returns to the exact screen
  // the user was on, since no other state is touched.
  if (masterOverlay) {
    return <MasterAdmin onBack={() => setMasterOverlay(false)} />;
  }

  // ===== SCREEN: DEVICE MISMATCH =====
  // The stored license was activated on a different device (or the data
  // was copied between machines). The key stays bound to its first device.
  if (screen === 'device') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-lg bg-white/5 backdrop-blur-xl border border-red-500/25 rounded-3xl p-8 text-center shadow-2xl">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 border border-red-500/30 rounded-2xl mb-4">
            <span className="text-3xl">🔒</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">الترخيص مربوط بجهاز آخر</h1>
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

  // ===== SCREEN: LICENSE ACTIVATION =====
  if (screen === 'license') {
    return (
      <LicenseActivation
        onActivated={handleLicenseActivated}
        onMasterAccess={() => setMasterOverlay(true)}
      />
    );
  }

  // ===== SCREEN: LICENSE EXPIRED =====
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

  // ===== SCREEN: MAIN APP =====

  // Show loading
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

  // Show login
  if (!store.currentUser) {
    return <Login onLogin={handleLogin} shopName={store.appSettings.shopName} />;
  }

  // Force password change on first login with default credentials
  if (store.currentUser.mustChangePassword) {
    return (
      <ForcePasswordChange
        currentUser={store.currentUser}
        onChangePassword={store.changePassword}
        onLogout={store.logout}
        shopName={store.appSettings.shopName || license?.shopName || 'MOBPOS'}
      />
    );
  }

  // Handle deactivation
  const handleDeactivateLicense = () => {
    if (confirm('هل أنت متأكد من إلغاء تفعيل الترخيص؟ سيتم تسجيل خروجك.')) {
      clearLicense();
      store.logout();
      setLicense(null);
      setScreen('license');
    }
  };

  // Render current page
  const renderAccessDenied = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 max-w-md">
        <h2 className="text-xl font-bold text-red-600 mb-2">غير مصرح لك بالوصول</h2>
        <p className="text-gray-500 dark:text-gray-400">
          هذه الصفحة متاحة فقط لمدير النظام. يرجى التواصل مع المدير إذا كنت بحاجة إلى الوصول.
        </p>
      </div>
    </div>
  );

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            statistics={store.getStatistics}
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
            shopName={store.appSettings.shopName || license?.shopName || 'MOBPOS'}
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
            shopName={store.appSettings.shopName || license?.shopName || 'MOBPOS'}
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
            shopName={store.appSettings.shopName || license?.shopName || 'MOBPOS'}
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
      case 'users':
        if (store.currentUser?.role !== 'admin') {
          return renderAccessDenied();
        }
        return (
          <Users
            users={store.users}
            currentUser={store.currentUser!}
            onUpdate={store.updateUsers}
          />
        );
      case 'settings':
        if (store.currentUser?.role !== 'admin') {
          return renderAccessDenied();
        }
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
            statistics={store.getStatistics}
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
      {/* معاينة التقارير داخل التطبيق (طباعة / PDF) */}
      <ReportPreview />
    </>
  );
}
