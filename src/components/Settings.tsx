import { useState, useRef, useEffect, useCallback, ChangeEvent } from 'react';
import {
  RefreshCw, Moon, Sun, Shield, Database, HardDrive,
  Globe, Palette, Bell, Lock, ChevronLeft, Store,
  Printer, Download, AlertTriangle, Info, CheckCircle,
  Monitor, Smartphone, Upload, Cloud, CloudUpload, Clock,
  History, Trash2, Loader2, KeyRound, XCircle, Crown, ImagePlus, X
} from 'lucide-react';
import { User, AppSettings } from '../types';

// Curated accent color presets shown as clickable swatches in the
// "Branding" section of the appearance tab.
const ACCENT_COLOR_PRESETS: { label: string; value: string }[] = [
  { label: 'أزرق', value: '#3b82f6' },
  { label: 'زمردي', value: '#10b981' },
  { label: 'بنفسجي', value: '#8b5cf6' },
  { label: 'وردي', value: '#f43f5e' },
  { label: 'كهرماني', value: '#f59e0b' },
  { label: 'ذهبي', value: '#d4af37' },
];

// Broadcast branding changes so other already-mounted components
// (Layout, TitleBar, Login) can react immediately without a full reload.
const BRANDING_UPDATED_EVENT = 'mobpos:appSettingsUpdated';
import { indexedDBUtils } from '../hooks/useIndexedDB';
import {
  BackupSettings, getBackupSettings, saveBackupSettings,
  runBackupNow, listLocalSnapshots, deleteLocalSnapshot,
  downloadLocalSnapshot, downloadPayload, createBackupPayload,
  restoreFromParsed, formatBackupTime, formatBytes as fmtBytes,
} from '../utils/backup';
import {
  getAccessToken, getUserEmail, listDriveBackups,
  downloadDriveBackup, deleteDriveBackup, clearTokenCache,
  DriveBackupFile,
} from '../utils/googleDrive';
import { getSyncConfig, saveSyncConfig, pushAll, pullAll } from '../utils/sync';

