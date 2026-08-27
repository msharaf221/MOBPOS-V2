import React, { useEffect, useState } from 'react';
import { Smartphone, Lock, User, AlertCircle } from 'lucide-react';
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const success = await onLogin(username, password);
    if (!success) {
      setError('اسم المستخدم أو كلمة المرور غير صحيحة');
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
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-200">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-blue-200 text-sm mb-2">اسم المستخدم</label>
              <div className="relative">
                <User size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg py-3 px-10 text-white placeholder-blue-300 focus:outline-none focus:border-white/50 transition"
                  placeholder="أدخل اسم المستخدم"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-blue-200 text-sm mb-2">كلمة المرور</label>
              <div className="relative">
                <Lock size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg py-3 px-10 text-white placeholder-blue-300 focus:outline-none focus:border-white/50 transition"
                  placeholder="أدخل كلمة المرور"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-white text-blue-900 font-bold py-3 px-4 rounded-lg hover:bg-blue-100 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              'دخول'
            )}
          </button>

        </form>
      </div>
    </div>
  );
}
