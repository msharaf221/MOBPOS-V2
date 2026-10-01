import React, { useEffect, useState } from 'react';
import { Smartphone, Lock, User, AlertCircle, Eye, EyeOff, Info } from 'lucide-react';
import { AppSettings } from '../types';
import { useIndexedDBSetting } from '../hooks/useIndexedDB';
import { defaultAppSettings } from '../hooks/useStore';

// Must match the event name dispatched from Settings.tsx after saving branding changes.
const BRANDING_UPDATED_EVENT = 'mobpos:appSettingsUpdated';

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<boolean>;
  shopName: string;
}

export default function Login({ onLogin, shopName }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Branding (logo / accent color / theme) — read directly so the login
  // screen reflects the shop owner's customization without prop-drilling.
  const [appSettings] = useIndexedDBSetting<AppSettings>('shopSettings', defaultAppSettings);
  const [branding, setBranding] = useState<AppSettings>(defaultAppSettings);

  useEffect(() => {
    setBranding(appSettings);
  }, [appSettings]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AppSettings>).detail;
      if (detail) setBranding(detail);
    };
    window.addEventListener(BRANDING_UPDATED_EVENT, handler);
    return () => window.removeEventListener(BRANDING_UPDATED_EVENT, handler);
  }, []);

  const isMidnightGold = branding.themeStyle === 'midnightGold';
  const accentColor = branding.accentColor || '#3b82f6';

  const handleUseDefaultAdmin = () => {
    setUsername('admin');
    setPassword('admin123');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const cleanUsername = username.trim();
    const cleanPassword = password;

    let success = await onLogin(cleanUsername, cleanPassword);
    if (!success && cleanPassword !== cleanPassword.trim()) {
      success = await onLogin(cleanUsername, cleanPassword.trim());
    }
    if (!success) {
      setError('اسم المستخدم أو كلمة المرور غير صحيحة. يرجى التأكد من كتابة الأحرف بدقة وبدون مسافات إضافية.');
      setFailedAttempts(prev => prev + 1);
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: isMidnightGold
          ? 'linear-gradient(to bottom right, #0f0e0c, #1a1815, #0f0e0c)'
          : `linear-gradient(to bottom right, ${accentColor}, #1e3a8a, ${accentColor})`,
      }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-20 h-20 backdrop-blur rounded-2xl mb-4 overflow-hidden ${isMidnightGold ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-white/10'}`}>
            {branding.shopLogo ? (
              <img src={branding.shopLogo} alt={shopName} className="w-full h-full object-contain" />
            ) : (
              <Smartphone size={40} className={isMidnightGold ? 'text-amber-400' : 'text-white'} />
            )}
          </div>
          <h1 className={`text-3xl font-bold ${isMidnightGold ? 'text-amber-100' : 'text-white'}`}>{shopName}</h1>
          <p className={isMidnightGold ? 'text-amber-200/70 mt-2' : 'text-blue-200 mt-2'}>نظام إدارة المحل المتكامل</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6 text-center">تسجيل الدخول</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-200 text-sm">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-blue-200 text-sm mb-2">اسم المستخدم</label>
              <div className="relative">
                <User size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg py-3 px-10 text-white placeholder-blue-300 focus:outline-none focus:border-white/50 transition font-sans text-right"
                  placeholder="أدخل اسم المستخدم (مثلاً admin)"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-blue-200 text-sm mb-2">كلمة المرور</label>
              <div className="relative">
                <Lock size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg py-3 pr-10 pl-11 text-white placeholder-blue-300 focus:outline-none focus:border-white/50 transition font-sans text-right"
                  placeholder="أدخل كلمة المرور"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white transition p-1"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-white text-blue-900 font-bold py-3 px-4 rounded-lg hover:bg-blue-100 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              'دخول'
            )}
          </button>

          {/* Hint for initial setup */}
          <div className="mt-5 pt-4 border-t border-white/10 flex flex-col items-center justify-center gap-2 text-xs text-blue-200/70 text-center">
            <div className="flex items-center gap-1.5">
              <Info size={13} className="shrink-0" />
              <span>الحساب الافتراضي: <strong>admin</strong> | كلمة المرور: <strong>admin123</strong></span>
            </div>
            {(failedAttempts > 0 || error) && (
              <button
                type="button"
                onClick={handleUseDefaultAdmin}
                className="mt-1 text-xs text-amber-300 hover:text-white underline transition cursor-pointer font-medium"
              >
                استخدام بيانات الحساب الافتراضي للطوارئ (admin / admin123)
              </button>
            )}
          </div>

        </form>
      </div>
    </div>
  );
}