interface SettingsProps {
  currentUser: User;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onResetData: () => Promise<void>;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  onChangePassword: (userId: string, oldPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  onOpenMaster?: () => void;
}

export default function Settings({ currentUser, isDarkMode, onToggleDarkMode, onResetData, settings, onSaveSettings, onChangePassword, onOpenMaster }: SettingsProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'security' | 'data' | 'about'>('general');
  const [shopName, setShopName] = useState(settings.shopName);
  const [currency, setCurrency] = useState(localStorage.getItem("app_currency") || "EGP");
  const [shopPhone, setShopPhone] = useState(settings.shopPhone);
  const [shopAddress, setShopAddress] = useState(settings.shopAddress);
  const [receiptFooter, setReceiptFooter] = useState(settings.receiptFooter);
  const [notifSound, setNotifSound] = useState(settings.notifSound);
  const [autoRefresh, setAutoRefresh] = useState(settings.autoRefresh);
  const [shopLogo, setShopLogo] = useState<string | undefined>(settings.shopLogo);
  const [accentColor, setAccentColor] = useState<string>(settings.accentColor || '#3b82f6');
  const [themeStyle, setThemeStyle] = useState<'default' | 'midnightGold'>(settings.themeStyle || 'default');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [savedMsg, setSavedMsg] = useState('');

  const [resetting, setResetting] = useState(false);

  // ===== Sync state =====
  const [syncUrl, setSyncUrl] = useState(() => getSyncConfig().url);
  const [syncKey, setSyncKey] = useState(() => getSyncConfig().anonKey);
  const [syncTenant, setSyncTenant] = useState(() => getSyncConfig().tenantId || '');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // ===== Backup state =====
  const [backupSettings, setBackupSettings] = useState<BackupSettings | null>(null);
  const [snapshots, setSnapshots] = useState<Awaited<ReturnType<typeof listLocalSnapshots>>>([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [clientIdDraft, setClientIdDraft] = useState('');
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveBackupFile[]>([]);
  const [showDriveHelp, setShowDriveHelp] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // ===== Password change state =====
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const flashBackupMsg = (kind: 'ok' | 'err', text: string) => {
    setBackupMsg({ kind, text });
    setTimeout(() => setBackupMsg(null), 6000);
  };

  const refreshBackupData = useCallback(async () => {
    const [s, snaps] = await Promise.all([getBackupSettings(), listLocalSnapshots()]);
    setBackupSettings(s);
    setSnapshots(snaps);
    setClientIdDraft(s.driveClientId || '');
  }, []);

  useEffect(() => {
    refreshBackupData().catch(() => undefined);
  }, [refreshBackupData]);

  const handleManualBackup = async (toDrive: boolean) => {
    setBackupBusy(true);
    setBackupMsg(null);
    const result = await runBackupNow(toDrive);
    setBackupBusy(false);
    if (!result.ok) {
      flashBackupMsg('err', result.error || 'فشل إنشاء النسخة الاحتياطية');
      return;
    }
    if (toDrive && !result.driveUploaded) {
      flashBackupMsg('err', `تم الحفظ محليًا ✅ لكن الرفع إلى جوجل فشل: ${result.driveError || 'غير معروف'}`);
    } else if (toDrive) {
      flashBackupMsg('ok', 'تم إنشاء النسخة ورفعها إلى Google Drive ✅');
    } else {
      flashBackupMsg('ok', 'تم إنشاء النسخة الاحتياطية وحفظها محليًا ✅');
    }
    await refreshBackupData();
  };

  const handleConnectDrive = async () => {
    const id = clientIdDraft.trim();
    if (!id) {
      flashBackupMsg('err', 'أدخل Google OAuth Client ID أولاً (راجع خطوات التجهيز بالأسفل)');
      setShowDriveHelp(true);
      return;
    }
    setDriveBusy(true);
    try {
      const token = await getAccessToken(id, false);
      if (!token) {
        flashBackupMsg('err', 'تعذر الاتصال بحساب Google — تأكد من Client ID ومن اتصال الإنترنت');
        return;
      }
      const email = await getUserEmail(token);
      await saveBackupSettings({ driveClientId: id, driveConnectedEmail: email });
      flashBackupMsg('ok', `تم ربط Google Drive بنجاح${email ? ` (${email})` : ''} ✅`);
      await refreshBackupData();
      await handleRefreshDriveFiles();
    } finally {
      setDriveBusy(false);
    }
  };

  const handleDisconnectDrive = async () => {
    clearTokenCache();
    await saveBackupSettings({ driveConnectedEmail: null, driveAutoUpload: false });
    setDriveFiles([]);
    flashBackupMsg('ok', 'تم فصل Google Drive. (يبقى Client ID محفوظًا لإعادة الربط)');
    await refreshBackupData();
  };

  const handleRefreshDriveFiles = async () => {
    const s = backupSettings || await getBackupSettings();
    if (!s.driveClientId || !s.driveConnectedEmail) return;
    const token = await getAccessToken(s.driveClientId, true);
    if (!token) {
      // fall back to interactive token so the list can load
      const interactive = await getAccessToken(s.driveClientId, false);
      if (!interactive) return;
      setDriveFiles(await listDriveBackups(interactive));
      return;
    }
    setDriveFiles(await listDriveBackups(token));
  };

  const handleRestorePayload = async (parsed: unknown) => {
    if (!confirm('سيتم استبدال جميع البيانات الحالية بالبيانات من النسخة الاحتياطية. هل أنت متأكد؟')) return;
    try {
      await restoreFromParsed(parsed);
      showSaved();
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      alert('النسخة الاحتياطية غير صالحة');
    }
  };

  const handleRestoreSnapshot = async (id: string) => {
    const snap = snapshots.find(s => s.id === id);
    if (!snap) return;
    setRestoringId(id);
    // reload the full snapshot (list view strips payloads)
    const all = await indexedDBUtils.getAll<{ id: string; payload: unknown }>(indexedDBUtils.STORES.backups);
    const full = all.find(s => s.id === id);
    setRestoringId(null);
    if (!full?.payload) {
      alert('تعذر قراءة النسخة');
      return;
    }
    await handleRestorePayload(full.payload);
  };

  const handleRestoreDriveFile = async (fileId: string) => {
    const s = backupSettings || await getBackupSettings();
    if (!s.driveClientId) return;
    setRestoringId(fileId);
    try {
      let token = await getAccessToken(s.driveClientId, true);
      if (!token) token = await getAccessToken(s.driveClientId, false);
      if (!token) {
        alert('تعذر الاتصال بـ Google Drive');
        return;
      }
      const payload = await downloadDriveBackup(token, fileId);
      await handleRestorePayload(payload);
    } catch {
      alert('فشل تنزيل النسخة من Google Drive');
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteDriveFile = async (fileId: string) => {
    const s = backupSettings || await getBackupSettings();
    if (!s.driveClientId) return;
    if (!confirm('حذف هذه النسخة من Google Drive؟')) return;
    try {
      let token = await getAccessToken(s.driveClientId, true);
      if (!token) token = await getAccessToken(s.driveClientId, false);
      if (!token) return;
      await deleteDriveBackup(token, fileId);
      await handleRefreshDriveFiles();
    } catch {
      alert('فشل الحذف من Google Drive');
    }
  };

  const handleToggleAuto = async (enabled: boolean) => {
    await saveBackupSettings({ autoEnabled: enabled });
    await refreshBackupData();
  };

  const handleAutoHourChange = async (hour: number) => {
    await saveBackupSettings({ autoHour: hour });
    await refreshBackupData();
  };

  const handleToggleDriveAuto = async (enabled: boolean) => {
    await saveBackupSettings({ driveAutoUpload: enabled });
    await refreshBackupData();
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (pwNew !== pwConfirm) {
      setPwMsg({ kind: 'err', text: 'كلمتا المرور الجديدتان غير متطابقتين' });
      return;
    }
    const result = await onChangePassword(currentUser.id, pwOld, pwNew);
    if (result.ok) {
      setPwMsg({ kind: 'ok', text: 'تم تغيير كلمة المرور بنجاح ✅' });
      setPwOld(''); setPwNew(''); setPwConfirm('');
      setTimeout(() => setPwMsg(null), 4000);
    } else {
      setPwMsg({ kind: 'err', text: result.error || 'حدث خطأ' });
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await onResetData();
      setShowResetConfirm(false);
      window.location.reload();
    } catch {
      alert('حدث خطأ أثناء إعادة التعيين');
      setResetting(false);
    }
  };

  const showSaved = () => {
    setSavedMsg('تم الحفظ بنجاح ✅');
    setTimeout(() => setSavedMsg(''), 2500);
  };

  useEffect(() => {
    setShopName(settings.shopName);
    setShopPhone(settings.shopPhone);
    setShopAddress(settings.shopAddress);
    setReceiptFooter(settings.receiptFooter);
    setNotifSound(settings.notifSound);
    setAutoRefresh(settings.autoRefresh);
    setShopLogo(settings.shopLogo);
    setAccentColor(settings.accentColor || '#3b82f6');
    setThemeStyle(settings.themeStyle || 'default');
  }, [settings]);

  const [storageInfo, setStorageInfo] = useState({ usage: 0, quota: 0 });

  // Get IndexedDB storage info
  useEffect(() => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(estimate => {
        setStorageInfo({
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
        });
      });
    }
  }, []);

  const persistBranding = useCallback((overrides: Partial<AppSettings>) => {
    const updated: AppSettings = {
      shopName,
      shopPhone,
      shopAddress,
      receiptFooter,
      notifSound,
      autoRefresh,
      shopLogo,
      accentColor,
      themeStyle,
      ...overrides,
    };
    onSaveSettings(updated);
    window.dispatchEvent(new CustomEvent(BRANDING_UPDATED_EVENT, { detail: updated }));
  }, [shopName, shopPhone, shopAddress, receiptFooter, notifSound, autoRefresh, shopLogo, accentColor, themeStyle, onSaveSettings]);

  const handleLogoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const MAX_LOGO_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_LOGO_BYTES) {
      alert('حجم الصورة كبير جداً، الرجاء اختيار صورة أصغر من 2 ميجابايت');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setShopLogo(dataUrl);
      persistBranding({ shopLogo: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveLogo = () => {
    setShopLogo(undefined);
    persistBranding({ shopLogo: undefined });
  };

  const handleAccentColorChange = (color: string) => {
    setAccentColor(color);
    persistBranding({ accentColor: color });
  };

  const handleThemeStyleChange = (style: 'default' | 'midnightGold') => {
    setThemeStyle(style);
    if (style === 'midnightGold' && !isDarkMode) {
      onToggleDarkMode();
    }
    persistBranding({ themeStyle: style });
  };

  const handleSaveSettings = () => {
    persistBranding({});
    
    // Save currency to localStorage
    const oldCurr = localStorage.getItem('app_currency');
    localStorage.setItem('app_currency', currency);
    
    // Always force Arabic
    localStorage.setItem('app_language', 'ar');
    if (currency === 'SAR') {
        localStorage.setItem('app_locale', 'ar-SA');
    } else if (currency === 'AED') {
        localStorage.setItem('app_locale', 'ar-AE');
    } else {
        localStorage.setItem('app_locale', 'ar-EG');
    }
    
    if (oldCurr !== currency) {
      window.location.reload();
    } else {
      showSaved();
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const tabs = [
    { id: 'general' as const, label: 'عام', icon: Store },
    { id: 'appearance' as const, label: 'المظهر', icon: Palette },
    { id: 'security' as const, label: 'الأمان', icon: Lock },
    { id: 'data' as const, label: 'البيانات', icon: Database },
    { id: 'about' as const, label: 'حول النظام', icon: Info },
  ];

  return (
    <div className="animate-fadeIn">
      {/* Toast Notification */}
      {savedMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[999] bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle size={18} />
          {savedMsg}
        </div>
      )}

      {/* Header Card */}
      <div className="bg-gradient-to-l from-blue-600 via-blue-700 to-indigo-700 rounded-2xl p-6 mb-6 text-white shadow-lg">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center text-3xl font-bold border-2 border-white/30">
            {currentUser.name.charAt(0)}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{currentUser.name}</h2>
            <p className="text-blue-200 mt-0.5">@{currentUser.username}</p>
            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${
              currentUser.role === 'admin' 
                ? 'bg-red-500/30 text-red-100 border border-red-400/40' 
                : currentUser.role === 'manager' 
                ? 'bg-blue-500/30 text-blue-100 border border-blue-400/40' 
                : 'bg-white/20 text-white border border-white/30'
            }`}>
              {currentUser.role === 'admin' ? '🔑 مدير النظام' :
               currentUser.role === 'manager' ? '📋 مشرف' : '👤 موظف'}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Tabs */}
        <div className="lg:w-56 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-5 py-4 text-right transition-all ${
                    activeTab === tab.id
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-r-4 border-blue-600 font-bold'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Icon size={20} />
                  <span>{tab.label}</span>
                  {activeTab === tab.id && <ChevronLeft size={16} className="mr-auto" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-w-0">
          {/* ===== TAB: General ===== */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Store size={20} className="text-blue-600" />
                  بيانات المحل
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">المعلومات الأساسية للمحل التي تظهر على الفواتير والإيصالات</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">اسم المحل</label>
                    <input
                      type="text"
                      value={shopName}
                      onChange={e => setShopName(e.target.value)}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">رقم الهاتف</label>
                    <input
                      type="tel"
                      value={shopPhone}
                      onChange={e => setShopPhone(e.target.value)}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">العنوان</label>
                    <input
                      type="text"
                      value={shopAddress}
                      onChange={e => setShopAddress(e.target.value)}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Printer size={20} className="text-purple-600" />
                  إعدادات الإيصال
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">تخصيص الرسالة التي تظهر أسفل الإيصال</p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">رسالة أسفل الإيصال</label>
                  <textarea
                    value={receiptFooter}
                    onChange={e => setReceiptFooter(e.target.value)}
                    rows={2}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Bell size={20} className="text-yellow-500" />
                  الإشعارات
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">التحكم في إشعارات النظام</p>

                <div className="space-y-4">
                  <ToggleRow
                    label="صوت الإشعارات"
                    description="تشغيل صوت عند وصول إشعار جديد"
                    checked={notifSound}
                    onChange={setNotifSound}
                  />
                  <ToggleRow
                    label="تحديث تلقائي"
                    description="تحديث البيانات تلقائياً كل 5 دقائق"
                    checked={autoRefresh}
                    onChange={setAutoRefresh}
                  />
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20"
              >
                💾 حفظ الإعدادات
              </button>
            </div>
          )}

          {/* ===== TAB: Appearance ===== */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Palette size={20} className="text-pink-500" />
                  المظهر العام
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">اختر المظهر المناسب لك</p>

                {/* Theme Selection Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {/* Light Mode Card */}
                  <button
                    onClick={() => {
                      if (isDarkMode) onToggleDarkMode();
                      if (themeStyle === 'midnightGold') handleThemeStyleChange('default');
                    }}
                    className={`relative p-5 rounded-2xl border-2 transition-all text-right ${
                      !isDarkMode && themeStyle !== 'midnightGold'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg shadow-blue-500/20' 
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    {!isDarkMode && themeStyle !== 'midnightGold' && (
                      <div className="absolute top-3 left-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <CheckCircle size={14} className="text-white" />
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-yellow-300 to-orange-400 rounded-2xl flex items-center justify-center shadow-inner">
                        <Sun size={28} className="text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 dark:text-white text-lg">الوضع النهاري</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">ألوان فاتحة ومريحة للعين</p>
                      </div>
                    </div>
                    {/* Mini Preview */}
                    <div className="mt-4 bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
                      <div className="flex gap-2 mb-2">
                        <div className="w-8 h-2 bg-gray-200 rounded"></div>
                        <div className="w-12 h-2 bg-blue-200 rounded"></div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 h-10 bg-gray-100 rounded"></div>
                        <div className="flex-1 h-10 bg-gray-100 rounded"></div>
                      </div>
                    </div>
                  </button>

                  {/* Dark Mode Card */}
                  <button
                    onClick={() => {
                      if (!isDarkMode) onToggleDarkMode();
                      if (themeStyle === 'midnightGold') handleThemeStyleChange('default');
                    }}
                    className={`relative p-5 rounded-2xl border-2 transition-all text-right ${
                      isDarkMode && themeStyle !== 'midnightGold'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg shadow-blue-500/20' 
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    {isDarkMode && themeStyle !== 'midnightGold' && (
                      <div className="absolute top-3 left-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <CheckCircle size={14} className="text-white" />
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl flex items-center justify-center shadow-inner">
                        <Moon size={28} className="text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 dark:text-white text-lg">الوضع الليلي</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">ألوان داكنة لراحة العين ليلاً</p>
                      </div>
                    </div>
                    {/* Mini Preview */}
                    <div className="mt-4 bg-gray-800 rounded-xl p-3 border border-gray-700">
                      <div className="flex gap-2 mb-2">
                        <div className="w-8 h-2 bg-gray-600 rounded"></div>
                        <div className="w-12 h-2 bg-blue-800 rounded"></div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 h-10 bg-gray-700 rounded"></div>
                        <div className="flex-1 h-10 bg-gray-700 rounded"></div>
                      </div>
                    </div>
                  </button>

                  {/* Midnight Gold Card */}
                  <button
                    onClick={() => handleThemeStyleChange(themeStyle === 'midnightGold' ? 'default' : 'midnightGold')}
                    className={`relative p-5 rounded-2xl border-2 transition-all text-right ${
                      themeStyle === 'midnightGold'
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/10 shadow-lg shadow-amber-500/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    {themeStyle === 'midnightGold' && (
                      <div className="absolute top-3 left-3 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                        <CheckCircle size={14} className="text-white" />
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-[#3a2f1a] to-[#0f0e0c] rounded-2xl flex items-center justify-center shadow-inner border border-amber-500/30">
                        <Crown size={26} className="text-amber-400" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 dark:text-white text-lg">ميدنايت جولد</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">مظهر فاخر داكن بلمسة ذهبية</p>
                      </div>
                    </div>
                    {/* Mini Preview */}
                    <div className="mt-4 bg-[#141210] rounded-xl p-3 border border-amber-900/40">
                      <div className="flex gap-2 mb-2">
                        <div className="w-8 h-2 bg-amber-700/60 rounded"></div>
                        <div className="w-12 h-2 bg-amber-500/70 rounded"></div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 h-10 bg-[#1a1815] rounded border border-amber-900/30"></div>
                        <div className="flex-1 h-10 bg-[#1a1815] rounded border border-amber-900/30"></div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Store size={20} className="text-amber-500" />
                  هوية المتجر
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">شعار المتجر ولون العلامة التجارية الخاص بك</p>

                {/* Shop Logo Upload */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">شعار المتجر</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-700 shrink-0">
                      {shopLogo ? (
                        <img src={shopLogo} alt="شعار المتجر" className="w-full h-full object-contain" />
                      ) : (
                        <ImagePlus size={22} className="text-gray-400" />
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoFileChange}
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-all flex items-center gap-2"
                      >
                        <Upload size={16} />
                        رفع شعار
                      </button>
                      {shopLogo && (
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-bold rounded-lg transition-all hover:bg-red-100 dark:hover:bg-red-900/30 flex items-center gap-2"
                        >
                          <X size={16} />
                          إزالة الشعار
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">الحد الأقصى لحجم الصورة 2 ميجابايت</p>
                </div>

                {/* Accent Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">لون العلامة التجارية</label>
                  <div className="flex items-center flex-wrap gap-3">
                    {ACCENT_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => handleAccentColorChange(preset.value)}
                        title={preset.label}
                        className={`w-9 h-9 rounded-full border-2 transition-all ${
                          accentColor.toLowerCase() === preset.value.toLowerCase()
                            ? 'border-gray-800 dark:border-white scale-110'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: preset.value }}
                      />
                    ))}
                    <div className="flex items-center gap-2 ms-1">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => handleAccentColorChange(e.target.value)}
                        className="w-9 h-9 rounded-full border-2 border-gray-200 dark:border-gray-600 cursor-pointer bg-transparent p-0"
                        title="لون مخصص"
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">مخصص</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Globe size={20} className="text-green-500" />
                  اللغة والمنطقة
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">إعدادات اللغة والعملة</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">العملة</label>
                    <select 
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                    >
                      <option value="EGP">جنيه مصري (EGP)</option>
                      <option value="SAR">ريال سعودي (SAR)</option>
                      <option value="AED">درهم إماراتي (AED)</option>
                      <option value="USD">دولار أمريكي (USD)</option>
                    </select>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20"
              >
                💾 حفظ الإعدادات
              </button>
            </div>
          )}

          {/* ===== TAB: Security ===== */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Shield size={20} className="text-green-500" />
                  صلاحيات حسابك
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">الصفحات والإجراءات المتاحة لك حسب صلاحيتك</p>

                <div className={`p-4 rounded-xl border-2 mb-6 ${
                  currentUser.role === 'admin'
                    ? 'bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800'
                    : currentUser.role === 'manager'
                    ? 'bg-blue-50 dark:bg-blue-900/15 border-blue-200 dark:border-blue-800'
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      currentUser.role === 'admin' ? 'bg-red-200 dark:bg-red-800' :
                      currentUser.role === 'manager' ? 'bg-blue-200 dark:bg-blue-800' :
                      'bg-gray-200 dark:bg-gray-600'
                    }`}>
                      {currentUser.role === 'admin' ? '🔑' : currentUser.role === 'manager' ? '📋' : '👤'}
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 dark:text-white">
                        {currentUser.role === 'admin' ? 'مدير النظام' :
                         currentUser.role === 'manager' ? 'مشرف' : 'موظف'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {currentUser.role === 'admin' ? 'صلاحيات كاملة على جميع أجزاء النظام' :
                         currentUser.role === 'manager' ? 'صلاحيات إدارية بدون إدارة الموظفين' :
                         'صلاحيات محدودة للعمل اليومي'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Permissions Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { name: 'لوحة التحكم', roles: ['admin', 'manager', 'staff'] },
                    { name: 'نقطة البيع', roles: ['admin', 'manager', 'staff'] },
                    { name: 'الصيانة', roles: ['admin', 'manager', 'staff'] },
                    { name: 'العملاء', roles: ['admin', 'manager', 'staff'] },
                    { name: 'المخزون', roles: ['admin', 'manager'] },
                    { name: 'إدارة IMEI', roles: ['admin', 'manager'] },
                    { name: 'المبيعات', roles: ['admin', 'manager'] },
                    { name: 'الخزائن', roles: ['admin', 'manager'] },
                    { name: 'المالية', roles: ['admin', 'manager'] },
                    { name: 'الموردين', roles: ['admin', 'manager'] },
                    { name: 'الموظفين', roles: ['admin'] },
                    { name: 'الإعدادات', roles: ['admin'] },
                    { name: 'إعادة تعيين البيانات', roles: ['admin'] },
                  ].map(perm => {
                    const hasAccess = perm.roles.includes(currentUser.role);
                    return (
                      <div
                        key={perm.name}
                        className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
                          hasAccess
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 line-through'
                        }`}
                      >
                        {hasAccess ? (
                          <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                        ) : (
                          <Lock size={16} className="text-gray-400 flex-shrink-0" />
                        )}
                        {perm.name}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Lock size={20} className="text-orange-500" />
                  تغيير كلمة المرور
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">يمكنك تغيير كلمة المرور الخاصة بك</p>

                <div className="space-y-4 max-w-md">
                  {pwMsg && (
                    <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
                      pwMsg.kind === 'ok'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                    }`}>
                      {pwMsg.kind === 'ok' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                      {pwMsg.text}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">كلمة المرور الحالية</label>
                    <input
                      type="password"
                      value={pwOld}
                      onChange={e => setPwOld(e.target.value)}
                      placeholder="••••••••"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">كلمة المرور الجديدة</label>
                    <input
                      type="password"
                      value={pwNew}
                      onChange={e => setPwNew(e.target.value)}
                      placeholder="6 أحرف على الأقل"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">تأكيد كلمة المرور</label>
                    <input
                      type="password"
                      value={pwConfirm}
                      onChange={e => setPwConfirm(e.target.value)}
                      placeholder="••••••••"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleChangePassword}
                    disabled={!pwOld || !pwNew || !pwConfirm}
                    className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition"
                  >
                    تغيير كلمة المرور
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== TAB: Data ===== */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <HardDrive size={20} className="text-blue-500" />
                  معلومات التخزين
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">البيانات محفوظة في قاعدة بيانات IndexedDB المتقدمة</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-gray-500 dark:text-gray-400">حجم البيانات المستخدم</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatBytes(storageInfo.usage)}</p>
                    <div className="mt-2 w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${storageInfo.quota > 0 ? Math.min((storageInfo.usage / storageInfo.quota) * 100, 100) : 0}%` }}></div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">من {formatBytes(storageInfo.quota)} متاح</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                    <p className="text-sm text-gray-500 dark:text-gray-400">نوع التخزين</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 flex items-center gap-2">
                      <CheckCircle size={22} />
                      IndexedDB
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">يدعم مئات الميجابايت من البيانات</p>
                  </div>
                </div>
              </div>

              {/* Backup status toast */}
              {backupMsg && (
                <div className={`p-4 rounded-xl border flex items-start gap-2 text-sm font-medium ${
                  backupMsg.kind === 'ok'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                }`}>
                  {backupMsg.kind === 'ok' ? <CheckCircle size={18} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />}
                  <span>{backupMsg.text}</span>
                </div>
              )}

              {/* ===== CARD: Automatic Daily Backup ===== */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border-2 border-blue-200 dark:border-blue-800 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Clock size={20} className="text-blue-500" />
                  النسخ الاحتياطي اليومي التلقائي
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                  ينشئ النظام نسخة احتياطية كاملة تلقائيًا كل يوم ويحتفظ بها داخل الجهاز
                </p>

                {backupSettings ? (
                  <div className="space-y-4">
                    <ToggleRow
                      label="تفعيل النسخ التلقائي اليومي"
                      description="يعمل النظام في الخلفية وينشئ نسخة واحدة كل يوم"
                      checked={backupSettings.autoEnabled}
                      onChange={handleToggleAuto}
                    />

                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white">وقت النسخ اليومي</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">تُنشأ النسخة بعد هذا الوقت عند أول تشغيل/تحقق</p>
                      </div>
                      <select
                        value={backupSettings.autoHour}
                        onChange={e => handleAutoHourChange(Number(e.target.value))}
                        className="p-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white font-medium"
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>
                            {h.toString().padStart(2, '0')}:00
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/15 rounded-xl border border-blue-100 dark:border-blue-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400">آخر نسخة احتياطية</p>
                        <p className="font-bold text-blue-700 dark:text-blue-300 mt-1">
                          {formatBackupTime(backupSettings.lastBackupAt)}
                        </p>
                        {backupSettings.lastBackupName && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5 break-all">{backupSettings.lastBackupName}</p>
                        )}
                      </div>
                      <div className="p-3 bg-purple-50 dark:bg-purple-900/15 rounded-xl border border-purple-100 dark:border-purple-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400">آخر رفع إلى Google Drive</p>
                        <p className="font-bold text-purple-700 dark:text-purple-300 mt-1">
                          {backupSettings.driveConnectedEmail
                            ? formatBackupTime(backupSettings.lastDriveUploadAt)
                            : 'غير متصل بجوجل'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => handleManualBackup(false)}
                        disabled={backupBusy}
                        className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-lg shadow-blue-600/20"
                      >
                        {backupBusy ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
                        إنشاء نسخة الآن
                      </button>
                      <button
                        onClick={() => handleManualBackup(true)}
                        disabled={backupBusy || !backupSettings.driveClientId}
                        className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-lg shadow-emerald-600/20"
                      >
                        {backupBusy ? <Loader2 size={18} className="animate-spin" /> : <CloudUpload size={18} />}
                        نسخة الآن + رفع إلى جوجل
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-400"><Loader2 className="animate-spin" size={18} /> جاري التحميل...</div>
                )}
              </div>

              {/* ===== CARD: Google Drive Backup ===== */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Cloud size={20} className="text-emerald-500" />
                  النسخ الاحتياطي إلى Google Drive
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                  ارفع نسخك الاحتياطية إلى حسابك على جوجل لحمايتها من فقدان الجهاز
                </p>

                {backupSettings && (backupSettings.driveConnectedEmail ? (
                  /* ---- Connected state ---- */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/15 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                          <CheckCircle size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-emerald-800 dark:text-emerald-200">متصل بحساب Google</p>
                          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-mono">{backupSettings.driveConnectedEmail}</p>
                        </div>
                      </div>
                      <button
                        onClick={handleDisconnectDrive}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                      >
                        <XCircle size={16} />
                        فصل
                      </button>
                    </div>

                    <ToggleRow
                      label="رفع تلقائي إلى Google Drive"
                      description="مع النسخة اليومية التلقائية (يتم الرفع بصمت عند توفر جلسة جوجل)"
                      checked={backupSettings.driveAutoUpload}
                      onChange={handleToggleDriveAuto}
                    />

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => handleManualBackup(true)}
                        disabled={backupBusy}
                        className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition"
                      >
                        {backupBusy ? <Loader2 size={18} className="animate-spin" /> : <CloudUpload size={18} />}
                        رفع نسخة الآن
                      </button>
                      <button
                        onClick={handleRefreshDriveFiles}
                        className="flex items-center gap-2 px-5 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold rounded-xl transition"
                      >
                        <RefreshCw size={18} />
                        تحديث القائمة
                      </button>
                    </div>

                    {/* Drive backups list */}
                    {driveFiles.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                          <History size={16} /> النسخ الموجودة على Drive ({driveFiles.length})
                        </p>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {driveFiles.map(f => (
                            <div key={f.id} className="flex items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                              <div className="min-w-0">
                                <p className="font-mono text-sm text-gray-800 dark:text-gray-200 truncate">{f.name}</p>
                                <p className="text-xs text-gray-400">
                                  {formatBackupTime(f.createdTime)} — {fmtBytes(Number(f.size) || 0)}
                                </p>
                              </div>
                              <div className="flex gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => handleRestoreDriveFile(f.id)}
                                  disabled={restoringId === f.id}
                                  title="استعادة"
                                  className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/60 transition disabled:opacity-50"
                                >
                                  {restoringId === f.id ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                </button>
                                <button
                                  onClick={() => handleDeleteDriveFile(f.id)}
                                  title="حذف"
                                  className="p-2 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/60 transition"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ---- Not connected state ---- */
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/15 rounded-xl border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                      <span>
                        للربط مع جوجل تحتاج إلى <b>Google OAuth Client ID</b> مجاني من Google Cloud Console.
                        اتبع الخطوات بالأسفل ثم الصِف المُعرِّف هنا.
                      </span>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Google OAuth Client ID
                      </label>
                      <input
                        type="text"
                        value={clientIdDraft}
                        onChange={e => setClientIdDraft(e.target.value)}
                        placeholder="xxxxxxxx.apps.googleusercontent.com"
                        dir="ltr"
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={handleConnectDrive}
                        disabled={driveBusy || !clientIdDraft.trim()}
                        className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-lg shadow-emerald-600/20"
                      >
                        {driveBusy ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                        ربط Google Drive
                      </button>
                      <button
                        onClick={() => setShowDriveHelp(v => !v)}
                        className="flex items-center gap-2 px-5 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold rounded-xl transition"
                      >
                        <Info size={18} />
                        خطوات التجهيز
                      </button>
                    </div>

                    {showDriveHelp && (
                      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm text-gray-600 dark:text-gray-300 space-y-2 list-decimal list-inside">
                        <p className="font-bold text-gray-800 dark:text-white">كيف تحصل على Client ID (مرة واحدة فقط):</p>
                        <ol className="space-y-1.5 pl-2">
                          <li>افتح <span className="font-mono text-xs" dir="ltr">console.cloud.google.com</span> وسجّل دخولك بحساب جوجل الخاص بالمحل.</li>
                          <li>أنشئ مشروعًا جديدًا (أو اختر مشروعًا موجودًا).</li>
                          <li>من <b>APIs &amp; Services → Library</b> فعّل <b>Google Drive API</b>.</li>
                          <li>من <b>APIs &amp; Services → OAuth consent screen</b> اختر <b>External</b> وأدخل اسم التطبيق وبريدك (لا يحتاج نشرًا عامًا).</li>
                          <li>من <b>Credentials → Create Credentials → OAuth client ID</b> اختر نوع <b>Web application</b>.</li>
                          <li>في <b>Authorized JavaScript origins</b> أضف الرابط الذي يعمل عليه النظام بالضبط (مثال: <span className="font-mono text-xs" dir="ltr">https://myshop.example.com</span>).</li>
                          <li>انسخ <b>Client ID</b> والصقه في الخانة أعلاه ثم اضغط "ربط Google Drive".</li>
                        </ol>
                        <p className="text-amber-700 dark:text-amber-400 mt-2">
                          ⚠️ ملاحظة: الربط يعمل عندما يعمل النظام من خلال رابط ويب (http/https)، ولا يعمل إذا كان الملف مفتوحًا مباشرة من القرص.
                          النطاق <span className="font-mono text-xs" dir="ltr">drive.file</span> يعني أن التطبيق لا يرى إلا الملفات التي ينشئها بنفسه.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* ===== CARD: Local Snapshots ===== */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <History size={20} className="text-indigo-500" />
                  النسخ المحفوظة على هذا الجهاز
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  يحتفظ النظام تلقائيًا بآخر {backupSettings?.retentionLocal ?? 7} نسخ يومية داخلية — يمكنك استعادة أي نسخة أو تنزيلها كملف
                </p>

                {snapshots.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 p-4 bg-gray-50 dark:bg-gray-700/40 rounded-xl text-center">
                    لا توجد نسخ محفوظة بعد — اضغط "إنشاء نسخة الآن" بالأعلى
                  </p>
                ) : (
                  <div className="space-y-2">
                    {snapshots.map(snap => (
                      <div key={snap.id} className="flex items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-gray-800 dark:text-gray-200 truncate">
                            {snap.name}
                            {snap.auto && <span className="mr-2 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full">تلقائي</span>}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatBackupTime(snap.createdAt)} — {fmtBytes(snap.size)}
                          </p>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => handleRestoreSnapshot(snap.id)}
                            disabled={restoringId === snap.id}
                            title="استعادة هذه النسخة"
                            className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/60 transition disabled:opacity-50"
                          >
                            {restoringId === snap.id ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                          </button>
                          <button
                            onClick={() => downloadLocalSnapshot(snap.id).catch(() => alert('فشل التنزيل'))}
                            title="تنزيل كملف"
                            className="p-2 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition"
                          >
                            <Download size={16} />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('حذف هذه النسخة من الجهاز؟')) return;
                              await deleteLocalSnapshot(snap.id);
                              await refreshBackupData();
                            }}
                            title="حذف"
                            className="p-2 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/60 transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ===== CARD: Multi-device Sync (Supabase) ===== */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Cloud size={20} className="text-sky-500" />
                  المزامنة بين الأجهزة (Supabase — تجريبي)
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  اربط حساب Supabase لتشغيل أكثر من جهاز على نفس بيانات المتجر. نفّذ ملف <span className="font-mono text-xs" dir="ltr">supabase/schema.sql</span> في محرر SQL في Supabase أولاً.
                </p>

                {/* Warning note */}
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 mb-4 flex items-start gap-2">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">⚠️ تنبيه أمني بشأن المزامنة:</p>
                    <p className="text-xs mt-1 leading-relaxed">
                      المزامنة ميزة تجريبية وتعتمد على عزل البيانات بمعرّف المتجر (Tenant ID). تأكد من تنفيذ أحدث ملف <span className="font-mono" dir="ltr">schema.sql</span> في Supabase لضمان عزل البيانات عبر RLS.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">رابط Supabase URL</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={syncUrl}
                      onChange={e => setSyncUrl(e.target.value)}
                      placeholder="https://xxxx.supabase.co"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Anon Public Key</label>
                    <input
                      type="password"
                      dir="ltr"
                      value={syncKey}
                      onChange={e => setSyncKey(e.target.value)}
                      placeholder="anon public key"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">معرّف المتجر (Tenant ID)</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={syncTenant}
                      onChange={e => setSyncTenant(e.target.value)}
                      placeholder="افتراضي: معرّف الترخيص"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white font-mono text-sm"
                    />
                  </div>
                </div>

                {syncMsg && (
                  <p className={`text-sm mb-3 font-medium ${syncMsg.kind === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {syncMsg.text}
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={async () => {
                      saveSyncConfig({ url: syncUrl, anonKey: syncKey, tenantId: syncTenant });
                      setSyncMsg({ kind: 'ok', text: 'تم حفظ إعدادات المزامنة ✅' });
                    }}
                    className="px-5 py-2.5 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-xl transition"
                  >
                    حفظ الإعدادات
                  </button>
                  <button
                    onClick={async () => {
                      setSyncBusy(true); setSyncMsg(null);
                      try {
                        const n = await pushAll();
                        setSyncMsg({ kind: 'ok', text: `تم رفع بيانات هذا الجهاز إلى السحابة (${n} مخزن) ✅` });
                      } catch (err) {
                        setSyncMsg({ kind: 'err', text: err instanceof Error ? err.message : 'فشل الرفع' });
                      }
                      setSyncBusy(false);
                    }}
                    disabled={syncBusy}
                    className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold rounded-xl transition"
                  >
                    {syncBusy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    رفع بيانات هذا الجهاز
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('سيتم استبدال بيانات هذا الجهاز ببيانات السحابة. متأكد؟')) return;
                      setSyncBusy(true); setSyncMsg(null);
                      try {
                        const n = await pullAll();
                        setSyncMsg({ kind: 'ok', text: `تم تنزيل البيانات (${n} مخزن) — سيُعاد التشغيل...` });
                        setTimeout(() => window.location.reload(), 1500);
                      } catch (err) {
                        setSyncMsg({ kind: 'err', text: err instanceof Error ? err.message : 'فشل التنزيل' });
                      }
                      setSyncBusy(false);
                    }}
                    disabled={syncBusy}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition"
                  >
                    {syncBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    تنزيل من السحابة
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Download size={20} className="text-green-500" />
                  تصدير البيانات
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">تصدير نسخة احتياطية من بيانات النظام</p>

                <button
                  onClick={async () => {
                    try {
                      const payload = await createBackupPayload();
                      downloadPayload(payload);
                      showSaved();
                    } catch {
                      alert('فشل تصدير البيانات');
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition shadow-lg shadow-green-600/20"
                >
                  <Download size={18} />
                  تصدير نسخة احتياطية (ملف JSON)
                </button>
              </div>

              {/* Restore Backup */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Upload size={20} className="text-orange-500" />
                  استعادة نسخة احتياطية
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                  استرجاع بياناتك من ملف نسخة احتياطية سابق. سيتم استبدال البيانات الحالية.
                  <span className="block mt-1 text-xs">يدعم النسخ الحالية وملفات الإصدارات الأقدم (تنسيق التخزين القديم)</span>
                </p>
                <input
                  type="file"
                  accept=".json"
                  ref={fileInputRef}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const parsed = JSON.parse(text);
                      await handleRestorePayload(parsed);
                    } catch {
                      alert('حدث خطأ في قراءة الملف — تأكد أنه ملف نسخة احتياطية صالح');
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition shadow-lg shadow-orange-500/20"
                >
                  <Upload size={18} />
                  اختيار ملف للاستعادة
                </button>
              </div>

              {/* Danger Zone - Admin Only */}
              {currentUser.role === 'admin' && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border-2 border-red-200 dark:border-red-800 p-6">
                  <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-1 flex items-center gap-2">
                    <AlertTriangle size={20} />
                    منطقة الخطر
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">إجراءات لا يمكن التراجع عنها</p>

                  <div className="p-4 bg-red-50 dark:bg-red-900/15 rounded-xl border border-red-200 dark:border-red-800">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-red-800 dark:text-red-200">🗑️ إعادة تعيين جميع البيانات</p>
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                          سيتم مسح جميع البيانات الحالية واستعادة البيانات الافتراضية. هذا الإجراء نهائي!
                        </p>
                      </div>
                      <button
                        onClick={() => setShowResetConfirm(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition whitespace-nowrap shadow-lg shadow-red-600/20"
                      >
                        <RefreshCw size={18} />
                        إعادة تعيين
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== TAB: About ===== */}
          {activeTab === 'about' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center text-4xl mb-4 shadow-lg shadow-blue-500/30">
                  📱
                </div>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">MOBPOS</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-1">نظام إدارة محل الموبايلات المتكامل</p>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-mono mt-2">الإصدار {__APP_VERSION__}</p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">✨ مميزات النظام</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { icon: '📊', title: 'لوحة تحكم ذكية', desc: 'إحصائيات ورسوم بيانية تفاعلية' },
                    { icon: '🛒', title: 'نقطة بيع احترافية', desc: 'مع دعم الباركود وIMEI' },
                    { icon: '📱', title: 'إدارة IMEI متقدمة', desc: 'تتبع كل جهاز برقمين IMEI' },
                    { icon: '🔧', title: 'نظام صيانة Kanban', desc: 'تتبع وإدارة تذاكر الصيانة' },
                    { icon: '👥', title: 'إدارة العملاء', desc: 'سجل مشتريات وأجهزة كل عميل' },
                    { icon: '💰', title: 'إدارة الخزائن', desc: 'تتبع الأموال والتحويلات' },
                    { icon: '🔐', title: 'صلاحيات متعددة', desc: 'مدير ومشرف وموظف' },
                    { icon: '🌙', title: 'وضع ليلي', desc: 'لراحة عينيك أثناء العمل ليلاً' },
                  ].map(feature => (
                    <div key={feature.title} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                      <span className="text-2xl">{feature.icon}</span>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white">{feature.title}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  <Monitor size={16} />
                  معلومات تقنية
                </h3>
                <div className="space-y-3">
                  {[
                    { label: 'الواجهة الأمامية', value: 'React 19 + TypeScript' },
                    { label: 'التصميم', value: 'Tailwind CSS v4' },
                    { label: 'الرسوم البيانية', value: 'Recharts' },
                    { label: 'الأيقونات', value: 'Lucide React' },
                    { label: 'أداة البناء', value: 'Vite 8' },
                    { label: 'التخزين', value: 'IndexedDB (متصفح)' },
                    { label: 'النسخ الاحتياطي', value: 'يومي تلقائي + Google Drive' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <span className="text-gray-500 dark:text-gray-400">{item.label}</span>
                      <span className="font-medium text-gray-800 dark:text-white font-mono text-sm">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  <Smartphone size={16} />
                  يعمل على
                </h3>
                <div className="flex flex-wrap gap-3">
                  {['💻 ويندوز', '🍎 ماك', '🐧 لينكس', '📱 أندرويد', '📱 آيفون', '📟 تابلت'].map(p => (
                    <span key={p} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300">
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              {/* ===== Master Panel Access ===== */}
              {/* The panel itself is protected by the master password, so it is
                  safe even if an employee finds this button. */}
              {onOpenMaster && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <Shield size={16} />
                    لوحة الماستر
                  </h3>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      إدارة وتوليد مفاتيح التفعيل. الدخول محمي بكلمة مرور الماستر.
                      <br />
                      يمكنك أيضاً فتحها من أي شاشة بالاختصار{' '}
                      <span className="font-mono font-bold text-gray-700 dark:text-gray-300">Ctrl+Shift+M</span>
                      {' '}أو{' '}
                      <span className="font-mono font-bold text-gray-700 dark:text-gray-300">Alt+Shift+M</span>.
                    </p>
                    <button
                      onClick={onOpenMaster}
                      className="shrink-0 px-5 py-3 bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-700 dark:to-slate-800 text-white rounded-xl font-bold hover:from-slate-900 hover:to-black transition flex items-center justify-center gap-2"
                    >
                      <Shield size={18} />
                      لوحة الماستر
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="modal-overlay" onClick={() => setShowResetConfirm(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full mx-auto flex items-center justify-center mb-4">
              <AlertTriangle size={32} className="text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">تأكيد إعادة التعيين</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              هل أنت متأكد؟ سيتم <span className="font-bold text-red-500">مسح جميع البيانات</span> واستعادة البيانات الافتراضية.
              <br />
              <span className="text-sm">لا يمكن التراجع عن هذا الإجراء!</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                إلغاء
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {resetting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  '🗑️ مسح وإعادة تعيين'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Toggle Row Component =====
function ToggleRow({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
      <div>
        <p className="font-medium text-gray-800 dark:text-white">{label}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-7 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all ${
          checked ? 'right-0.5' : 'right-[22px]'
        }`} />
      </button>
    </div>
  );
}
