import { useState, useEffect, useRef } from 'react';
import {
  Key, Plus, Copy, Trash2, ArrowRight, Shield, CheckCircle,
  Crown, Zap, Building, X, Eye, EyeOff, Lock, Infinity as InfinityIcon,
  KeyRound, Upload, AlertTriangle, Fingerprint
} from 'lucide-react';
import { LicenseKey, PlanType, PLAN_FEATURES } from '../license/types';
import { LICENSE_PUBLIC_KEY, ACTIVATION_SERVER_URL } from '../license/keys';
import {
  generateLicenseKey, verifyMasterPassword, hasMasterPassword, setupMasterPassword,
  getStoredMasterKeys, storeMasterKeys, getDaysRemaining,
  getStoredSigningKey, storeSigningKey, clearSigningKey, generateSigningKeyPair,
} from '../license/engine';

interface MasterAdminProps {
  onBack: () => void;
}

type AuthStage = 'loading' | 'setup' | 'login' | 'in';

export default function MasterAdmin({ onBack }: MasterAdminProps) {
  const [stage, setStage] = useState<AuthStage>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [showKeyModal, setShowKeyModal] = useState<LicenseKey | null>(null);

  // Signing key state
  const [signingKey, setSigningKey] = useState<JsonWebKey | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importDraft, setImportDraft] = useState('');
  const [importError, setImportError] = useState('');
  const [showPublicKey, setShowPublicKey] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    plan: 'pro' as PlanType,
    shopName: '',
    issuedTo: '',
    durationDays: 365,
    maxUsers: 8,
    notes: ''
  });

  useEffect(() => {
    (async () => {
      const has = await hasMasterPassword();
      setStage(has ? 'login' : 'setup');
      setSigningKey(getStoredSigningKey());
    })();
  }, []);

  useEffect(() => {
    if (stage === 'in') {
      setKeys(getStoredMasterKeys());
    }
  }, [stage]);

  const handleSetup = async () => {
    if (password.length < 8) {
      setAuthError('كلمة المرور يجب ألا تقل عن 8 أحرف');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('كلمتا المرور غير متطابقتين');
      return;
    }
    await setupMasterPassword(password);
    setStage('in');
    setAuthError('');
  };

  const handleAuth = async () => {
    const ok = await verifyMasterPassword(password);
    if (ok) {
      setStage('in');
      setAuthError('');
    } else {
      setAuthError('كلمة مرور خاطئة');
    }
  };

  // Does this browser's signing key match the public key embedded in the app?
  const keyMatchesApp = signingKey
    ? signingKey.x === LICENSE_PUBLIC_KEY.x && signingKey.y === LICENSE_PUBLIC_KEY.y
    : false;

  const publicKeyJwk = signingKey
    ? JSON.stringify({ kty: signingKey.kty, crv: signingKey.crv, x: signingKey.x, y: signingKey.y })
    : '';

  const handleGenerateKeyPair = async () => {
    const pair = await generateSigningKeyPair();
    storeSigningKey(pair.privateKey);
    setSigningKey(pair.privateKey);
    setShowPublicKey(true);
  };

  const handleImportKey = () => {
    setImportError('');
    try {
      const jwk = JSON.parse(importDraft.trim());
      if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) {
        setImportError('الملف ليس مفتاحاً خاصاً صالحاً (EC P-256)');
        return;
      }
      storeSigningKey(jwk);
      setSigningKey(jwk);
      setShowImport(false);
      setImportDraft('');
    } catch {
      setImportError('صيغة JSON غير صالحة');
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      setImportDraft(text);
      setImportError('');
    } catch {
      setImportError('تعذر قراءة الملف');
    }
  };

  const handleGenerate = async () => {
    if (!form.shopName) {
      alert('اسم المحل مطلوب');
      return;
    }
    if (!signingKey) {
      alert('يجب إعداد مفتاح التوقيع أولاً');
      return;
    }

    setGenerating(true);
    try {
      const newKey = await generateLicenseKey(
        signingKey,
        form.plan,
        form.shopName,
        form.issuedTo,
        form.durationDays,
        form.maxUsers || PLAN_FEATURES[form.plan].maxUsers,
        form.notes
      );

      const updatedKeys = [newKey, ...keys];
      setKeys(updatedKeys);
      storeMasterKeys(updatedKeys);
      setShowGenerate(false);
      setShowKeyModal(newKey);
      setForm({ plan: 'pro', shopName: '', issuedTo: '', durationDays: 365, maxUsers: 8, notes: '' });
    } catch {
      alert('فشل توليد المفتاح');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا المفتاح من السجل؟ (لن يلغي تفعيله إن كان مفعلاً)')) {
      const updatedKeys = keys.filter(k => k.id !== id);
      setKeys(updatedKeys);
      storeMasterKeys(updatedKeys);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const planIcons: Record<PlanType, typeof Crown> = {
    basic: Zap,
    pro: Crown,
    enterprise: Building,
    lifetime: InfinityIcon
  };

  // ===== Setup screen (first time: owner chooses the master password) =====
  if (stage === 'setup') {
    return (
      <AuthShell onBack={onBack} title="إعداد لوحة الماستر" subtitle="أول مرة: اختر كلمة مرور رئيسية للوحة">
        {authError && <AuthError msg={authError} />}
        <div className="mb-4">
          <label className="block text-sm text-red-200/70 mb-2">كلمة المرور الرئيسية (8 أحرف على الأقل)</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => { setPassword(e.target.value); setAuthError(''); }}
            placeholder="••••••••••"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-red-300/30 focus:outline-none focus:border-red-500/50"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm text-red-200/70 mb-2">تأكيد كلمة المرور</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={e => { setConfirmPassword(e.target.value); setAuthError(''); }}
            placeholder="••••••••••"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-red-300/30 focus:outline-none focus:border-red-500/50"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-red-200/60 mb-4 cursor-pointer">
          <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} />
          إظهار كلمة المرور
        </label>
        <button
          onClick={handleSetup}
          className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 text-white font-bold rounded-xl hover:from-red-700 hover:to-red-800 transition flex items-center justify-center gap-2"
        >
          <Lock size={18} />
          حفظ والدخول
        </button>
        <p className="mt-4 text-xs text-red-200/40 leading-relaxed">
          🔒 كلمة المرور تُحفظ مجزأة بأمان (PBKDF2-HMAC-SHA-256 بملح فريد) في هذا المتصفح فقط. لا توجد أي كلمة مرور مكتوبة داخل كود النظام.
        </p>
      </AuthShell>
    );
  }

  // ===== Login screen =====
  if (stage === 'login' || stage === 'loading') {
    return (
      <AuthShell onBack={onBack} title="Master Admin" subtitle="لوحة تحكم مولّد المفاتيح">
        {authError && <AuthError msg={authError} />}
        <div className="mb-4">
          <label className="block text-sm text-red-200/70 mb-2">كلمة المرور الرئيسية</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setAuthError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAuth()}
              placeholder="••••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pl-10 text-white placeholder-red-300/30 focus:outline-none focus:border-red-500/50"
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-red-300/40 hover:text-red-300"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <button
          onClick={handleAuth}
          disabled={stage === 'loading'}
          className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 text-white font-bold rounded-xl hover:from-red-700 hover:to-red-800 transition flex items-center justify-center gap-2"
        >
          <Lock size={18} />
          دخول
        </button>
      </AuthShell>
    );
  }

  // ===== Main admin panel =====
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center justify-center">
              <Shield className="text-red-400" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Master Admin Panel</h1>
              <p className="text-slate-400 text-sm">إدارة مفاتيح التفعيل — مفاتيح موقّعة رقمياً ECDSA</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowGenerate(true)}
              disabled={!signingKey || !keyMatchesApp}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition shadow-lg shadow-blue-600/20"
            >
              <Plus size={18} />
              توليد مفتاح جديد
            </button>
            <button
              onClick={onBack}
              className="px-4 py-2.5 bg-white/5 border border-white/10 text-slate-300 rounded-xl hover:bg-white/10 transition flex items-center gap-2"
            >
              <ArrowRight size={16} />
              رجوع
            </button>
          </div>
        </div>

        {/* ===== Signing key status ===== */}
        <div className={`rounded-2xl border p-5 mb-6 ${signingKey && keyMatchesApp ? 'bg-green-500/5 border-green-500/20' : 'bg-amber-500/5 border-amber-500/30'}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${signingKey && keyMatchesApp ? 'bg-green-500/20' : 'bg-amber-500/20'}`}>
                <KeyRound size={20} className={signingKey && keyMatchesApp ? 'text-green-400' : 'text-amber-400'} />
              </div>
              <div>
                <p className="font-bold text-white">
                  {signingKey
                    ? keyMatchesApp
                      ? '✅ مفتاح التوقيع جاهز ومطابق للنسخة الحالية من التطبيق'
                      : '⚠️ مفتاح التوقيع موجود لكنه لا يطابق المفتاح العام المضمّن في التطبيق'
                    : '🔑 مفتاح التوقيع غير مُعدّ على هذا المتصفح'}
                </p>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                  {signingKey
                    ? keyMatchesApp
                      ? 'يمكنك توليد مفاتيح تفعيل الآن. المفتاح الخاص محفوظ في هذا المتصفح فقط ولا يغادره.'
                      : 'المفاتيح المولّدة الآن لن يقبلها التطبيق حتى تحدّث LICENSE_PUBLIC_KEY في src/license/keys.ts بالمفتاح العام الجديد وتعيد البناء.'
                    : 'ولّد زوج مفاتيح جديدًا أو استورد المفتاح الخاص (master-private-key.json) للبدء.'}
                </p>
                {signingKey && !keyMatchesApp && (
                  <button
                    onClick={() => setShowPublicKey(v => !v)}
                    className="mt-2 text-xs px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-lg hover:bg-amber-500/30 transition"
                  >
                    {showPublicKey ? 'إخفاء المفتاح العام' : 'عرض المفتاح العام الجديد (للتحديث في الكود)'}
                  </button>
                )}
                {showPublicKey && publicKeyJwk && (
                  <pre className="mt-2 p-3 bg-black/40 rounded-lg text-green-400 text-xs font-mono break-all whitespace-pre-wrap" dir="ltr">{publicKeyJwk}</pre>
                )}
              </div>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              {!signingKey ? (
                <>
                  <button
                    onClick={handleGenerateKeyPair}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition"
                  >
                    توليد زوج مفاتيح جديد
                  </button>
                  <button
                    onClick={() => setShowImport(true)}
                    className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200 text-sm font-bold rounded-xl transition flex items-center gap-1.5"
                  >
                    <Upload size={14} />
                    استيراد مفتاح خاص
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    if (confirm('إزالة المفتاح الخاص من هذا المتصفح؟ لن تستطيع توليد مفاتيح بدون استيراده مجدداً.')) {
                      clearSigningKey();
                      setSigningKey(null);
                    }
                  }}
                  className="px-4 py-2 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-300 text-sm rounded-xl transition flex items-center gap-1.5"
                >
                  <Trash2 size={14} />
                  إزالة المفتاح
                </button>
              )}
            </div>
          </div>

          {/* Import box */}
          {showImport && !signingKey && (
            <div className="mt-4 p-4 bg-black/30 rounded-xl border border-white/10">
              <p className="text-sm text-slate-300 mb-2 font-bold">الصق محتوى المفتاح الخاص (JWK) أو اختر الملف:</p>
              <div className="flex gap-2 mb-2 flex-wrap">
                <button
                  onClick={() => importFileRef.current?.click()}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition flex items-center gap-1"
                >
                  <Upload size={12} /> اختيار ملف master-private-key.json
                </button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }}
                />
              </div>
              <textarea
                value={importDraft}
                onChange={e => setImportDraft(e.target.value)}
                rows={4}
                dir="ltr"
                placeholder='{ "kty": "EC", "crv": "P-256", "x": "...", "y": "...", "d": "..." }'
                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-green-300 font-mono text-xs focus:outline-none focus:border-blue-500/50"
              />
              {importError && <p className="text-red-400 text-xs mt-1">{importError}</p>}
              <div className="flex gap-2 mt-2">
                <button onClick={handleImportKey} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg">استيراد</button>
                <button onClick={() => setShowImport(false)} className="px-4 py-1.5 bg-white/5 text-slate-300 text-xs rounded-lg">إلغاء</button>
              </div>
            </div>
          )}
        </div>

        {/* ===== Activation server warning ===== */}
        {!ACTIVATION_SERVER_URL && (
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4 mb-6 flex items-start gap-3">
            <AlertTriangle size={20} className="text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200/80 leading-relaxed">
              <b>سيرفر التفعيل غير مضبوط.</b> بدون سيرفر، المفتاح يرتبط بالجهاز عند أول تفعيل لكن لا يمكن منعه تقنياً من التفعيل على جهاز آخر بنسخة من نفس المفتاح.
              لتفعيل الحماية الكاملة (المفتاح يموت بعد أول استخدام على أي جهاز آخر)، انشر مجلد <span className="font-mono text-xs bg-black/30 px-1 rounded" dir="ltr">activation-server/</span> ثم ضع رابطه في <span className="font-mono text-xs bg-black/30 px-1 rounded" dir="ltr">ACTIVATION_SERVER_URL</span> داخل <span className="font-mono text-xs bg-black/30 px-1 rounded" dir="ltr">src/license/keys.ts</span> وأعد البناء.
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatCard label="إجمالي المفاتيح" value={keys.length} color="text-white" />
          <StatCard label="أساسي" value={keys.filter(k => k.plan === 'basic').length} color="text-green-400" />
          <StatCard label="احترافي" value={keys.filter(k => k.plan === 'pro').length} color="text-blue-400" />
          <StatCard label="مؤسسي" value={keys.filter(k => k.plan === 'enterprise').length} color="text-purple-400" />
          <StatCard label="دائم" value={keys.filter(k => k.plan === 'lifetime').length} color="text-amber-400" />
        </div>

        {/* Keys Table */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-white font-bold">المفاتيح المولّدة</h3>
          </div>

          {keys.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Key size={40} className="mx-auto mb-3 opacity-30" />
              <p>لم يتم توليد أي مفاتيح بعد</p>
              <p className="text-sm mt-1">اضغط "توليد مفتاح جديد" للبدء</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">الباقة</th>
                    <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">المحل</th>
                    <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">صدر لـ</th>
                    <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">الصلاحية</th>
                    <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">ينتهي</th>
                    <th className="px-4 py-3 text-center text-xs text-slate-400 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {keys.map(k => {
                    const Icon = planIcons[k.plan];
                    const remaining = getDaysRemaining(k.expiresAt, k.lifetime);
                    const isExpired = !k.lifetime && remaining === 0;
                    return (
                      <tr key={k.id} className={`hover:bg-white/5 ${isExpired ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Icon size={14} className="text-blue-400" />
                            <span className="text-white text-sm font-medium">{PLAN_FEATURES[k.plan].nameAr}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-sm">{k.shopName}</td>
                        <td className="px-4 py-3 text-slate-400 text-sm">{k.issuedTo || '—'}</td>
                        <td className="px-4 py-3 text-slate-300 text-sm">
                          {k.lifetime ? (
                            <span className="text-amber-400 font-bold flex items-center gap-1"><InfinityIcon size={14} /> دائم</span>
                          ) : `${getDaysRemaining(k.expiresAt)} يوم`}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-sm">
                          {k.lifetime ? '∞ لا ينتهي' : new Date(k.expiresAt).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => copyToClipboard(k.key, k.id)}
                              className="p-2 text-slate-400 hover:bg-white/10 hover:text-white rounded-lg transition"
                              title="نسخ المفتاح"
                            >
                              {copiedId === k.id ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
                            </button>
                            <button
                              onClick={() => setShowKeyModal(k)}
                              className="p-2 text-slate-400 hover:bg-white/10 hover:text-white rounded-lg transition"
                              title="عرض"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(k.id)}
                              className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition"
                              title="حذف"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Key size={20} className="text-blue-400" />
                توليد مفتاح جديد (موقّع رقمياً)
              </h3>
              <button onClick={() => setShowGenerate(false)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Plan Selection */}
              <div>
                <label className="block text-sm text-slate-300 mb-2 font-medium">الباقة</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['basic', 'pro', 'enterprise', 'lifetime'] as PlanType[]).map(plan => {
                    const Icon = planIcons[plan];
                    return (
                      <button
                        key={plan}
                        onClick={() => setForm(prev => ({
                          ...prev,
                          plan,
                          maxUsers: PLAN_FEATURES[plan].maxUsers
                        }))}
                        className={`p-3 rounded-xl border-2 transition text-center ${
                          form.plan === plan
                            ? plan === 'lifetime'
                              ? 'border-amber-500 bg-amber-500/10'
                              : 'border-blue-500 bg-blue-500/10'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <Icon size={18} className={`mx-auto mb-1 ${form.plan === plan ? (plan === 'lifetime' ? 'text-amber-400' : 'text-blue-400') : 'text-slate-500'}`} />
                        <p className="text-white text-xs font-bold">{PLAN_FEATURES[plan].nameAr}</p>
                      </button>
                    );
                  })}
                </div>
                {form.plan === 'lifetime' && (
                  <p className="mt-2 text-xs text-amber-300/80 flex items-center gap-1.5">
                    <InfinityIcon size={13} />
                    الاشتراك الدائم: جميع المميزات مدى الحياة — لا تنتهي صلاحيته أبداً، ويعمل على جهاز واحد فقط.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1.5 font-medium">اسم المحل *</label>
                <input
                  type="text"
                  value={form.shopName}
                  onChange={e => setForm(prev => ({ ...prev, shopName: e.target.value }))}
                  placeholder="مثال: محل أبو علي للموبايلات"
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1.5 font-medium">رقم الهاتف / الإيميل</label>
                <input
                  type="text"
                  value={form.issuedTo}
                  onChange={e => setForm(prev => ({ ...prev, issuedTo: e.target.value }))}
                  placeholder="01xxxxxxxxx"
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1.5 font-medium">مدة الصلاحية</label>
                  {form.plan === 'lifetime' ? (
                    <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-300 font-bold flex items-center gap-2">
                      <InfinityIcon size={16} /> مدى الحياة
                    </div>
                  ) : (
                    <select
                      value={form.durationDays}
                      onChange={e => setForm(prev => ({ ...prev, durationDays: Number(e.target.value) }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500/50"
                    >
                      <option value={14}>14 يوم (تجربة)</option>
                      <option value={30}>30 يوم (شهر)</option>
                      <option value={90}>90 يوم (3 شهور)</option>
                      <option value={180}>180 يوم (6 شهور)</option>
                      <option value={365}>365 يوم (سنة)</option>
                      <option value={730}>730 يوم (سنتين)</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1.5 font-medium">عدد المستخدمين</label>
                  <input
                    type="number"
                    min="1"
                    value={form.maxUsers}
                    onChange={e => setForm(prev => ({ ...prev, maxUsers: Number(e.target.value) }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1.5 font-medium">ملاحظات</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="ملاحظات إضافية..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                />
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-200/80 flex items-start gap-2">
                <Fingerprint size={14} className="flex-shrink-0 mt-0.5" />
                <span>عند التفعيل سيُربط هذا المفتاح بجهاز العميل (بصمة عتادية){ACTIVATION_SERVER_URL ? ' وسيُسجَّل على سيرفر التفعيل فلا يعمل على أي جهاز آخر نهائياً' : ' — فعّل سيرفر التفعيل لمنع استخدامه على أكثر من جهاز'}.</span>
              </div>
            </div>

            <div className="p-6 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => setShowGenerate(false)}
                className="px-4 py-2 border border-white/10 rounded-xl text-slate-300 hover:bg-white/5"
              >
                إلغاء
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 disabled:opacity-50 text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 flex items-center gap-2"
              >
                {generating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Key size={16} />}
                توليد المفتاح
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key Detail Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">🔑 تفاصيل المفتاح</h3>
              <button onClick={() => setShowKeyModal(null)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-3 rounded-xl">
                  <p className="text-xs text-slate-400">الباقة</p>
                  <p className="text-white font-bold">{PLAN_FEATURES[showKeyModal.plan].nameAr}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-xl">
                  <p className="text-xs text-slate-400">المحل</p>
                  <p className="text-white font-bold">{showKeyModal.shopName}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-xl">
                  <p className="text-xs text-slate-400">الصلاحية</p>
                  <p className="text-white font-bold">
                    {showKeyModal.lifetime ? '∞ مدى الحياة' : `${getDaysRemaining(showKeyModal.expiresAt)} يوم`}
                  </p>
                </div>
                <div className="bg-white/5 p-3 rounded-xl">
                  <p className="text-xs text-slate-400">المستخدمين</p>
                  <p className="text-white font-bold">{showKeyModal.maxUsers}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-2">مفتاح التفعيل الموقّع (انسخه وابعته للعميل)</p>
                <div className="bg-black/30 border border-white/10 rounded-xl p-4 relative">
                  <pre className="text-green-400 text-xs font-mono break-all whitespace-pre-wrap leading-relaxed" dir="ltr">
                    {showKeyModal.key}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(showKeyModal.key, showKeyModal.id)}
                    className={`absolute top-2 left-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      copiedId === showKeyModal.id ? 'bg-green-500 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                    }`}
                  >
                    {copiedId === showKeyModal.id ? '✓ تم النسخ' : '📋 نسخ'}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-white/10">
              <button
                onClick={() => setShowKeyModal(null)}
                className="w-full py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:bg-white/10"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Small helper components =====

function AuthShell({ children, onBack, title, subtitle }: {
  children: React.ReactNode;
  onBack: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-slate-950 to-red-950 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 border border-red-500/30 rounded-2xl mb-4">
            <Shield className="text-red-400" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-red-300/60 mt-1 text-sm">{subtitle}</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          {children}
          <button
            onClick={onBack}
            className="w-full mt-3 py-2 text-red-300/50 hover:text-red-300 text-sm transition flex items-center justify-center gap-1"
          >
            <ArrowRight size={14} />
            رجوع
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthError({ msg }: { msg: string }) {
  return (
    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm text-center">
      {msg}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <p className="text-slate-400 text-sm">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
