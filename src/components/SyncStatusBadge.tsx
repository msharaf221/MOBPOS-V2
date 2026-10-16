import { useState, useRef, useEffect } from 'react';
import {
  Cloud,
  CloudOff,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Settings as SettingsIcon,
  Wifi,
  WifiOff,
  Zap,
  Upload,
  Copy,
  Check,
} from 'lucide-react';
import { useSyncEngine } from '../hooks/useSyncEngine';
import { syncEngine } from '../services/SyncEngine';
import { formatDate } from '../utils/format';
import { SUPABASE_SCHEMA_SQL } from '../utils/supabaseSchemaSql';

interface SyncStatusBadgeProps {
  onOpenSettings?: () => void;
}

export default function SyncStatusBadge({ onOpenSettings }: SyncStatusBadgeProps) {
  const {
    status,
    isOnline,
    pendingCount,
    lastSyncedAt,
    errorMessage,
    tenantId,
    clientId,
    isRealtimeConnected,
    triggerSyncNow,
    pushAllSnapshots,
  } = useSyncEngine();

  const [isOpen, setIsOpen] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isUploadingSnapshot, setIsUploadingSnapshot] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    setActionFeedback(null);
    try {
      const res = await triggerSyncNow();
      if (res?.error) {
        setActionFeedback(`تنبيه: ${res.error}`);
      } else {
        setActionFeedback('تمت المزامنة اللحظية ورفع اللقطة بنجاح ✅');
      }
    } catch (err) {
      setActionFeedback(err instanceof Error ? err.message : 'فشلت المزامنة');
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleSnapshotUpload = async () => {
    setIsUploadingSnapshot(true);
    setActionFeedback(null);
    try {
      const count = await pushAllSnapshots();
      setActionFeedback(`تم رفع لقطة شاملة (${count} مخزن) للسحابة بنجاح ✅`);
    } catch (err) {
      setActionFeedback(err instanceof Error ? err.message : 'فشل رفع اللقطة');
    } finally {
      setIsUploadingSnapshot(false);
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      // ignore
    }
  };

  const formatLastSync = (date: Date | null): string => {
    if (!date) return 'لم تتم بعد';
    const now = Date.now();
    const diffSec = Math.floor((now - date.getTime()) / 1000);
    if (diffSec < 15) return 'الآن';
    if (diffSec < 60) return `منذ ${diffSec} ثانية`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
    return formatDate(date.toISOString(), { hour: '2-digit', minute: '2-digit' });
  };

  // Status visual configurations
  const config = {
    synced: {
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      border: 'border-emerald-200 dark:border-emerald-800',
      dot: 'bg-emerald-500',
      label: 'متزامن لحظياً',
    },
    syncing: {
      icon: RefreshCw,
      color: 'text-sky-500',
      bg: 'bg-sky-50 dark:bg-sky-950/30',
      border: 'border-sky-200 dark:border-sky-800',
      dot: 'bg-sky-500',
      label: 'جارٍ المزامنة...',
    },
    offline: {
      icon: CloudOff,
      color: 'text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800',
      dot: 'bg-amber-500',
      label: 'غير متصل (محلي)',
    },
    error: {
      icon: AlertCircle,
      color: 'text-rose-500',
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      border: 'border-rose-200 dark:border-rose-800',
      dot: 'bg-rose-500',
      label: 'تعذر الاتصال',
    },
    disabled: {
      icon: Cloud,
      color: 'text-gray-400 dark:text-gray-500',
      bg: 'bg-gray-100 dark:bg-gray-800',
      border: 'border-gray-200 dark:border-gray-700',
      dot: 'bg-gray-400',
      label: 'المزامنة معطلة',
    },
  }[status];

  const Icon = config.icon;

  return (
    <div className="relative" ref={popoverRef}>
      {/* Trigger Button with smooth transition */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="حالة المزامنة السحابية"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all duration-300 ease-in-out ${config.bg} ${config.border} hover:shadow-sm select-none cursor-pointer`}
      >
        <span className="relative flex h-2 w-2">
          {status === 'syncing' && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.dot}`} />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dot}`} />
        </span>

        <Icon
          size={15}
          className={`${config.color} ${status === 'syncing' || isManualSyncing ? 'animate-spin' : ''}`}
        />

        <span className="hidden sm:inline text-gray-700 dark:text-gray-200">
          {config.label}
        </span>

        {pendingCount > 0 && (
          <span className="min-w-[18px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Details Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 sm:w-92 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 p-4 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Cloud size={18} className="text-blue-500" />
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">المزامنة السحابية</h3>
            </div>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}
            >
              {config.label}
            </span>
          </div>

          {/* Error banner if present */}
          {errorMessage && status === 'error' && (
            <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 space-y-2">
              <div className="flex items-start gap-1.5">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                <p className="font-medium leading-relaxed">{errorMessage}</p>
              </div>

              {(errorMessage.includes('SQL') || errorMessage.includes('جداول')) && (
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="w-full py-1.5 px-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  {copiedSql ? <Check size={13} /> : <Copy size={13} />}
                  {copiedSql ? 'تم نسخ كود SQL المحدث بنجاح ✅' : 'نسخ كود SQL لتشغيله في Supabase'}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  syncEngine.reconnect();
                  void syncEngine.triggerDrain(true);
                }}
                className="w-full py-1 px-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition"
              >
                <RefreshCw size={12} />
                إعادة المحاولة فوراً
              </button>
            </div>
          )}

          {/* Action Feedback message */}
          {actionFeedback && (
            <div className="mt-3 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-[11px] font-medium text-blue-700 dark:text-blue-300">
              {actionFeedback}
            </div>
          )}

          {/* Status Metrics */}
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-700/50">
              <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                {isOnline ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-amber-500" />}
                الاتصال بالشبكة
              </span>
              <span className={`font-medium ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {isOnline ? 'متصل بالإنترنت' : 'غير متصل (يعمل محلياً)'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-700/50">
              <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Zap size={14} className={isRealtimeConnected ? 'text-emerald-500' : 'text-gray-400'} />
                البث اللحظي (Realtime)
              </span>
              <span className={`font-medium ${isRealtimeConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {isRealtimeConnected ? 'مستمع نشط ⚡' : 'غير نشط'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-700/50">
              <span className="text-gray-500 dark:text-gray-400">تعديلات في الانتظار (Queue)</span>
              <span className={`font-bold ${pendingCount > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                {pendingCount} تعديل
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-700/50">
              <span className="text-gray-500 dark:text-gray-400">آخر مزامنة ناجحة</span>
              <span className="font-medium text-gray-700 dark:text-gray-300" dir="ltr">
                {formatLastSync(lastSyncedAt)}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500 dark:text-gray-400">معرّف المتجر</span>
              <span className="font-mono text-[11px] text-gray-600 dark:text-gray-300 truncate max-w-[150px]" title={tenantId}>
                {tenantId}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500 dark:text-gray-400">معرّف هذا الجهاز</span>
              <span className="font-mono text-[11px] text-gray-600 dark:text-gray-300 truncate max-w-[150px]" title={clientId}>
                {clientId}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isManualSyncing || isUploadingSnapshot || !isOnline || status === 'disabled'}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-xs transition shadow-sm cursor-pointer"
            >
              <RefreshCw size={13} className={isManualSyncing ? 'animate-spin' : ''} />
              مزامنة ورفع لقطة الآن
            </button>

            <button
              type="button"
              onClick={handleSnapshotUpload}
              disabled={isManualSyncing || isUploadingSnapshot || !isOnline || status === 'disabled'}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition cursor-pointer"
              title="رفع لقطة شاملة للمخازن (Snapshot)"
            >
              <Upload size={15} className={isUploadingSnapshot ? 'animate-bounce' : ''} />
            </button>

            {onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings();
                }}
                className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition cursor-pointer"
                title="إعدادات المزامنة"
              >
                <SettingsIcon size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
