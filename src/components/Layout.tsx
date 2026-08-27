import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Package, Users, Wrench, ShoppingCart,
  Wallet, Settings, LogOut, Menu, Bell, Moon, Sun,
  ChevronLeft, Smartphone, Tags, Truck, UserCog, BarChart3,
  Lock, Crown, ClipboardCheck, BookOpenText
} from 'lucide-react';
import { User, Notification, AppSettings } from '../types';
import { ActiveLicense, PLAN_FEATURES } from '../license/types';
import { getDaysRemaining } from '../license/engine';
import { useIndexedDBSetting } from '../hooks/useIndexedDB';
import { defaultAppSettings } from '../hooks/useStore';
import TitleBar from './TitleBar';

// Must match the event name dispatched from Settings.tsx after saving branding changes.
const BRANDING_UPDATED_EVENT = 'mobpos:appSettingsUpdated';

interface LayoutProps {
  children: React.ReactNode;
  currentUser: User;
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  notifications: Notification[];
  onMarkNotificationRead: (id: string) => void;
  license: ActiveLicense | null;
  onDeactivateLicense: () => void;
  shopName: string;
}

const menuItems = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'pos', label: 'نقطة البيع', icon: ShoppingCart },
  { id: 'inventory', label: 'المخزون', icon: Package },
  { id: 'inventoryAudit', label: 'جرد المخزون', icon: ClipboardCheck },
  { id: 'imei', label: 'إدارة IMEI', icon: Smartphone },
  { id: 'maintenance', label: 'الصيانة', icon: Wrench },
  { id: 'customers', label: 'العملاء', icon: Users },
  { id: 'sales', label: 'المبيعات', icon: Tags },
  { id: 'safes', label: 'الخزائن', icon: Wallet },
  { id: 'finance', label: 'المالية', icon: BarChart3 },
  { id: 'sideAccounts', label: 'الحسابات الجانبية', icon: BookOpenText },
  { id: 'suppliers', label: 'الموردين', icon: Truck },
  { id: 'users', label: 'الموظفين', icon: UserCog },
  { id: 'settings', label: 'الإعدادات', icon: Settings },
];

