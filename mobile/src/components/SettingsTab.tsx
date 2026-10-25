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
} from 'lucide-react';
import type { BranchConfig } from '../types';
import { formatTimeAgo } from '../utils/format';

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
}) => {
  return (
    <div className="space-y-4 pb-24 text-xs">
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
