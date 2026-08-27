import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { isDesktop } from '../utils/print';

// ============================================================
//  شريط العنوان المخصص (داخل تطبيق سطح المكتب فقط)
//  النافذة نفسها frameless — المنطقة دي بتتحرك بالسحب،
//  ودبل-كليك للتكبير، وأزرار تشغيل النافذة عبر IPC.
// ============================================================

const desktop = isDesktop();

export default function TitleBar({ shopName, shopLogo }: { shopName: string; shopLogo?: string }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    let mounted = true;
    window.mobpos?.getWindowState?.().then((s) => {
      if (mounted) setMaximized(!!s.maximized);
    }).catch(() => undefined);
    const off = window.mobpos?.onWindowState?.((s) => setMaximized(!!s.maximized));
    return () => {
      mounted = false;
      off?.();
    };
  }, []);

  if (!desktop) return null;

  const control = (action: 'minimize' | 'maximize-toggle' | 'close') => {
    void window.mobpos?.windowControl?.(action);
  };

  return (
    <div
      className="app-drag shrink-0 h-[38px] flex items-stretch justify-between bg-gradient-to-l from-[#0c1f4d] via-[#122a63] to-[#0c1f4d] text-white select-none border-b border-white/10"
      onDoubleClick={(e) => {
        const el = e.target as HTMLElement;
        if (el.closest('.app-nodrag')) return;
        control('maximize-toggle');
      }}
    >
      {/* أزرار النافذة — في أقصى طرف الشريط (زي ويندوز العربي: شمال) */}
      <div className="app-nodrag flex items-stretch order-last">
        <button
          onClick={() => control('minimize')}
          className="w-12 flex items-center justify-center hover:bg-white/15 transition"
          title="تصغير"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => control('maximize-toggle')}
          className="w-12 flex items-center justify-center hover:bg-white/15 transition"
          title={maximized ? 'استعادة' : 'تكبير'}
        >
          {maximized ? <Copy size={13} style={{ transform: 'scaleX(-1)' }} /> : <Square size={13} />}
        </button>
        <button
          onClick={() => control('close')}
          className="w-12 flex items-center justify-center hover:bg-red-600 transition rounded-tl-none"
          title="إغلاق"
        >
          <X size={18} />
        </button>
      </div>

      {/* اسم التطبيق والمحل */}
      <div className="flex items-center gap-2 px-3 min-w-0">
        {shopLogo ? (
          <img src={shopLogo} alt={shopName} className="w-5 h-5 rounded-md object-cover shadow shrink-0" />
        ) : (
          <span className="w-5 h-5 rounded-md bg-gradient-to-br from-[var(--accent,#3b82f6)] to-blue-700 flex items-center justify-center text-[11px] font-bold shadow">M</span>
        )}
        <span className="text-[13px] font-bold tracking-wide truncate">
          MOBPOS
          <span className="text-blue-300/80 font-normal"> — {shopName}</span>
        </span>
      </div>
    </div>
  );
}
