import React, { useState, useRef } from 'react';
import { Lock, Delete, AlertCircle } from 'lucide-react';
import { verifyAppLockPin } from '../utils/appLock';
import { triggerHaptic } from '../utils/sound';

interface AppLockScreenProps {
  onSuccess: () => void;
  shopName?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'c', '0', 'del'];

/** شاشة قفل التطبيق — تظهر عند بدء التشغيل إن كان قفل المطابقة مفعّلاً في الإعدادات */
export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onSuccess, shopName = 'MOBPOS' }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  // تأخير تصاعدي بعد المحاولات الفاشلة (1s، 2s، 4s، 8s… بحد 30s)
  const cooldownUntilRef = useRef(0);

  const press = (key: string) => {
    if (Date.now() < cooldownUntilRef.current) return;

    if (key === 'c') {
      setPin('');
      setError(null);
      return;
    }
    if (key === 'del') {
      setPin(p => p.slice(0, -1));
      return;
    }
    if (pin.length >= 6) return;

    const next = pin + key;
    setPin(next);
    setError(null);

    if (next.length === 4 || next.length === 6) {
      void attemptUnlock(next);
    }
  };

  const attemptUnlock = async (candidate: string) => {
    const ok = await verifyAppLockPin(candidate);
    if (ok) {
      triggerHaptic('medium');
      onSuccess();
      return;
    }
    const nextAttempt = attempts + 1;
    setAttempts(nextAttempt);
    setPin('');
    setError('الرمز غير صحيح');
    if (nextAttempt >= 3) {
      const delayMs = Math.min(30000, 1000 * Math.pow(2, Math.min(nextAttempt - 3, 5)));
      cooldownUntilRef.current = Date.now() + delayMs;
      setError(`محاولات كثيرة — انتظر ${Math.ceil(delayMs / 1000)} ثانية`);
      setTimeout(() => setError(null), Math.max(1500, delayMs));
    }
    triggerHaptic('warning');
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-slate-950 text-white">
      <div className="w-full max-w-xs flex flex-col items-center gap-5 text-center">
        <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 flex items-center justify-center">
          <Lock size={24} />
        </div>

        <div>
          <h1 className="text-lg font-black tracking-tight">{shopName}</h1>
          <p className="text-[11px] text-slate-400 mt-1">التطبيق مقفل — أدخل رمز المطابقة</p>
        </div>

        {/* نقاط الرمز */}
        <div className="flex items-center gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`w-3 h-3 rounded-full transition-all ${
                i < pin.length ? 'bg-cyan-400 scale-110' : 'bg-slate-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-[11px] text-rose-300 flex items-center gap-1.5 justify-center">
            <AlertCircle size={13} /> {error}
          </p>
        )}

        {/* لوحة الأرقام */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {KEYS.map(k => {
            const isAction = k === 'c' || k === 'del';
            return (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                disabled={Date.now() < cooldownUntilRef.current}
                className={`h-14 rounded-2xl border text-base font-bold active:scale-95 transition disabled:opacity-40 ${
                  isAction
                    ? 'bg-slate-800/60 border-slate-700 text-slate-300'
                    : 'bg-slate-800 border-slate-700 hover:bg-slate-750 text-white'
                }`}
              >
                {isAction ? (k === 'c' ? 'مسح' : <Delete size={16} className="mx-auto" />) : k}
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-slate-500 leading-relaxed">
          رمز القفل يُدار من الإعدادات ← الحماية. الرومة تُخزَّن هاشاً فقط على هذا الجهاز.
        </p>
      </div>
    </div>
  );
};
