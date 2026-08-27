import { useEffect, useRef, useState, useCallback } from 'react';
import { Printer, FileDown, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { REPORT_PREVIEW_EVENT, ReportPreviewPayload } from '../utils/reports';
import { isDesktop } from '../utils/print';

// ============================================================
//  معاينة التقارير داخل التطبيق
//  - HTML: راجع التقرير بنفس شكل الطباعة قبل ما تطبع
//  - داخل الـ EXE: حفظ PDF حقيقي (dialog اختيار المكان) + طباعة مباشرة
//    عبر نافذة مخفية في الـ main process — لا نافذ منبثقة محظورة ولا أعطال
//  - في المتصفح: نافذة الطباعة العادية (ومنها اختار حفظ PDF)
// ============================================================

interface Toast {
  kind: 'success' | 'error';
  message: string;
}

export default function ReportPreview() {
  const [report, setReport] = useState<ReportPreviewPayload | null>(null);
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const onEvent = (e: Event) => {
      setReport((e as CustomEvent<ReportPreviewPayload>).detail);
      setBusy(null);
    };
    window.addEventListener(REPORT_PREVIEW_EVENT, onEvent);
    return () => window.removeEventListener(REPORT_PREVIEW_EVENT, onEvent);
  }, []);

  useEffect(() => {
    if (!report) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReport(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [report]);

  if (!report) return null;

  const handlePrint = async () => {
    if (busy) return;
    setBusy('print');
    try {
      if (isDesktop() && window.mobpos?.printHtml) {
        const ok = await window.mobpos.printHtml(report.html, { silent: false });
        if (ok) showToast({ kind: 'success', message: 'تم إرسال التقرير للطابعة' });
      } else {
        // متصفح: نطبع محتوى الـ iframe نفسه (بدون حوليات التطبيق)
        const w = iframeRef.current?.contentWindow;
        if (w) {
          w.focus();
          w.print();
        }
      }
    } catch {
      showToast({ kind: 'error', message: 'فشلت الطباعة — حاول مرة أخرى' });
    } finally {
      setBusy(null);
    }
  };

  const handleSavePdf = async () => {
    if (busy) return;
    setBusy('pdf');
    try {
      if (isDesktop() && window.mobpos?.savePdf) {
        const res = await window.mobpos.savePdf(report.html, report.fileName);
        if (res.ok && res.path) {
          showToast({ kind: 'success', message: `تم حفظ الملف: ${res.path}` });
        } else if (res.ok === false && !res.canceled) {
          showToast({ kind: 'error', message: res.error || 'فشل حفظ ملف PDF' });
        }
      }
    } catch {
      showToast({ kind: 'error', message: 'فشل حفظ ملف PDF — حاول مرة أخرى' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) setReport(null); }}
    >
      <div className="w-[min(940px,96vw)] h-[92vh] bg-gray-100 dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* شريط أدوات المودال */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-900 to-blue-600 text-white flex items-center justify-center font-bold shrink-0">M</span>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-800 dark:text-white truncate">{report.title}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">معاينة قبل الطباعة — ما تراه هو ما سيُطبع</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrint}
              disabled={busy !== null}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm font-bold"
            >
              {busy === 'print' ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              طباعة
            </button>

            {isDesktop() && window.mobpos?.savePdf && (
              <button
                onClick={handleSavePdf}
                disabled={busy !== null}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 text-sm font-bold"
              >
                {busy === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                حفظ PDF
              </button>
            )}

            <button
              onClick={() => setReport(null)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-500"
              title="إغلاق (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* منطقة المعاينة: الورقة على خلفية رمادية زي قارئ PDF */}
        <div className="flex-1 overflow-auto bg-gray-200 dark:bg-gray-950 p-4">
          <iframe
            ref={iframeRef}
            srcDoc={report.html}
            title={report.title}
            className="w-full h-full bg-white rounded-lg shadow-lg"
            style={{ border: 'none', minHeight: '100%' }}
          />
        </div>

        {!isDesktop() && (
          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300 text-center">
            للحفظ كـ PDF من المتصفح: اضغط «طباعة» ثم اختر «حفظ بتنسيق PDF» من نافذة الطباعة — أو استخدم تطبيق سطح المكتب لحفظ PDF بضغطة واحدة
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl text-white text-sm font-bold animate-fadeIn ${
            toast.kind === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
          style={{ direction: 'rtl' }}
        >
          {toast.kind === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="max-w-[70vw] truncate" title={toast.message}>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
