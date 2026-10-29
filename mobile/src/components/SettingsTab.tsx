import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  Eye,
  EyeOff,
  RotateCcw,
  Shield,
  Smartphone,
  Info,
  Lock,
  QrCode,
  Sparkles,
  Key,
  X,
  ClipboardPaste,
  DownloadCloud,
  RotateCw,
} from 'lucide-react';
import type { BranchConfig } from '../types';
import { formatTimeAgo } from '../utils/format';
import { multiBranchManager } from '../services/MultiBranchManager';
import { CameraScannerModal } from './CameraScannerModal';
import { UpdateModal } from './UpdateModal';
import { checkMobileUpdate, CURRENT_MOBILE_VERSION, type MobileUpdateResult } from '../utils/updateCheck';
import { playBeep, playSuccess, triggerHaptic } from '../utils/sound';

interface SettingsTabProps {
  branches: BranchConfig[];
  onOpenAddBranch: () => void;
  onEditBranch: (branch: BranchConfig) => void;
  onToggleBranchEnabled: (id: string, enabled: boolean) => void;
  hideAmounts: boolean;
  onToggleHideAmounts: () => void;
  autoRefreshInterval: number;
  onChangeAutoRefresh: (seconds: number) => void;
  /** 🔒 قفل التطبيق برمز مطابقة */
  appLockEnabled: boolean;
  onChangeAppLock: (enabled: boolean) => void;
  onPairSuccess?: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  branches,
  onOpenAddBranch,
  onEditBranch,
  onToggleBranchEnabled,
  hideAmounts,
  onToggleHideAmounts,
  autoRefreshInterval,
  onChangeAutoRefresh,
  appLockEnabled,
  onChangeAppLock,
  onPairSuccess,
}) => {
  const [isScanningPair, setIsScanningPair] = useState(false);
  const [showManualPairModal, setShowManualPairModal] = useState(false);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [pairSuccessMsg, setPairSuccessMsg] = useState<string | null>(null);
  const [pairErrorMsg, setPairErrorMsg] = useState<string | null>(null);

  // حالة فحص التحديثات
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<MobileUpdateResult | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateCheckMsg, setUpdateCheckMsg] = useState<{
    kind: 'available' | 'uptodate' | 'error';
    text: string;
    subtext?: string;
  } | null>(null);

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateCheckMsg(null);
    try {
      const res = await checkMobileUpdate();
      if (!res.ok) {
        setUpdateCheckMsg({
          kind: 'error',
          text: res.error || 'تعذر التحقق من التحديثات',
        });
        playBeep();
        triggerHaptic('warning');
        return;
      }

      if (res.updateAvailable) {
        setAvailableUpdate(res);
        setIsUpdateModalOpen(true);
        setUpdateCheckMsg({
          kind: 'available',
          text: `متوفر إصدار جديد: v${res.latestVersion}`,
          subtext: res.releaseTitle,
        });
        playSuccess();
        triggerHaptic('success');
      } else {
        setUpdateCheckMsg({
          kind: 'uptodate',
          text: `أنت على أحدث إصدار بالفعل (v${res.currentVersion})`,
          subtext: 'لا توجد تحديثات معلقة حالياً.',
        });
        playSuccess();
        triggerHaptic('light');
      }
    } catch {
      setUpdateCheckMsg({
        kind: 'error',
        text: 'حدث خطأ أثناء الاتصال بخادم التحديثات',
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handlePairCode = (code: string) => {
    setIsScanningPair(false);
    setShowManualPairModal(false);
    setPairErrorMsg(null);
    setPairSuccessMsg(null);

    const res = multiBranchManager.importFromPairingCode(code);
    if (res.ok && res.branch) {
      playSuccess();
      triggerHaptic('success');
      setPairSuccessMsg(`تم ربط المتجر بنجاح: ${res.branch.name}`);
      onPairSuccess?.();
      setTimeout(() => setPairSuccessMsg(null), 6000);
    } else {
      playBeep();
      triggerHaptic('warning');
      setPairErrorMsg(res.error || 'رمز الاقتران غير صالح. تأكد من مسح كود QR من برنامج MOBPOS على الكمبيوتر');
      setTimeout(() => setPairErrorMsg(null), 6000);
    }
  };

  return (
    <div className="space-y-4 pb-24 text-xs">
      {/* 🚀 Quick QR Pairing Card */}
      <div className="relative overflow-hidden rounded-3xl p-4 bg-gradient-to-br from-cyan-950/40 via-slate-900 to-indigo-950/40 border border-cyan-500/30 shadow-xl shadow-cyan-950/30">
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
              <Sparkles size={14} className="animate-pulse" />
              <span>اقتران فوري مع جهاز الكمبيوتر (QR)</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              من شاشة الإعدادات ⚙️ على الكمبيوتر، اضغط على <strong>"ربط تطبيق الهاتف QR"</strong> وامسح الكود بالكاميرا ليتم ربط المتجر والمزامنة فوراً دون كتابة روابط أو مفاتيح!
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap gap-2 relative z-10">
          <button
            type="button"
            onClick={() => setIsScanningPair(true)}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/25 active:scale-98"
          >
            <QrCode size={16} />
            <span>مسح كود الاقتران QR</span>
          </button>

          <button
            type="button"
            onClick={() => setShowManualPairModal(true)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 transition"
            title="لصق كود الاقتران يدوياً إذا تعذرت الكاميرا"
          >
            <Key size={14} />
            <span>لصق الكود</span>
          </button>
        </div>

        {pairSuccessMsg && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span className="font-bold">{pairSuccessMsg}</span>
          </div>
        )}

        {pairErrorMsg && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-fadeIn">
            <AlertCircle size={16} className="text-rose-400 shrink-0" />
            <span>{pairErrorMsg}</span>
          </div>
        )}
      </div>

      {/* Branches Header & Add Button */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Building2 size={16} className="text-cyan-400" />
            <span>إدارة الفروع والمحلات المرتبطة</span>
          </h2>
          <p className="text-[10px] text-slate-400 mt-0.5">
            يمكنك ربط كل فرع بمشروع Supabase وترخيص مستقل
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenAddBranch}
          className="flex items-center gap-1 py-1.5 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20 shrink-0"
        >
          <Plus size={14} />
          <span>إضافة فرع</span>
        </button>
      </div>

      {/* Branches Cards */}
      <div className="space-y-2.5">
        {branches.map(branch => {
          const isConnected = branch.status === 'connected';
          const isError = branch.status === 'error';
          return (
            <div
              key={branch.id}
              className={`p-3.5 rounded-2xl glass-card space-y-2.5 transition border ${
                branch.enabled ? 'border-slate-750' : 'border-slate-850 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0 shadow"
                    style={{ backgroundColor: branch.color }}
                  >
                    <Building2 size={18} />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-white truncate">
                        {branch.name}
                      </h4>
                      {branch.code && (
                        <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-1.5 py-0.2 rounded">
                          {branch.code}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {branch.city || 'مصر'} • {branch.supabaseUrl ? 'سحابة Supabase متصلة' : 'بدون ربط سحابي'}
                    </div>
                    {branch.userEmail && (
                      <div className="text-[10px] text-cyan-400 font-mono mt-0.5 truncate">
                        👤 {branch.userEmail}
                      </div>
                    )}
                  </div>
                </div>

                {/* Edit Button */}
                <button
                  type="button"
                  onClick={() => onEditBranch(branch)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition shrink-0"
                  title="تعديل بيانات الربط"
                >
                  <Edit2 size={14} />
                </button>
              </div>

              {/* Status & Toggle */}
              <div className="pt-2 border-t border-slate-850 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  {isConnected ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <CheckCircle2 size={13} />
                      متصل ومحدث
                    </span>
                  ) : isError ? (
                    <span className="flex items-center gap-1 text-rose-400 font-bold">
                      <AlertCircle size={13} />
                      {branch.errorMessage || 'خطأ بالاتصال'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400">
                      <WifiOff size={13} />
                      أوفلاين (محلي)
                    </span>
                  )}
                  {branch.lastSyncAt && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({formatTimeAgo(branch.lastSyncAt)})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">
                    {branch.enabled ? 'نشط بالرادار' : 'معطل'}
                  </span>
                  <input
                    type="checkbox"
                    checked={branch.enabled}
                    onChange={e => onToggleBranchEnabled(branch.id, e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-700 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* App Preferences */}
      <div className="pt-2 space-y-2">
        <div className="text-xs font-bold text-slate-300 px-1">
          تفضيلات التطبيق والأمان:
        </div>

        <div className="p-4 rounded-3xl glass-panel space-y-3">
          {/* Privacy Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                {hideAmounts ? <EyeOff size={14} className="text-amber-400" /> : <Eye size={14} className="text-slate-400" />}
                <span>وضع الخصوصية للأرباح</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                إخفاء مبالغ المبيعات والأرباح ورصيد الخزينة بنجوم
              </p>
            </div>
            <input
              type="checkbox"
              checked={hideAmounts}
              onChange={onToggleHideAmounts}
              className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-700 cursor-pointer"
            />
          </div>

          <div className="border-t border-slate-800" />

          {/* Auto-refresh interval */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                <RotateCcw size={14} className="text-cyan-400" />
                <span>تردد التحديث التلقائي للبيانات</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                إعادة جلب المبيعات والخزائن تلقائياً من السحابة
              </p>
            </div>

            <select
              value={autoRefreshInterval}
              onChange={e => onChangeAutoRefresh(Number(e.target.value))}
              className="p-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none"
            >
              <option value={15}>كل 15 ثانية ⚡</option>
              <option value={30}>كل 30 ثانية</option>
              <option value={60}>كل دقيقة</option>
              <option value={0}>يدوي فقط</option>
            </select>
          </div>
        </div>
      </div>

        {/* 🔒 App Lock management */}
        <AppLockSection
          enabled={appLockEnabled}
          onChange={onChangeAppLock}
        />

        {/* 🔄 قسم فحص وتحديثات التطبيق */}
        <div className="p-4 rounded-3xl glass-card space-y-3 border border-cyan-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
                <DownloadCloud size={16} />
              </div>
              <div>
                <h4 className="font-bold text-white text-xs">تحديثات التطبيق</h4>
                <p className="text-[10px] text-slate-400 font-mono">
                  الإصدار المثبت: v{CURRENT_MOBILE_VERSION}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isCheckingUpdate}
              onClick={handleCheckUpdates}
              className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-cyan-500/20 active:scale-95"
            >
              {isCheckingUpdate ? (
                <>
                  <RotateCw size={13} className="animate-spin" />
                  <span>جاري الفحص...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>فحص التحديثات 🔄</span>
                </>
              )}
            </button>
          </div>

          {updateCheckMsg && (
            <div className={`p-2.5 rounded-xl text-[11px] flex items-center gap-2 ${
              updateCheckMsg.kind === 'available'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : updateCheckMsg.kind === 'uptodate'
                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
            }`}>
              {updateCheckMsg.kind === 'available' ? (
                <Sparkles size={14} className="shrink-0 text-emerald-400" />
              ) : updateCheckMsg.kind === 'uptodate' ? (
                <CheckCircle2 size={14} className="shrink-0 text-cyan-400" />
              ) : (
                <AlertCircle size={14} className="shrink-0 text-rose-400" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold">{updateCheckMsg.text}</p>
                {updateCheckMsg.subtext && (
                  <p className="text-[10px] opacity-80 mt-0.5">{updateCheckMsg.subtext}</p>
                )}
              </div>
              {updateCheckMsg.kind === 'available' && (
                <button
                  type="button"
                  onClick={() => setIsUpdateModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-[10px] shrink-0"
                >
                  عرض وتنزيل
                </button>
              )}
            </div>
          )}
        </div>

        {/* System info */}
      <div className="p-4 rounded-3xl glass-card flex items-start gap-3 text-slate-400">
        <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-slate-200">
            MOBPOS Companion — رادار الفروع {__APP_VERSION__}
          </p>
          <p className="text-[10px] leading-relaxed">
            تطبيق مخصص لمالك النظام لمتابعة وإدارة الفروع المتعددة لحظياً من أي هاتف (أندرويد وآيفون) في نفس الوقت.
          </p>
        </div>
      </div>

      {/* Update Modal */}
      <UpdateModal
        update={availableUpdate}
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
      />

      {/* QR Scanner Modal for Instant Pairing */}
      <CameraScannerModal
        isOpen={isScanningPair}
        onClose={() => setIsScanningPair(false)}
        title="امسح كود الاقتران من شاشة الكمبيوتر"
        onScan={scannedCode => {
          handlePairCode(scannedCode);
        }}
      />

      {/* Manual Code Input Modal */}
      {showManualPairModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-750 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                  <Key size={16} />
                </div>
                <h3 className="font-bold text-white text-sm">لصق كود الاقتران يدوياً</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualPairModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              إذا لم تكن الكاميرا متاحة، يمكنك نسخ كود الاقتران من شاشة إعدادات الكمبيوتر ولصقه هنا مباشرة:
            </p>

            <div className="space-y-2">
              <textarea
                value={manualCodeInput}
                onChange={e => setManualCodeInput(e.target.value)}
                placeholder="MOBPOS_PAIR:eyJ..."
                rows={4}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-500 break-all resize-none"
              />

              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setManualCodeInput(text);
                  } catch {
                    // Clipboard read blocked, user can paste manually
                  }
                }}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
              >
                <ClipboardPaste size={12} />
                <span>لصق من الحافظة</span>
              </button>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={!manualCodeInput.trim()}
                onClick={() => handlePairCode(manualCodeInput.trim())}
                className="flex-1 py-2 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20"
              >
                تأكيد الاقتران والربط
              </button>
              <button
                type="button"
                onClick={() => setShowManualPairModal(false)}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * قسم إدارة قفل التطبيق: تفعيل/إلغاء برمز مطابقة (4–6 أرقام).
 * الرمز يُشفر SHA-256 عبر crypto.subtle ولا يُخزَّن نصاً.
 */
const AppLockSection: React.FC<{
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}> = ({ enabled, onChange }) => {
  const [mode, setMode] = useState<'idle' | 'set' | 'disable'>('idle');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMode('idle');
    setPin('');
    setPinConfirm('');
    setBusy(false);
  };

  const handleSetPin = async () => {
    if (!/^\d{4,6}$/.test(pin)) {
      setMsg({ kind: 'err', text: 'الرمز 4–6 أرقام فقط' });
      return;
    }
    if (pin !== pinConfirm) {
      setMsg({ kind: 'err', text: 'الرمزان غير متطابقين' });
      return;
    }
    setBusy(true);
    try {
      const { setAppLockPin } = await import('../utils/appLock');
      await setAppLockPin(pin);
      setMsg({ kind: 'ok', text: 'تم تفعيل القفل — سيعمل من المرة القادمة فت فتح التطبيق' });
      onChange(true);
      setMode('idle');
      setPin('');
      setPinConfirm('');
    } catch {
      setMsg({ kind: 'err', text: 'تعذر تفعيل القفل (متصفح لا يدعم crypto.subtle)' });
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (!/^\d{4,6}$/.test(pin)) {
      setMsg({ kind: 'err', text: 'أدخل الرمز الحالي للإلغاء' });
      return;
    }
    setBusy(true);
    try {
      const { verifyAppLockPin, disableAppLock } = await import('../utils/appLock');
      const ok = await verifyAppLockPin(pin);
      if (!ok) {
        setMsg({ kind: 'err', text: 'الرمز الحالي غير صحيح' });
        setBusy(false);
        return;
      }
      disableAppLock();
      setMsg({ kind: 'ok', text: 'تم إلغاء القفل' });
      onChange(false);
      reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-3xl glass-card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-bold text-white flex items-center gap-1.5">
            <Lock size={14} className="text-emerald-400" />
            <span>قفل التطبيق برمز مطابقة</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            طلب رمز عند فتح التطبيق (يُخزن هاشاً فقط)
          </p>
        </div>

        {mode === 'idle' && (
          enabled ? (
            <button
              type="button"
              onClick={() => { setMode('disable'); setMsg(null); }}
              className="px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[11px] font-bold"
            >
              إلغاء القفل
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setMode('set'); setMsg(null); }}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold"
            >
              تفعيل
            </button>
          )
        )}
      </div>

      {mode !== 'idle' && (
        <div className="space-y-2 pt-1">
          <input
            type="tel"
            inputMode="numeric"
            dir="ltr"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={mode === 'set' ? 'رمز جديد (4–6 أرقام)' : 'الرمز الحالي'}
            className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm tracking-widest text-center focus:outline-none"
          />
          {mode === 'set' && (
            <input
              type="tel"
              inputMode="numeric"
              dir="ltr"
              value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="تأكيد الرمز"
              className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-sm tracking-widest text-center focus:outline-none"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => (mode === 'set' ? handleSetPin() : handleDisable())}
              className="flex-1 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] disabled:opacity-50"
            >
              {mode === 'set' ? 'حفظ الرمز' : 'إلغاء القفل'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-bold"
            >
              رجوع
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-[10px] font-medium flex items-center gap-1.5 ${
          msg.kind === 'ok' ? 'text-emerald-300' : 'text-rose-300'
        }`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />} {msg.text}
        </p>
      )}
    </div>
  );
};
