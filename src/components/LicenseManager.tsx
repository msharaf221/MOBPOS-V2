import { useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle, Clock, Crown, Infinity as InfinityIcon,
  KeyRound, RefreshCw, ShieldCheck, X,
} from 'lucide-react';
import { ActiveLicense, PLAN_FEATURES, PlanType } from '../license/types';
import { activateLicense } from '../license/engine';
import { getDeviceId } from '../license/device';
import {
  getLicenseStatus,
  formatLicenseStatus,
  formatLicenseExpiry,
  getLicenseDaysRemaining,
} from '../license/status';

interface LicenseManagerProps {
  license: ActiveLicense | null;
  onLicenseUpdated: (license: ActiveLicense) => void;
  onDeactivate: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  expiring: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  expired: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
};

const PLAN_ICONS: Record<PlanType, typeof Crown> = {
  basic: Crown,
  pro: Crown,
  enterprise: Crown,
  lifetime: InfinityIcon,
};

export default function LicenseManager({ license, onLicenseUpdated, onDeactivate }: LicenseManagerProps) {
  const [deviceId, setDeviceId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDeviceId()
      .then(id => { if (!cancelled) setDeviceId(id); })
      .catch(() => { if (!cancelled) setDeviceId(''); });
    return () => { cancelled = true; };
  }, []);

  const status = license ? getLicenseStatus(license.expiresAt, license.lifetime) : null;
  const days = license ? getLicenseDaysRemaining(license.expiresAt, license.lifetime) : 0;
  const planName = license ? PLAN_FEATURES[license.plan].nameAr : '';
  const PlanIcon = license ? PLAN_ICONS[license.plan] : KeyRound;

  const handleActivate = async () => {
    const trimmed = newKey.trim();
    if (!trimmed) {
      setError('أدخل مفتاح التفعيل الجديد');
      return;
    }
    if (license && trimmed === license.key) {
      setError('ده المفتاح النشط الحالي');
      return;
    }

    setLoading(true);
    setError('');
    const result = await activateLicense(trimmed);
    setLoading(false);

    if (result.ok && result.license) {
      onLicenseUpdated(result.license);
      setNewKey('');
      setShowModal(false);
      return;
    }

    if (result.code === 'used_on_other_device') {
      setError('المفتاح ده مربوط بجهاز تاني — كلم مزود النظام');
      return;
    }
    setError(result.error || 'مفتاح غير صالح');
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <ShieldCheck size={20} className="text-blue-600 dark:text-blue-400" />
          إدارة الترخيص
        </h3>
        {license && (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${STATUS_STYLES[status || 'active']}`}>
            {status === 'expired' && <AlertTriangle size={14} />}
            {status === 'expiring' && <Clock size={14} />}
            {status === 'active' && <CheckCircle size={14} />}
            {status ? formatLicenseStatus(status) : 'شغّالة'}
          </span>
        )}
      </div>

      {license ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">الباقة</p>
            <p className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <PlanIcon size={16} className="text-blue-600 dark:text-blue-400" />
              {planName}
            </p>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">اسم المحل</p>
            <p className="font-bold text-gray-800 dark:text-white">{license.shopName}</p>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{license.lifetime ? 'الاشتراك' : 'تاريخ الانتهاء'}</p>
            <p className="font-bold text-gray-800 dark:text-white">
              {license.lifetime ? 'مدى الحياة' : formatLicenseExpiry(license.expiresAt, license.lifetime)}
              {!license.lifetime && status !== 'expired' && days > 0 && (
                <span className={`text-xs ${status === 'expiring' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {' '}({days} يوم)
                </span>
              )}
            </p>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">معرّف المفتاح</p>
            <p className="font-mono text-sm text-gray-800 dark:text-white break-all" dir="ltr">{license.keyId}</p>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl md:col-span-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">معرّف الجهاز (للدعم الفني)</p>
            <p className="font-mono text-sm text-gray-800 dark:text-white break-all" dir="ltr">{deviceId || '...'}</p>
          </div>
        </div>
      ) : (
        <div className="p-4 mb-5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-300 text-sm">
          لا يوجد ترخيص نشط على هذا الجهاز.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => { setShowModal(true); setNewKey(''); setError(''); }}
          className="flex-1 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
        >
          <RefreshCw size={18} />
          إدخال مفتاح جديد (تغيير/ترقية)
        </button>
        <button
          onClick={() => {
            if (confirm('هل أنت متأكد من إلغاء تفعيل الترخيص؟ سيتم نقلك لشاشة التفعيل.')) {
              onDeactivate();
            }
          }}
          className="px-5 py-3 border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 rounded-xl font-bold hover:bg-red-50 dark:hover:bg-red-500/10 transition flex items-center justify-center gap-2"
        >
          <X size={18} />
          إلغاء التفعيل
        </button>
      </div>

      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 leading-relaxed flex items-start gap-2">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-amber-500" />
        إدخال مفتاح جديد هنا مبيألوش المفتاح القديم على سيرفر التفعيل — المالك هو اللي يلغيه.
      </p>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h4 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <KeyRound size={20} className="text-blue-600 dark:text-blue-400" />
                إدخال مفتاح جديد
              </h4>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-xl text-red-600 dark:text-red-300 text-sm flex items-center gap-2">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}

              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                الصق المفتاح الجديد (نفس الباقة أو باقة مختلفة) — بياناتك الحالية تبقى محفوظة.
              </p>
              <textarea
                value={newKey}
                onChange={(e) => { setNewKey(e.target.value); setError(''); }}
                placeholder="الصق المفتاح هنا..."
                rows={3}
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl p-3 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono resize-none"
                dir="ltr"
              />

              <button
                onClick={handleActivate}
                disabled={loading}
                className="mt-4 w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <KeyRound size={18} />
                )}
                {loading ? 'جارٍ التفعيل...' : 'تفعيل المفتاح الجديد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
