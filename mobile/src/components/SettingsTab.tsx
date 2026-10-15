import React from 'react';
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

      {/* System info */}
      <div className="p-4 rounded-3xl glass-card flex items-start gap-3 text-slate-400">
        <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-slate-200">
            MOBPOS Companion — رادار الفروع v1.0.0
          </p>
          <p className="text-[10px] leading-relaxed">
            تطبيق مخصص لمالك النظام لمتابعة وإدارة الفروع المتعددة لحظياً من أي هاتف (أندرويد وآيفون) في نفس الوقت.
          </p>
        </div>
      </div>
    </div>
  );
};
