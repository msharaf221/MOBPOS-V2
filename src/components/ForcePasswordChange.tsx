import { useState } from 'react';
import { Lock, ShieldAlert, KeyRound, CheckCircle, AlertTriangle, Eye, EyeOff, LogOut } from 'lucide-react';
import { User } from '../types';

interface ForcePasswordChangeProps {
  currentUser: User;
  onChangePassword: (userId: string, oldPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  onLogout: () => void;
  shopName?: string;
}

export default function ForcePasswordChange({
  currentUser,
  onChangePassword,
  onLogout,
  shopName = 'MOBPOS'
}: ForcePasswordChangeProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('يرجى إدخال كلمة المرور الحالية');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف');
      return;
    }

    if (newPassword === 'admin123') {
      setError('لا يمكن استخدام كلمة المرور الافتراضية القديمة (admin123)');
      return;
    }

    if (newPassword === currentPassword) {
      setError('كلمة المرور الجديدة يجب أن تكون مختلفة عن كلمة المرور الحالية');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور الجديدتان غير متطابقتين');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onChangePassword(currentUser.id, currentPassword, newPassword);
      if (!result.ok) {
        setError(result.error || 'فشل تحديث كلمة المرور');
      }
    } catch {
      setError('حدث خطأ غير متوقع أثناء تحديث كلمة المرور');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white/10 dark:bg-gray-800/90 backdrop-blur-xl border border-white/20 dark:border-gray-700 rounded-3xl p-8 shadow-2xl text-white">
        {/* Header Icon */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/20 border border-amber-400/30 rounded-2xl mb-3 text-amber-400 shadow-inner">
            <ShieldAlert size={36} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">تغيير كلمة المرور إلزامي</h1>
          <p className="text-sm text-blue-200 dark:text-gray-300">
            {shopName} — مرحباً <span className="font-bold text-white">{currentUser.name}</span>
          </p>
          <div className="mt-3 p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-xs text-amber-200 leading-relaxed text-right flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
            <span>
              لدواعي الأمان وحماية بيانات المحل، يُشترط تغيير كلمة المرور الافتراضية قبل الدخول إلى النظام.
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3.5 bg-red-500/20 border border-red-500/40 rounded-xl text-sm text-red-200 flex items-center gap-2 animate-fadeIn">
            <AlertTriangle size={18} className="shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              كلمة المرور الحالية (الافتراضية: admin123)
            </label>
            <div className="relative">
              <KeyRound className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الحالية"
                dir="ltr"
                className="w-full py-3 pr-11 pl-11 bg-white/10 dark:bg-gray-900/60 border border-white/20 dark:border-gray-600 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
              >
                {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              كلمة المرور الجديدة (6 أحرف على الأقل)
            </label>
            <div className="relative">
              <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="كلمة مرور جديدة وقوية"
                dir="ltr"
                className="w-full py-3 pr-11 pl-11 bg-white/10 dark:bg-gray-900/60 border border-white/20 dark:border-gray-600 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
              >
                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              تأكيد كلمة المرور الجديدة
            </label>
            <div className="relative">
              <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="أعد إدخال كلمة المرور الجديدة"
                dir="ltr"
                className="w-full py-3 pr-11 pl-11 bg-white/10 dark:bg-gray-900/60 border border-white/20 dark:border-gray-600 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
            className="w-full mt-2 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle size={18} />
                <span>حفظ كلمة المرور والدخول للنظام</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Logout */}
        <div className="mt-6 pt-4 border-t border-white/10 text-center">
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-300 transition"
          >
            <LogOut size={14} />
            <span>تسجيل الخروج والعودة لشاشة الدخول</span>
          </button>
        </div>
      </div>
    </div>
  );
}
