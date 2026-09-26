import { useState, useEffect } from 'react';
import {
  Wifi,
  Smartphone,
  Copy,
  Check,
  ExternalLink,
  Users,
  ShieldCheck,
  RefreshCw,
  Info,
  Server,
  KeyRound,
} from 'lucide-react';
import { fetchLanServerInfo } from '../utils/lanSync';
import { LanServerInfo, AppSettings } from '../types';
import QRCodeDisplay from './QRCodeDisplay';

interface LANSettingsTabProps {
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
}

export default function LANSettingsTab({ settings, onSaveSettings }: LANSettingsTabProps) {
  const [lanInfo, setLanInfo] = useState<LanServerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [pinInput, setPinInput] = useState(settings.lanPin || '');
  const [pinSaved, setPinSaved] = useState(false);

  const loadInfo = async () => {
    setLoading(true);
    const info = await fetchLanServerInfo();
    setLanInfo(info);
    setLoading(false);
  };

  useEffect(() => {
    loadInfo();
    // تحديث كل 10 ثوانٍ لمتابعة الأجهزة المتصلة
    const timer = setInterval(loadInfo, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleCopy = (url: string, index: number) => {
    navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSavePin = () => {
    onSaveSettings({
      ...settings,
      lanPin: pinInput.trim(),
    });
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2000);
  };

  const primaryIp = lanInfo?.ipAddresses?.[0] || '127.0.0.1';
  const primaryUrl = `http://${primaryIp}:${lanInfo?.port || 8420}`;

  return (
    <div className="space-y-6">
      {/* رأس القسم */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Wifi className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            مشاركة النظام عبر الشبكة المحلية (Wi-Fi / LAN)
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            شغّل السيستم على موبايلات وفنيين الصيانة وأجهزة الكاشير الأخرى على نفس شبكة الواي فاي مع مزامنة لحظية فورية.
          </p>
        </div>

        <button
          onClick={loadInfo}
          disabled={loading}
          className="self-start sm:self-center flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          تحديث الحالة
        </button>
      </div>

      {/* بطاقة الحالة والـ QR Code الرئيسي */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* بطاقة QR Code */}
        <div className="md:col-span-1 bg-gradient-to-br from-blue-50 to-indigo-50/50 dark:from-gray-800 dark:to-gray-800/80 p-6 rounded-2xl border border-blue-100 dark:border-gray-700 flex flex-col items-center text-center">
          <div className="mb-3">
            <QRCodeDisplay value={primaryUrl} size={150} />
          </div>

          <h3 className="font-bold text-gray-900 dark:text-white text-sm">مسح الرمز بكاميرا الموبايل</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
            افتح كاميرا الهاتف أو التابلت وامسح الرمز للدخول مباشرة إلى السيستم.
          </p>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-medium rounded-full mt-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            الخادم نشط وجاهز للربط
          </span>
        </div>

        {/* بطاقة الروابط وعناوين IP */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Server className="w-4 h-4 text-blue-500" />
                روابط الدخول للأجهزة على الشبكة
              </span>
              <span className="text-xs text-gray-400">المنفذ: {lanInfo?.port || 8420}</span>
            </div>

            {lanInfo?.ipAddresses && lanInfo.ipAddresses.length > 0 ? (
              <div className="space-y-2">
                {lanInfo.ipAddresses.map((ip, idx) => {
                  const url = `http://${ip}:${lanInfo.port}`;
                  return (
                    <div
                      key={ip}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Smartphone className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {url}
                        </span>
                        {idx === 0 && (
                          <span className="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                            الأساسي
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopy(url, idx)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition"
                          title="نسخ الرابط"
                        >
                          {copiedIndex === idx ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-600 text-xs">تم النسخ</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>نسخ</span>
                            </>
                          )}
                        </button>

                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition"
                          title="فتح في نافذة جديدة"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0" />
                لم يتم العثور على عنوان IP محلي. تأكد من أن جهاز الكمبيوتر متصل بالراوتر أو شبكة الواي فاي.
              </div>
            )}
          </div>

          {/* عداد الأجهزة المتصلة */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/50 rounded-xl text-blue-600 dark:text-blue-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">الأجهزة المتصلة حالياً</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {lanInfo?.activeClients ? `${lanInfo.activeClients} جهاز متصل ويستمع للتحديثات اللحظية` : 'لا توجد أجهزة فرعية متصلة حالياً'}
                </p>
              </div>
            </div>

            <span className="text-xl font-bold text-gray-900 dark:text-white">
              {lanInfo?.activeClients || 0}
            </span>
          </div>
        </div>
      </div>

      {/* قسم الأمان ورمز الدخول PIN */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-500" />
          حماية أجهزة الشبكة برمز سري (PIN)
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          يمكنك تعيين رمز سري قصير (PIN) لحماية النظام حتى لا يستطيع أي شخص على نفس الواي فاي فتح الكاشير دون إذنه.
        </p>

        <div className="flex items-center gap-3 max-w-md pt-1">
          <input
            type="text"
            maxLength={8}
            placeholder="مثال: 1234 أو اتركه فارغاً للدخول المباشر"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSavePin}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
          >
            {pinSaved ? <Check className="w-4 h-4" /> : null}
            {pinSaved ? 'تم الحفظ' : 'حفظ الرمز'}
          </button>
        </div>
      </div>

      {/* دليل البدء السريع خطوة بخطوة */}
      <div className="bg-gray-50 dark:bg-gray-900/60 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
        <h4 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          كيف يعمل النظام على الهواتف والأجهزة الأخرى؟
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs text-gray-600 dark:text-gray-300">
          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <span className="font-bold text-blue-600 dark:text-blue-400 block mb-1">1. نفس شبكة الواي فاي</span>
            تأكد أن هاتف الفني أو التابلت متصل بنفس شبكة الـ Wi-Fi الخاصة بالكمبيوتر الرئيسي.
          </div>
          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <span className="font-bold text-blue-600 dark:text-blue-400 block mb-1">2. مسح الرمز والفتح</span>
            امسح الـ QR بكاميرا الهاتف ليفتح النظام في المتصفح مباشرة، ويرث ترخيص المحل تلقائياً.
          </div>
          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <span className="font-bold text-blue-600 dark:text-blue-400 block mb-1">3. تسجيل الدخول والمزامنة</span>
            يسجل الفني أو الكاشير الدخول بحسابه وتتزامن كافة الحركات والمبيعات لحظياً مع الجهاز الرئيسي.
          </div>
        </div>
      </div>
    </div>
  );
}