export default function Layout({
  children,
  currentUser,
  currentPage,
  onNavigate,
  onLogout,
  isDarkMode,
  onToggleDarkMode,
  notifications,
  onMarkNotificationRead,
  license,
  
  shopName
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);

  // Branding settings (logo / accent color / theme style). Read directly so
  // Layout has live access without needing extra prop-drilling through App.tsx.
  const [appSettings] = useIndexedDBSetting<AppSettings>('shopSettings', defaultAppSettings);
  const [brandingSettings, setBrandingSettings] = useState<AppSettings>(defaultAppSettings);

  useEffect(() => {
    setBrandingSettings(appSettings);
  }, [appSettings]);

  // Listen for live branding updates broadcast from Settings.tsx so changes
  // (logo, accent color, theme) apply immediately without a reload.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AppSettings>).detail;
      if (detail) setBrandingSettings(detail);
    };
    window.addEventListener(BRANDING_UPDATED_EVENT, handler);
    return () => window.removeEventListener(BRANDING_UPDATED_EVENT, handler);
  }, []);

  // Apply the accent color CSS variable + Midnight Gold theme class app-wide.
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty('--accent', brandingSettings.accentColor || '#3b82f6');
    if (brandingSettings.themeStyle === 'midnightGold') {
      html.classList.add('theme-midnight-gold');
    } else {
      html.classList.remove('theme-midnight-gold');
    }
  }, [brandingSettings.accentColor, brandingSettings.themeStyle]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* شريط العنوان المخصص — يظهر داخل تطبيق سطح المكتب فقط */}
      <TitleBar shopName={shopName} shopLogo={brandingSettings.shopLogo} />

      <div className="flex flex-1 min-h-0 bg-gray-100 dark:bg-gray-900">
        {/* Sidebar */}
        <aside className={`
          ${sidebarOpen ? 'w-64' : 'w-20'} 
          bg-gradient-to-b from-blue-900 to-blue-800 dark:from-gray-800 dark:to-gray-900
          text-white transition-all duration-300 flex flex-col
        `}>
          {/* Logo */}
          <div className="p-4 border-b border-blue-700 dark:border-gray-700">
            <div className="flex items-center justify-between">
              {sidebarOpen && (
                <h1 className="text-xl font-bold flex items-center gap-2 min-w-0">
                  {brandingSettings.shopLogo ? (
                    <img src={brandingSettings.shopLogo} alt={shopName} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                  ) : (
                    <span>📱</span>
                  )}
                  <span className="truncate">{shopName}</span>
                </h1>
              )}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg hover:bg-blue-700 dark:hover:bg-gray-700 transition"
              >
                {sidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>

          {/* Menu Items */}
          <nav className="flex-1 py-4 overflow-y-auto">
            {menuItems.map(item => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              
              // Check role permissions
              const staffOnly = ['dashboard', 'pos', 'maintenance', 'customers'];
              const managerOnly = [...staffOnly, 'inventory', 'inventoryAudit', 'imei', 'sales', 'safes', 'finance', 'sideAccounts', 'suppliers'];
              
              if (currentUser.role === 'staff' && !staffOnly.includes(item.id)) return null;
              if (currentUser.role === 'manager' && !managerOnly.includes(item.id)) return null;

              // Check license plan
              const planModules = license ? PLAN_FEATURES[license.plan].modules : [];
              const isLocked = license && !planModules.includes(item.id);

              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 transition-all
                    ${isActive 
                      ? 'bg-blue-700 dark:bg-blue-600 border-r-4 border-white' 
                      : isLocked 
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-blue-700/50 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <Icon size={22} />
                  {sidebarOpen && (
                    <span className="flex-1 text-right">{item.label}</span>
                  )}
                  {sidebarOpen && isLocked && <Lock size={14} className="opacity-60" />}
                </button>
              );
            })}
          </nav>

          {/* License Info */}
          {sidebarOpen && license && (
            <div className="px-4 py-3 border-t border-blue-700 dark:border-gray-700">
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Crown size={14} className="text-yellow-400" />
                  <span className="text-xs font-bold text-yellow-200">
                    {PLAN_FEATURES[license.plan].nameAr}
                  </span>
                </div>
                {license.lifetime ? (
                  <p className="text-[10px] text-blue-200/60">
                    ∞ اشتراك دائم — لا ينتهي
                  </p>
                ) : (
                  <>
                    <p className="text-[10px] text-blue-200/60">
                      ينتهي: {new Date(license.expiresAt).toLocaleDateString('ar-EG')}
                    </p>
                    <p className="text-[10px] text-blue-200/60">
                      {getDaysRemaining(license.expiresAt)} يوم متبقي
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* User Info */}
          <div className="p-4 border-t border-blue-700 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 dark:bg-gray-600 flex items-center justify-center">
                {currentUser.name.charAt(0)}
              </div>
              {sidebarOpen && (
                <div className="flex-1">
                  <p className="font-medium">{currentUser.name}</p>
                  <p className="text-sm text-blue-200 dark:text-gray-400">
                    {currentUser.role === 'admin' ? 'مدير' : currentUser.role === 'manager' ? 'مشرف' : 'موظف'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-6 py-4">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                {menuItems.find(m => m.id === currentPage)?.label || 'لوحة التحكم'}
              </h2>

              <div className="flex items-center gap-4">
                {/* Dark Mode Toggle */}
                <button
                  onClick={onToggleDarkMode}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                >
                  {isDarkMode ? <Sun size={20} className="text-yellow-500" /> : <Moon size={20} className="text-gray-600" />}
                </button>

                {/* Notifications */}
                <div className="relative">
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition relative"
                  >
                    <Bell size={20} className="text-gray-600 dark:text-gray-300" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Notifications Dropdown */}
                  {showNotifications && (
                    <div className="absolute left-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50">
                      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="font-bold text-gray-800 dark:text-white">الإشعارات</h3>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="p-4 text-center text-gray-500">لا توجد إشعارات</p>
                        ) : (
                          notifications.slice(0, 10).map(notif => (
                            <div
                              key={notif.id}
                              onClick={() => onMarkNotificationRead(notif.id)}
                              className={`p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                                !notif.isRead ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span className={`w-2 h-2 mt-2 rounded-full ${
                                  notif.type === 'low_stock' ? 'bg-yellow-500' :
                                  notif.type === 'warranty_expiring' ? 'bg-red-500' :
                                  notif.type === 'maintenance_delayed' ? 'bg-orange-500' :
                                  'bg-blue-500'
                                }`} />
                                <div>
                                  <p className="font-medium text-sm text-gray-800 dark:text-white">{notif.title}</p>
                                  <p className="text-sm text-gray-600 dark:text-gray-400">{notif.message}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Logout */}
                <button
                  onClick={() => {
                    onLogout();
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
                >
                  <LogOut size={18} />
                  <span>خروج</span>
                </button>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-auto p-6 bg-gray-100 dark:bg-gray-900">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
