import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  LayoutDashboard, Package, Users, Wrench, ShoppingCart,
  Wallet, Settings, LogOut, Menu, Bell, Moon, Sun,
  ChevronLeft, Smartphone, Tags, Truck, UserCog, BarChart3,
  Lock, Crown, ClipboardCheck, BookOpenText, ShoppingBag,
  CheckCheck, Trash2, X, BellOff, CalendarClock, Banknote, Info, PackageX
} from 'lucide-react';
import { User, Notification, NotificationType, AppSettings } from '../types';
import { ActiveLicense, PLAN_FEATURES } from '../license/types';
import { getDaysRemaining } from '../license/engine';
import { useIndexedDBSetting } from '../hooks/useIndexedDB';
import { countUnreadNotifications, selectVisibleNotifications } from '../utils/alerts';
import { defaultAppSettings } from '../hooks/useStore';
import { formatDate } from '../utils/format';
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
  onMarkAllNotificationsRead: () => void;
  onDismissNotification: (id: string) => void;
  onClearAllNotifications: () => void;
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
  { id: 'purchases', label: 'المشتريات', icon: ShoppingBag },
  { id: 'users', label: 'الموظفين', icon: UserCog },
  { id: 'settings', label: 'الإعدادات', icon: Settings },
];

/** Max notifications rendered before the "+N" hint kicks in. */
const MAX_VISIBLE_NOTIFICATIONS = 20;

const NOTIFICATION_META: Record<NotificationType, { icon: typeof Bell; dot: string; iconColor: string }> = {
  low_stock: { icon: PackageX, dot: 'bg-yellow-500', iconColor: 'text-yellow-500' },
  warranty_expiring: { icon: CalendarClock, dot: 'bg-red-500', iconColor: 'text-red-500' },
  maintenance_delayed: { icon: Wrench, dot: 'bg-orange-500', iconColor: 'text-orange-500' },
  customer_debt: { icon: Banknote, dot: 'bg-purple-500', iconColor: 'text-purple-500' },
  info: { icon: Info, dot: 'bg-blue-500', iconColor: 'text-blue-500' },
};

function metaFor(type: NotificationType) {
  return NOTIFICATION_META[type] || NOTIFICATION_META.info;
}

/** Arabic-aware "3 أيام / يومين / ساعة" formatting for notification timestamps. */
function arabicCount(value: number, one: string, two: string, few: string, many: string): string {
  if (value === 1) return one;
  if (value === 2) return two;
  if (value >= 3 && value <= 10) return `${value} ${few}`;
  return `${value} ${many}`;
}

function relativeTime(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${arabicCount(minutes, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة')}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${arabicCount(hours, 'ساعة', 'ساعتين', 'ساعات', 'ساعة')}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${arabicCount(days, 'يوم', 'يومين', 'أيام', 'يوم')}`;
  return formatDate(time, { year: 'numeric', month: 'short', day: 'numeric' });
}

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
  onMarkAllNotificationsRead,
  onDismissNotification,
  onClearAllNotifications,
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

  // Dismissed alerts stay in the store (so the alerts engine won't resurrect
  // them) but never reach the list or the badge.
  const visibleNotifications = useMemo(() => selectVisibleNotifications(notifications), [notifications]);
  const unreadCount = useMemo(() => countUnreadNotifications(notifications), [notifications]);

  // Close the dropdown on outside click / Escape.
  const notificationsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showNotifications) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowNotifications(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNotifications]);

  // Clicking an alert marks it read and jumps to the page it points at.
  const handleNotificationClick = (notif: Notification) => {
    if (!notif.isRead) onMarkNotificationRead(notif.id);
    if (notif.link) onNavigate(notif.link);
    setShowNotifications(false);
  };

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
              const managerOnly = [...staffOnly, 'inventory', 'inventoryAudit', 'imei', 'sales', 'safes', 'finance', 'sideAccounts', 'suppliers', 'purchases'];
              
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
                      ينتهي: {formatDate(license.expiresAt)}
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
                <div className="relative" ref={notificationsRef}>
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    aria-label="الإشعارات"
                    aria-expanded={showNotifications}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition relative"
                  >
                    <Bell size={20} className="text-gray-600 dark:text-gray-300" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '+9' : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Notifications Dropdown */}
                  {showNotifications && (
                    <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
                        <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                          الإشعارات
                          {unreadCount > 0 && (
                            <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300">
                              {unreadCount} جديد
                            </span>
                          )}
                        </h3>
                        {visibleNotifications.length > 0 && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={onMarkAllNotificationsRead}
                              disabled={unreadCount === 0}
                              title="تعليم الكل كمقروء"
                              aria-label="تعليم الكل كمقروء"
                              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <CheckCheck size={16} />
                            </button>
                            <button
                              onClick={onClearAllNotifications}
                              title="مسح كل الإشعارات"
                              aria-label="مسح كل الإشعارات"
                              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {visibleNotifications.length === 0 ? (
                          <div className="p-8 text-center">
                            <BellOff size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">لا توجد إشعارات</p>
                          </div>
                        ) : (
                          <>
                            {visibleNotifications.slice(0, MAX_VISIBLE_NOTIFICATIONS).map(notif => {
                              const meta = metaFor(notif.type);
                              const Icon = meta.icon;
                              return (
                                <div
                                  key={notif.id}
                                  onClick={() => handleNotificationClick(notif)}
                                  className={`group flex items-start gap-2 p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60 transition ${
                                    !notif.isRead ? 'bg-blue-50/70 dark:bg-blue-900/20' : ''
                                  }`}
                                >
                                  <span className={`mt-0.5 shrink-0 ${meta.iconColor}`}>
                                    <Icon size={16} />
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm leading-snug ${
                                      notif.isRead
                                        ? 'text-gray-600 dark:text-gray-300'
                                        : 'font-semibold text-gray-800 dark:text-white'
                                    }`}>
                                      {notif.title}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{notif.message}</p>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                                      {relativeTime(notif.createdAt)}
                                    </p>
                                  </div>
                                  {!notif.isRead && (
                                    <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${meta.dot}`} />
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDismissNotification(notif.id);
                                    }}
                                    title="إخفاء الإشعار"
                                    aria-label="إخفاء الإشعار"
                                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              );
                            })}
                            {visibleNotifications.length > MAX_VISIBLE_NOTIFICATIONS && (
                              <p className="p-3 text-center text-xs text-gray-500 dark:text-gray-400">
                                +{visibleNotifications.length - MAX_VISIBLE_NOTIFICATIONS} إشعار آخر
                              </p>
                            )}
                          </>
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
