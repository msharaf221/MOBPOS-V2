import React, { useState } from 'react';
import {
  X,
  Building2,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  Save,
} from 'lucide-react';
import type { BranchConfig } from '../types';
import { createClient } from '@supabase/supabase-js';

const COLOR_PRESETS = [
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#f97316', // Orange
];

interface BranchEditModalProps {
  branch: BranchConfig | null; // null if adding new
  isOpen: boolean;
  onClose: () => void;
  onSave: (branchData: Omit<BranchConfig, 'id' | 'createdAt'>, existingId?: string) => void;
  onDelete?: (id: string) => void;
}

export const BranchEditModal: React.FC<BranchEditModalProps> = ({
  branch,
  isOpen,
  onClose,
  onSave,
  onDelete,
}) => {
  if (!isOpen) return null;

  const [name, setName] = useState(branch?.name || '');
  const [city, setCity] = useState(branch?.city || 'القاهرة');
  const [code, setCode] = useState(branch?.code || '');
  const [color, setColor] = useState(branch?.color || '#06b6d4');
  const [supabaseUrl, setSupabaseUrl] = useState(branch?.supabaseUrl || '');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(branch?.supabaseAnonKey || '');
  const [tenantId, setTenantId] = useState(branch?.tenantId || '');
  const [enabled, setEnabled] = useState(branch?.enabled ?? true);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleTestConnection = async () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      setTestResult({ ok: false, msg: 'يرجى إدخال الرابط والمفتاح أولاً' });
      return;
    }
    setTesting(true);
    setTestResult(null);

    try {
      const client = createClient(supabaseUrl.trim().replace(/\/+$/, ''), supabaseAnonKey.trim(), {
        auth: { persistSession: false },
      });
      const { data, error } = await client
        .from('mobpos_records')
        .select('tenant_id')
        .limit(1);

      if (error) {
        setTestResult({ ok: false, msg: `فشل الاتصال: ${error.message}` });
      } else {
        setTestResult({ ok: true, msg: 'تم الاتصال بقاعدة بيانات الفرع بنجاح! ⚡' });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : 'خطأ بالاتصال' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('يرجى إدخال اسم الفرع');
      return;
    }
    onSave(
      {
        name: name.trim(),
        city: city.trim(),
        code: code.trim(),
        color,
        supabaseUrl: supabaseUrl.trim().replace(/\/+$/, ''),
        supabaseAnonKey: supabaseAnonKey.trim(),
        tenantId: tenantId.trim() || `tenant_${Date.now()}`,
        enabled,
      },
      branch?.id
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: color }}
            >
              <Building2 size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {branch ? 'تعديل بيانات الفرع' : 'إضافة فرع / محل جديد'}
              </h3>
              <p className="text-[10px] text-slate-400">
                ربط الفرع بقاعدة بيانات Supabase الخاصة به
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 font-bold mb-1">اسم الفرع *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="مثال: فرع المهندسين، فرع سيتي ستارز"
              className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-300 font-bold mb-1">المدينة / المنطقة</label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="القاهرة، الجيزة، الإسكندرية..."
                className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-bold mb-1">كود الفرع المختصر</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="MHD-01"
                className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none uppercase font-mono"
              />
            </div>
          </div>

          {/* Color Picker */}
          <div>
            <label className="block text-slate-300 font-bold mb-1.5">لون الفرع في الشاشة</label>
            <div className="flex items-center gap-2">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Supabase Connection info for this branch */}
          <div className="pt-2 border-t border-slate-800 space-y-2.5">
            <div className="text-[11px] font-bold text-cyan-400 flex items-center gap-1">
              <KeyRound size={13} />
              <span>بيانات الربط السحابي الخاصة بهذا الفرع (Supabase):</span>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">رابط المشروع (Supabase URL)</label>
              <input
                type="text"
                dir="ltr"
                value={supabaseUrl}
                onChange={e => setSupabaseUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-[11px] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">المفتاح العام (Anon Key)</label>
              <input
                type="password"
                dir="ltr"
                value={supabaseAnonKey}
                onChange={e => setSupabaseAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..."
                className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-[11px] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">معرف المتجر في البرنامج (Tenant ID)</label>
              <input
                type="text"
                dir="ltr"
                value={tenantId}
                onChange={e => setTenantId(e.target.value)}
                placeholder="مثال: معرف ترخيص الفرع"
                className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-[11px] focus:outline-none"
              />
            </div>

            {/* Test Connection Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-cyan-300 font-bold text-xs flex items-center justify-center gap-1.5 transition border border-slate-700 disabled:opacity-50"
              >
                {testing ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                <span>اختبار الاتصال بالفرع</span>
              </button>

              {testResult && (
                <div
                  className={`mt-2 p-2 rounded-xl text-xs flex items-center gap-1.5 ${
                    testResult.ok
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                  }`}
                >
                  {testResult.ok ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertTriangle size={14} className="shrink-0" />}
                  <span>{testResult.msg}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
          {branch && onDelete ? (
            <button
              type="button"
              onClick={() => {
                if (confirm(`هل أنت متأكد من حذف فرع "${branch.name}" من التطبيق؟`)) {
                  onDelete(branch.id);
                  onClose();
                }
              }}
              className="py-2.5 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-xs font-bold transition flex items-center gap-1"
            >
              <Trash2 size={14} />
              <span>حذف الفرع</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="py-2.5 px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition flex items-center gap-1 shadow-lg shadow-cyan-500/20"
            >
              <Save size={14} />
              <span>حفظ الفرع</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
