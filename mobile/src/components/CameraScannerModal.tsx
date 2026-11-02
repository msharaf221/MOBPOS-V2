import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Flashlight, Camera, Keyboard, AlertCircle, RefreshCw } from 'lucide-react';
import { playBeep, triggerHaptic } from '../utils/sound';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

/**
 * قارئ باركود/QR قوي للموبايل.
 *
 * 🔴 إعادة كتابة كاملة:
 * - كان بيمسح الفريم كله بدقة منخفضة → الباركود الصغير أو البعيد ما بيتقريش.
 * - بقى بيقصّ منطقة الهدف (ROI) من منتصف الكادر ويكبّرها قبل فك التشفير.
 * - بيستخدم BarcodeDetector الأصلي لو متاح، وإلا ZXing بـtryHarder + كل الصيغ.
 * - بيعمل محاولتين: ROI المكبّر، وبعدها الفريم الكامل كل عدة إطارات.
 * - تنظيف كامل للكاميرا والـRAF عند الإغلاق لمنع تسريب الذاكرة.
 */
export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'مسح باركود الصنف / السيريال',
}) => {
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const isScanningRef = useRef(false);
  const lastScanValueRef = useRef<{ value: string; at: number } | null>(null);

  // ماسح ZXing البديل (iOS WKWebView بلا BarcodeDetector)
  const zxingReaderRef = useRef<any>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopCamera = useCallback(() => {
    isScanningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.onloadedmetadata = null;
    }
    zxingReaderRef.current = null;
    roiCanvasRef.current = null;
    fullCanvasRef.current = null;
    lastScanValueRef.current = null;
    setTorchEnabled(false);
    setHasTorch(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setShowManualInput(false);
      setCameraError(null);
      setManualCode('');
      setIsStarting(false);
      return;
    }

    void startCamera();

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const emitScan = (rawValue: string) => {
    const clean = rawValue.trim();
    if (!clean || !isScanningRef.current) return;

    // منع تكرار نفس الكود في نفس اللحظة (بعض الأجهزة بتقرأ نفس الفريم مرتين)
    const last = lastScanValueRef.current;
    if (last && last.value === clean && Date.now() - last.at < 1200) return;
    lastScanValueRef.current = { value: clean, at: Date.now() };

    isScanningRef.current = false;
    playBeep();
    triggerHaptic('medium');
    onScan(clean);
    onClose();
  };

  const startCamera = async () => {
    setCameraError(null);
    setIsStarting(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('الكاميرا غير مدعومة على هذا الجهاز أو المتصفح');
      }

      // نطلب أعلى دقة ممكنة — دقة أعلى = باركود أوضح
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            // @ts-expect-error خاصية غير قياسية في بعض المتصفحات
            focusMode: { ideal: 'continuous' },
          },
          audio: false,
        });
      } catch {
        // بعض الأجهزة بترفض 1920 — نرجع لأقل
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.srcObject = stream;
        try {
          await video.play();
        } catch (playErr) {
          console.warn('[Camera] Initial play failed, waiting for metadata:', playErr);
          await new Promise<void>(resolve => {
            video.onloadedmetadata = () => resolve();
            // لا نعلّق للأبد لو الحدث مش جاي
            setTimeout(resolve, 1500);
          });
          await video.play().catch(e => console.warn('[Camera] Retry play failed:', e));
        }
      }

      // كشاف + محاولة تفعيل التركيز المستمر
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = (track as any)?.getCapabilities?.() || {};
        setHasTorch(Boolean(capabilities.torch));
        if (capabilities.focusMode?.includes?.('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
        }
      }

      isScanningRef.current = true;
      setIsStarting(false);
      runDetectionLoop();
    } catch (err: any) {
      console.warn('[Camera] Failed to start stream:', err);
      setIsStarting(false);
      setCameraError(err?.message || 'تعذر فتح الكاميرا. يرجى التأكد من منح الصلاحيات.');
      setShowManualInput(true);
    }
  };

  const importZXing = async () => {
    if (zxingReaderRef.current) return zxingReaderRef.current;
    const [{ BrowserMultiFormatReader }, zxing] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    const hints = new Map<number, unknown>();
    hints.set(zxing.DecodeHintType.TRY_HARDER, true);
    hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
      zxing.BarcodeFormat.QR_CODE,
      zxing.BarcodeFormat.EAN_13,
      zxing.BarcodeFormat.EAN_8,
      zxing.BarcodeFormat.UPC_A,
      zxing.BarcodeFormat.UPC_E,
      zxing.BarcodeFormat.CODE_128,
      zxing.BarcodeFormat.CODE_39,
      zxing.BarcodeFormat.CODE_93,
      zxing.BarcodeFormat.ITF,
      zxing.BarcodeFormat.CODABAR,
      zxing.BarcodeFormat.DATA_MATRIX,
      zxing.BarcodeFormat.PDF_417,
      zxing.BarcodeFormat.AZTEC,
    ]);
    zxingReaderRef.current = new BrowserMultiFormatReader(hints as any, {
      delayBetweenScanAttempts: 80,
      delayBetweenScanSuccess: 500,
    });
    return zxingReaderRef.current;
  };

  const runDetectionLoop = async () => {
    // ماسح أصلي سريع لو متاح
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    let nativeDetector: any = null;

    if (BarcodeDetectorClass) {
      try {
        const desiredFormats = [
          'qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93',
          'upc_a', 'upc_e', 'itf', 'codabar', 'data_matrix', 'pdf417', 'aztec',
        ];
        let supported: string[] = desiredFormats;
        if (typeof BarcodeDetectorClass.getSupportedFormats === 'function') {
          supported = await BarcodeDetectorClass.getSupportedFormats();
        }
        const usable = desiredFormats.filter(f => supported.includes(f));
        if (usable.length > 0) {
          nativeDetector = new BarcodeDetectorClass({ formats: usable });
        }
      } catch (e) {
        console.info('[BarcodeDetector] Unavailable, using ZXing:', e);
      }
    }

    let zxingReader: any = null;
    if (!nativeDetector) {
      try {
        zxingReader = await importZXing();
      } catch (zxingErr) {
        console.warn('[ZXing] Failed to load scanner:', zxingErr);
        setShowManualInput(true);
        return;
      }
    }

    const roiCanvas = document.createElement('canvas');
    const fullCanvas = document.createElement('canvas');
    roiCanvasRef.current = roiCanvas;
    fullCanvasRef.current = fullCanvas;

    let frame = 0;
    let busy = false;
    let lastFrameAt = 0;

    const drawRegion = (
      canvas: HTMLCanvasElement,
      video: HTMLVideoElement,
      ratio: number,
      targetMax = 1000
    ) => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return false;

      const sw = Math.max(1, Math.round(vw * ratio));
      const sh = Math.max(1, Math.round(vh * ratio));
      const sx = Math.round((vw - sw) / 2);
      const sy = Math.round((vh - sh) / 2);

      // نكبّر المنطقة الصغيرة لدقة أفضل في فك التشفير
      const scale = Math.min(3, targetMax / Math.max(sw, sh));
      const cw = Math.max(1, Math.round(sw * scale));
      const ch = Math.max(1, Math.round(sh * scale));

      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
      return true;
    };

    const tryDecode = async (canvas: HTMLCanvasElement): Promise<string | null> => {
      if (nativeDetector) {
        try {
          const results = await nativeDetector.detect(canvas);
          const raw = results?.[0]?.rawValue;
          if (typeof raw === 'string' && raw.trim()) return raw.trim();
        } catch {
          // فريم مش واضح — نكمل
        }
        return null;
      }

      try {
        const result = zxingReader.decodeFromCanvas(canvas);
        const text = result?.getText?.();
        if (typeof text === 'string' && text.trim()) return text.trim();
      } catch {
        // متوقع لما مفيش باركود في الكادر
      }
      return null;
    };

    const loop = async () => {
      if (!isScanningRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || busy) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const now = performance.now();
      const interval = nativeDetector ? 90 : 120;
      if (now - lastFrameAt < interval) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrameAt = now;
      busy = true;

      try {
        // المحاولة الأولى: منطقة الهدف المكبّرة (أسرع وأدق للباركود القريب)
        if (drawRegion(roiCanvas, video, 0.62, 900)) {
          const roiResult = await tryDecode(roiCanvas);
          if (roiResult) {
            emitScan(roiResult);
            busy = false;
            return;
          }
        }

        // كل 3 فريمات: الفريم الكامل (للباركود البعيد أو QR كبير)
        if (frame % 3 === 0 && isScanningRef.current) {
          if (drawRegion(fullCanvas, video, 1, 1200)) {
            const fullResult = await tryDecode(fullCanvas);
            if (fullResult) {
              emitScan(fullResult);
              busy = false;
              return;
            }
          }
        }
      } finally {
        busy = false;
        frame += 1;
      }

      if (isScanningRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const next = !torchEnabled;
      await (track as any).applyConstraints({ advanced: [{ torch: next }] });
      setTorchEnabled(next);
      triggerHaptic('light');
    } catch (e) {
      console.warn('[Torch] Failed to toggle torch:', e);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim();
    if (!clean) return;
    playBeep();
    triggerHaptic('medium');
    onScan(clean);
    onClose();
  };

  const retryCamera = () => {
    stopCamera();
    setCameraError(null);
    void startCamera();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-750 rounded-3xl overflow-hidden shadow-2xl flex flex-col relative">
        {/* Top Header */}
        <div className="px-4 py-3 bg-slate-950/80 border-b border-white/[0.08] flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-400/30">
              <Camera size={16} />
            </div>
            <span className="text-xs font-bold">{title}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl transition ${
                  torchEnabled
                    ? 'bg-amber-500 text-black'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title="كشاف الكاميرا"
              >
                <Flashlight size={16} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className={`p-2 rounded-xl transition ${
                showManualInput
                  ? 'bg-cyan-500 text-black'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
              title="إدخال يدوي"
            >
              <Keyboard size={16} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Viewfinder / Video Canvas */}
        <div className="relative aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="w-full h-full object-cover"
          />

          {/* Targeting Box */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
            <div className="relative w-56 h-36 border-2 border-cyan-400/80 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.4)] overflow-hidden">
              {/* Corner accents */}
              <span className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-white rounded-tl" />
              <span className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-white rounded-tr" />
              <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-white rounded-bl" />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-white rounded-br" />

              {/* Animated laser scanline */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_8px_#06b6d4] animate-bounce duration-1000" />
            </div>
          </div>

          {isStarting && !cameraError && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-cyan-300 bg-black/60 px-3 py-1 rounded-full">
              جاري تشغيل الكاميرا...
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/90 p-4 flex flex-col items-center justify-center text-center space-y-2">
              <AlertCircle size={32} className="text-amber-400" />
              <p className="text-xs text-slate-300 font-medium">{cameraError}</p>
              <button
                type="button"
                onClick={retryCamera}
                className="mt-1 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-[11px] active:scale-95"
              >
                <RefreshCw size={13} />
                <span>إعادة المحاولة</span>
              </button>
              <p className="text-[10px] text-slate-400">أو استخدم الإدخال اليدوي بالأسفل</p>
            </div>
          )}
        </div>

        {/* Manual Input Form */}
        <div className="p-4 bg-slate-950/90 border-t border-white/[0.08] space-y-2.5">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="اكتب الباركود أو السيريال يدوياً..."
              className="flex-1 px-3 py-2.5 rounded-xl bg-slate-900 border border-white/[0.1] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono text-center tracking-wider"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition active:scale-95"
            >
              تأكيد
            </button>
          </form>

          <p className="text-[10px] text-slate-400 text-center">
            قرّب الباركود جوه الإطار الأخضر — القارئ بيكبّر المنطقة تلقائياً
          </p>
        </div>
      </div>
    </div>
  );
};
