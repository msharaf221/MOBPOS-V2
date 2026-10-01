import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Copy, Check, Home } from 'lucide-react';
import { formatCrashReport } from '../utils/errorHandling';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((props: { error: Error; resetError: () => void }) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an unhandled React error:', error, errorInfo);
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  public resetError = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  private handleCopy = (): void => {
    const { error, errorInfo } = this.state;
    const report = formatCrashReport(error, errorInfo?.componentStack);

    navigator.clipboard?.writeText(report.rawReport).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(() => {
      // Fallback
    });
  };

  public override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (typeof this.props.fallback === 'function') {
      return this.props.fallback({
        error: this.state.error || new Error('Unknown error occurred'),
        resetError: this.resetError
      });
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div
        dir="rtl"
        className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 select-none font-sans"
      >
        <div className="max-w-xl w-full bg-slate-800/90 border border-red-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-4 text-red-400 mb-6">
            <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
              <AlertOctagon size={36} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">حدث خطأ غير متوقع في النظام</h1>
              <p className="text-slate-400 text-sm mt-1">
                تم عزل الخطأ بأمان لحماية بياناتك من التلف دون إغلاق نافذة البرنامج.
              </p>
            </div>
          </div>

          {this.state.error && (
            <div className="mb-6 bg-slate-950/70 border border-slate-700/60 rounded-xl p-4 font-mono text-xs text-red-300 break-words max-h-48 overflow-y-auto">
              <p className="font-semibold text-slate-300 mb-1">
                {this.state.error.name}: {this.state.error.message}
              </p>
              {this.state.errorInfo?.componentStack && (
                <p className="text-slate-500 whitespace-pre-wrap mt-2 text-[10px]">
                  {this.state.errorInfo.componentStack}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-600/30 active:scale-98 cursor-pointer"
            >
              <RotateCcw size={18} />
              <span>إعادة تشغيل التطبيق</span>
            </button>

            <button
              onClick={this.resetError}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium transition-colors cursor-pointer"
            >
              <Home size={18} />
              <span>محاولة الاستمرار</span>
            </button>

            <button
              onClick={this.handleCopy}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium transition-colors cursor-pointer"
              title="نسخ تفاصيل الخطأ للدعم الفني"
            >
              {this.state.copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              <span>{this.state.copied ? 'تم النسخ' : 'نسخ الخطأ'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
