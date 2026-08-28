import { useEffect, useState } from 'react';
import { CheckCircle, Download, RefreshCw, AlertTriangle, Info } from 'lucide-react';
import { isDesktop } from '../utils/print';
import {
  buildUpdateCheckMessage,
  formatLastChecked,
  UpdateCheckMessage,
  UpdateCheckResponse,
} from '../utils/updateCheck';

const MESSAGE_STYLES: Record<UpdateCheckMessage['kind'], string> = {
  available: 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 text-blue-800 dark:text-blue-200',
  'up-to-date': 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200',
  error: 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-300',
  dev: 'bg-gray-50 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300',
  unknown: 'bg-gray-50 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300',
};

function StatusIcon({ kind }: { kind: UpdateCheckMessage['kind'] }) {
  if (kind === 'available') return <Download size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />;
  if (kind === 'up-to-date') return <CheckCircle size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />;
  if (kind === 'error') return <AlertTriangle size={18} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />;
  return <Info size={18} className="text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />;
}

export default function UpdateChecker() {
  const desktop = isDesktop();
  const [currentVersion, setCurrentVersion] = useState<string>(__APP_VERSION__);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<UpdateCheckMessage | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  useEffect(() => {
    if (!desktop) return;
    window.mobpos?.getAppVersion?.()
      .then((v) => { if (v) setCurrentVersion(v); })
      .catch(() => undefined);
  }, [desktop]);

  if (!desktop) return null;

  const handleCheck = async () => {
    setChecking(true);
    setStatus(null);
    try {
      const result: UpdateCheckResponse | undefined = await window.mobpos?.checkUpdates?.();
      if (!result) {
        setStatus(buildUpdateCheckMessage({ ok: false }, currentVersion));
      } else {
        setStatus(buildUpdateCheckMessage(result, currentVersion));
      }
      setLastCheck(new Date());
    } catch {
      setStatus(buildUpdateCheckMessage({ ok: false }, currentVersion));
      setLastCheck(new Date());
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <RefreshCw size={20} className="text-blue-600 dark:text-blue-400" />
          تحديثات التطبيق
        </h3>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300" dir="ltr">
          v{currentVersion}
        </span>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
        الفحص التلقائي شغّال بعد 5 ثواني من التشغيل وكل 6 ساعات. الزرار ده بيعمل فحص فوري إضافي.
      </p>

      <button
        onClick={handleCheck}
        disabled={checking}
        className="w-full px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
      >
        {checking ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <RefreshCw size={18} />
        )}
        {checking ? 'جارٍ الفحص...' : 'افحص التحديثات'}
      </button>

      {status && (
        <div className={`mt-4 p-4 rounded-xl border flex items-start gap-3 ${MESSAGE_STYLES[status.kind]}`}>
          <StatusIcon kind={status.kind} />
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed">{status.message}</p>
            {status.kind === 'up-to-date' && lastCheck && (
              <p className="text-xs opacity-80 mt-1">آخر فحص: {formatLastChecked(lastCheck)}</p>
            )}
            {status.kind === 'dev' && (
              <p className="text-xs opacity-80 mt-1">بعد التثبيت على جهاز، ممكن تستخدم زرار الفحص ده مباشرة.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
