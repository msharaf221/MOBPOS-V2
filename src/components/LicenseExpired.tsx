import { useState } from 'react';
import {
  AlertTriangle, Key, Download, RefreshCw, ShieldCheck,
  Clock, Database, X, CheckCircle
} from 'lucide-react';
import { ActiveLicense, PLAN_FEATURES } from '../license/types';
import { activateLicense } from '../license/engine';
import { indexedDBUtils } from '../hooks/useIndexedDB';

interface LicenseExpiredProps {
  expiredLicense: ActiveLicense;
  onRenewed: (license: ActiveLicense) => void;
  onDeactivate: () => void;
}

export default function LicenseExpired({ expiredLicense, onRenewed, onDeactivate }: LicenseExpiredProps) {
  const [newKey, setNewKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const handleRenew = async () => {
    if (!newKey.trim()) {
      setError('أدخل مفتاح التفعيل الجديد');
      return;
    }

    setLoading(true);
    setError('');

    const result = await activateLicense(newKey.trim());
    if (result.ok && result.license) {
      onRenewed(result.license);
    } else {
      setError(result.error || 'مفتاح غير صالح');
    }
    setLoading(false);
  };

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      // Export all IndexedDB data
      const data = await indexedDBUtils.exportAllData();
      
      const backup = {
        app: 'MOBPOS',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        shopName: expiredLicense.shopName,
        plan: expiredLicense.plan,
        data
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mobpos-backup-${expiredLicense.shopName}-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupDone(true);
    } catch (err) {
      alert('حدث خطأ أثناء التصدير');
    }
    setBackingUp(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-orange-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500/20 border border-orange-500/30 rounded-2xl mb-4">
            <AlertTriangle className="text-orange-400" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">{expiredLicense.shopName}</h1>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-orange-500/20 rounded-3xl p-8 shadow-2xl">
          {/* Warning */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 text-orange-300 px-4 py-2 rounded-full text-sm font-bold mb-4">
              <Clock size={16} />
              الاشتراك منتهي
            </div>
            <h2 className="text-xl font-bold text-white mb-2">انتهت صلاحية اشتراكك</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              انتهى اشتراك باقة <span className="text-orange-300 font-bold">{PLAN_FEATURES[expiredLicense.plan].nameAr}</span> بتاريخ{' '}
              <span className="text-orange-300">{new Date(expiredLicense.expiresAt).toLocaleDateString('ar-EG')}</span>
            </p>
          </div>

          {/* Data Safety Box */}
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <Database className="text-green-400 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-green-300 font-bold text-sm">✅ بياناتك آمنة ومحفوظة</p>
                <p className="text-green-200/60 text-xs mt-1 leading-relaxed">
                  كل بياناتك (مبيعات، مخزون، عملاء، صيانة) محفوظة بالكامل على جهازك. لا تقلق، لن تُفقد. جدّد اشتراكك للوصول إليها مجدداً.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {/* Renew - Primary */}
            <button
              onClick={() => setShowRenewModal(true)}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25"
            >
              <RefreshCw size={20} />
              تجديد الاشتراك
            </button>

            {/* Backup - Secondary */}
            <button
              onClick={handleBackup}
              disabled={backingUp || backupDone}
              className={`w-full py-3 border font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                backupDone
                  ? 'border-green-500/30 bg-green-500/10 text-green-300'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {backingUp ? (
                <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : backupDone ? (
                <>
                  <CheckCircle size={18} />
                  تم تصدير النسخة الاحتياطية
                </>
              ) : (
                <>
                  <Download size={18} />
                  تصدير نسخة احتياطية من البيانات
                </>
              )}
            </button>

            {/* Deactivate */}
            <button
              onClick={onDeactivate}
              className="w-full py-2 text-slate-500 hover:text-slate-300 text-sm transition flex items-center justify-center gap-1"
            >
              <X size={14} />
              إلغاء التفعيل والبدء من جديد
            </button>
          </div>
        </div>

        {/* Help note */}
        <p className="text-center text-xs text-slate-600 mt-6">
          للاشتراك أو التجديد، تواصل مع مزود النظام للحصول على مفتاح جديد
        </p>
      </div>

      {/* Renew Modal */}
      {showRenewModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <RefreshCw size={20} className="text-blue-400" />
                تجديد الاشتراك
              </h3>
              <button onClick={() => setShowRenewModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-center gap-2">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}

              <p className="text-slate-300 text-sm mb-2">
                أدخل مفتاح التفعيل الجديد (نفس الباقة أو باقة مختلفة)
              </p>
              <textarea
                value={newKey}
                onChange={(e) => { setNewKey(e.target.value); setError(''); }}
                placeholder="الصق المفتاح هنا..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 text-sm font-mono resize-none"
                dir="ltr"
              />

              <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                <p className="text-blue-300/80 text-xs leading-relaxed flex items-start gap-2">
                  <ShieldCheck size={14} className="flex-shrink-0 mt-0.5" />
                  سواء جدّدت بنفس الباقة أو رقّيت لباقة أعلى أو نزلت لباقة أقل — بياناتك الحالية ستبقى محفوظة كما هي.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-white/10 flex gap-3">
              <button
                onClick={() => setShowRenewModal(false)}
                className="flex-1 py-2.5 border border-white/10 rounded-xl text-slate-300 hover:bg-white/5"
              >
                إلغاء
              </button>
              <button
                onClick={handleRenew}
                disabled={loading}
                className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Key size={16} />
                    تفعيل المفتاح الجديد
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
