import React from 'react';
import {
  DownloadCloud,
  Sparkles,
  X,
  CheckCircle2,
  Calendar,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import type { MobileUpdateResult } from '../utils/updateCheck';

interface UpdateModalProps {
  update: MobileUpdateResult | null;
  isOpen: boolean;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  update,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !update) return null;

  const handleDownload = () => {
    const url = update.downloadUrl || update.htmlUrl;
    if (url) {
      window.open(url, '_system');
    }
  };

  const formattedDate = update.publishedAt
    ? new Date(update.publishedAt).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-cyan-500/30 rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl shadow-cyan-950/40">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shadow">
              <DownloadCloud size={20} className="animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-black text-white">تحديث جديد متوفر!</h3>
                <span className="p-0.5 rounded-md bg-cyan-500/20 text-cyan-400">
                  <Sparkles size={11} />
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                إصدار رسمي معتمد لنظام MOBPOS
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-850 hover:bg-slate-800 transition"
          >
            <X size={17} />
          </button>
        </div>

        {/* Version Comparison Card */}
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/[0.06] flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 block mb-0.5">الإصدار المثبت حالياً</span>
            <span className="text-xs font-mono font-bold text-slate-400">
              v{update.currentVersion}
            </span>
          </div>

          <div className="text-cyan-400 font-black text-sm px-2">➜</div>

          <div className="text-left">
            <span className="text-[10px] text-cyan-400 font-bold block mb-0.5">الإصدار الأحدث</span>
            <span className="text-xs font-mono font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
              v{update.latestVersion}
            </span>
          </div>
        </div>

        {/* Title & Date */}
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-cyan-400" />
            <span>{update.releaseTitle}</span>
          </h4>
          {formattedDate && (
            <p className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
              <Calendar size={11} className="text-slate-500" />
              <span>تاريخ الإطلاق: {formattedDate}</span>
            </p>
          )}
        </div>

        {/* Changelog Box */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-slate-300 block">ما الجديد في هذا التحديث:</span>
          <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 text-[11px] text-slate-300 font-sans leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto no-scrollbar">
            {update.releaseNotes}
          </div>
        </div>

        {/* Security Note */}
        <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 flex items-center gap-2 text-[10px] text-cyan-300">
          <ShieldCheck size={16} className="text-cyan-400 shrink-0" />
          <span>ملف التحديث آمن وموقّع ومصدره مستودع المنظومة الرسمي.</span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleDownload}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs transition active:scale-[0.98] shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
          >
            <DownloadCloud size={16} />
            <span>تنزيل وتثبيت التحديث الآن (APK)</span>
            <ExternalLink size={12} className="opacity-70" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs transition"
          >
            تذكيري لاحقاً
          </button>
        </div>
      </div>
    </div>
  );
};
