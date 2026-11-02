import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Flashlight, Camera, Keyboard, AlertCircle, RefreshCw, ZoomIn, CheckCircle2 } from 'lucide-react';
import { playBeep, triggerHaptic } from '../utils/sound';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

/**
 * قارئ باركود وQR فائق القوة والسرعة للموبايل (Industrial-Grade Multi-Scale Scanner)
 *
 * المميزات الاحترافية:
 * 1. دعم Hardware Zoom (1x / 2x / 3x) لقراءة الباركودات الصغيرة (IMEI / أجهزة) من مسافة مريحة دون تشويش.
 * 2. معالجة صور فورية (Image Enhancement): رفع التباين (Contrast Boost) والحدة (Sharpen) للباركودات الباهتة أو على أسطح لامعة.
 * 3. فحص هجين فائق السرعة: مسح أصلي مباشر (BarcodeDetector على الفيديو مباشرة) + فحص دقيق للهدف (Multi-Scale ROI).
 * 4. دعم فك تشفير الباركود المعكوس (Inverted / White-on-Black) والصيغ الصناعية (Code 128, EAN-13, ITF, QR, etc).
 * 5. تنظيف دقيق للذاكرة والكاميرا لمنع أي تسريب أو ثقل بالتطبيق.
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
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [maxHardwareZoom, setMaxHardwareZoom] = useState<number>(1);
  const [isStarting, setIsStarting] = useState(false);
  const [scannedSuccess, setScannedSuccess] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const isScanningRef = useRef(false);
  const lastScanValueRef = useRef<{ value: string; at: number } | null>(null);

  // ماسح ZXing الاحتياطي
  const zxingReaderRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const enhancedCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
    canvasRef.current = null;
    enhancedCanvasRef.current = null;
    lastScanValueRef.current = null;
    setTorchEnabled(false);
    setHasTorch(false);
    setZoomLevel(1);
    setMaxHardwareZoom(1);
    setScannedSuccess(null);
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

    // منع تكرار نفس الكود خلال 1.5 ثانية
    const last = lastScanValueRef.current;
    if (last && last.value === clean && Date.now() - last.at < 1500) return;
    lastScanValueRef.current = { value: clean, at: Date.now() };

    isScanningRef.current = false;
    setScannedSuccess(clean);
    playBeep();
    triggerHaptic('medium');

    setTimeout(() => {
      onScan(clean);
      onClose();
    }, 350);
  };

  const applyZoom = async (level: number) => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const caps = (track as any).getCapabilities?.() || {};
      if (caps.zoom) {
        const targetZoom = Math.min(Math.max(level, caps.zoom.min || 1), caps.zoom.max || 1);
        await (track as any).applyConstraints({ advanced: [{ zoom: targetZoom }] });
      }
      setZoomLevel(level);
      triggerHaptic('light');
    } catch (e) {
      console.warn('[Camera] Failed to set hardware zoom:', e);
      setZoomLevel(level);
    }
  };

  const toggleZoom = () => {
    if (maxHardwareZoom > 1.5) {
      // 1x -> 2x -> 3x -> 1x
      const next = zoomLevel >= 3 ? 1 : zoomLevel === 1 ? 2 : 3;
      void applyZoom(next);
    } else {
      // سوفتوير زووم
      setZoomLevel(prev => (prev >= 2 ? 1 : 2));
      triggerHaptic('light');
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setIsStarting(true);
    setScannedSuccess(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('الكاميرا غير مدعومة على هذا الجهاز أو المتصفح');
      }

      // طلب أعلى دقة ممكنة لحدة أرقام الباركود وIMEI
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            // @ts-expect-error non-standard continuous autofocus
            focusMode: { ideal: 'continuous' },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
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
            setTimeout(resolve, 1500);
          });
          await video.play().catch(e => console.warn('[Camera] Retry play failed:', e));
        }
      }

      // فحص إمكانيات الكشاف والزووم
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = (track as any)?.getCapabilities?.() || {};
        setHasTorch(Boolean(capabilities.torch));

        if (capabilities.zoom && capabilities.zoom.max > 1) {
          setMaxHardwareZoom(capabilities.zoom.max);
          // إذا كان متاحاً، نبدأ بزووم 1.5x أو 2x تلقائياً للأجهزة لسهولة التقاط الباركود الصغير
          const defaultZoom = Math.min(2, capabilities.zoom.max);
          if (defaultZoom > 1) {
            void applyZoom(defaultZoom);
          }
        }

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
      zxing.BarcodeFormat.CODE_128,
      zxing.BarcodeFormat.EAN_13,
      zxing.BarcodeFormat.EAN_8,
      zxing.BarcodeFormat.UPC_A,
      zxing.BarcodeFormat.UPC_E,
      zxing.BarcodeFormat.CODE_39,
      zxing.BarcodeFormat.CODE_93,
      zxing.BarcodeFormat.ITF,
      zxing.BarcodeFormat.QR_CODE,
      zxing.BarcodeFormat.DATA_MATRIX,
      zxing.BarcodeFormat.CODABAR,
      zxing.BarcodeFormat.PDF_417,
      zxing.BarcodeFormat.AZTEC,
    ]);
    zxingReaderRef.current = new BrowserMultiFormatReader(hints as any, {
      delayBetweenScanAttempts: 40,
      delayBetweenScanSuccess: 500,
    });
    return zxingReaderRef.current;
  };

  /**
   * تحسين الصورة للباركودات الصعبة (Contrast Boost & Adaptive Binarization)
   */
  const enhanceImageContrast = (ctx: CanvasRenderingContext2D, width: number, height: number, invert = false) => {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      const len = d.length;

      // حساب متوسط الإضاءة لضبط العتبة التكيفية
      let sum = 0;
      for (let i = 0; i < len; i += 16) {
        sum += (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      }
      const avg = sum / (len / 16);
      const threshold = Math.min(Math.max(avg, 70), 180);

      // زيادة التباين وتحويل لأبيض وأسود عالي الحدة
      for (let i = 0; i < len; i += 4) {
        const gray = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
        let val = gray > threshold ? 255 : 0;
        if (invert) val = 255 - val;
        d[i] = val;
        d[i + 1] = val;
        d[i + 2] = val;
      }

      ctx.putImageData(imgData, 0, 0);
    } catch {
      // تجاهل إذا كانت بيئة Canvas مقيدة
    }
  };

  const runDetectionLoop = async () => {
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    let nativeDetector: any = null;

    if (BarcodeDetectorClass) {
      try {
        const desiredFormats = [
          'code_128', 'ean_13', 'ean_8', 'code_39', 'code_93',
          'upc_a', 'upc_e', 'itf', 'qr_code', 'data_matrix', 'codabar', 'pdf417', 'aztec',
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

    const canvas = document.createElement('canvas');
    const enhancedCanvas = document.createElement('canvas');
    canvasRef.current = canvas;
    enhancedCanvasRef.current = enhancedCanvas;

    let frameCount = 0;
    let isBusy = false;
    let lastScanTime = 0;

    const drawCrop = (
      targetCanvas: HTMLCanvasElement,
      video: HTMLVideoElement,
      scaleFactor = 1,
      applyEnhancement = false,
      invert = false
    ): boolean => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return false;

      // منطقة الهدف المحددة (مستطيل أفقي في المنتصف مخصص للباركود)
      // نسبة العرض 70% والارتفاع 45% لتركيز البكسلات على الكود
      const cropW = Math.round(vw * 0.70 / scaleFactor);
      const cropH = Math.round(vh * 0.45 / scaleFactor);
      const startX = Math.round((vw - cropW) / 2);
      const startY = Math.round((vh - cropH) / 2);

      // دقة مناسبة لفك التشفير بسرعة دون إرهاق المعالج (حدود 800-1000px)
      const targetW = Math.min(960, cropW);
      const targetH = Math.round(cropH * (targetW / cropW));

      if (targetCanvas.width !== targetW || targetCanvas.height !== targetH) {
        targetCanvas.width = targetW;
        targetCanvas.height = targetH;
      }

      const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(video, startX, startY, cropW, cropH, 0, 0, targetW, targetH);

      if (applyEnhancement) {
        enhanceImageContrast(ctx, targetW, targetH, invert);
      }

      return true;
    };

    const decodeSource = async (source: HTMLVideoElement | HTMLCanvasElement): Promise<string | null> => {
      if (nativeDetector) {
        try {
          const results = await nativeDetector.detect(source);
          const raw = results?.[0]?.rawValue;
          if (typeof raw === 'string' && raw.trim()) return raw.trim();
        } catch {
          // فريم غير مقروء
        }
        return null;
      }

      if (zxingReader && source instanceof HTMLCanvasElement) {
        try {
          const result = zxingReader.decodeFromCanvas(source);
          const text = result?.getText?.();
          if (typeof text === 'string' && text.trim()) return text.trim();
        } catch {
          // لم يتم التعرف في هذا الفريم
        }
      }
      return null;
    };

    const scanLoop = async () => {
      if (!isScanningRef.current) return;
      const video = videoRef.current;

      if (!video || video.readyState < 2 || isBusy) {
        rafRef.current = requestAnimationFrame(scanLoop);
        return;
      }

      const now = performance.now();
      // فترات مسح سريعة: 60ms للأصلي، 80ms لـ ZXing
      const minInterval = nativeDetector ? 60 : 80;
      if (now - lastScanTime < minInterval) {
        rafRef.current = requestAnimationFrame(scanLoop);
        return;
      }
      lastScanTime = now;
      isBusy = true;

      try {
        // خطوة 1: فحص الفيديو بالكامل عبر المعالج المدمج (Hardware native detector)
        if (nativeDetector) {
          const directCode = await decodeSource(video);
          if (directCode) {
            emitScan(directCode);
            isBusy = false;
            return;
          }
        }

        // خطوة 2: قص منطقة الهدف العريضة ودقتها العالية (Standard Cropped ROI)
        const softwareZoom = maxHardwareZoom > 1 ? 1 : zoomLevel;
        if (drawCrop(canvas, video, softwareZoom, false)) {
          const roiCode = await decodeSource(canvas);
          if (roiCode) {
            emitScan(roiCode);
            isBusy = false;
            return;
          }
        }

        // خطوة 3 (كل إطارين): فحص صورة معززة التباين للباركودات الصعبة أو الباهتة
        if (frameCount % 2 === 0) {
          const invert = frameCount % 4 === 0;
          if (drawCrop(enhancedCanvas, video, softwareZoom, true, invert)) {
            const enhancedCode = await decodeSource(enhancedCanvas);
            if (enhancedCode) {
              emitScan(enhancedCode);
              isBusy = false;
              return;
            }
          }
        }
      } catch (loopErr) {
        console.debug('[Scanner loop error]', loopErr);
      } finally {
        isBusy = false;
        frameCount++;
      }

      if (isScanningRef.current) {
        rafRef.current = requestAnimationFrame(scanLoop);
      }
    };

    rafRef.current = requestAnimationFrame(scanLoop);
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
            {/* زر الزووم الذكي 1x / 2x / 3x */}
            <button
              type="button"
              onClick={toggleZoom}
              className={`px-2.5 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1 transition ${
                zoomLevel > 1
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
              title="تكبير لقراءة الباركودات الصغيرة وIMEI"
            >
              <ZoomIn size={14} />
              <span>{zoomLevel}x</span>
            </button>

            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl transition ${
                  torchEnabled
                    ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.5)]'
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

          {/* Targeting Box with Dynamic Laser */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
            <div
              className={`relative w-64 h-36 rounded-2xl transition-all duration-300 overflow-hidden ${
                scannedSuccess
                  ? 'border-4 border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.8)] bg-emerald-500/10'
                  : 'border-2 border-cyan-400/80 shadow-[0_0_24px_rgba(6,182,212,0.4)]'
              }`}
            >
              {/* Corner Accents */}
              <span className="absolute -top-1 -left-1 w-5 h-5 border-t-3 border-l-3 border-white rounded-tl" />
              <span className="absolute -top-1 -right-1 w-5 h-5 border-t-3 border-r-3 border-white rounded-tr" />
              <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-3 border-l-3 border-white rounded-bl" />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-3 border-r-3 border-white rounded-br" />

              {/* Animated Laser Beam */}
              {!scannedSuccess && (
                <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#06b6d4] animate-pulse duration-700" />
              )}

              {/* Success Badge */}
              {scannedSuccess && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 animate-in zoom-in-95 duration-200">
                  <CheckCircle2 size={36} className="text-emerald-400" />
                  <span className="text-xs font-mono font-bold text-white mt-1 px-2 py-0.5 rounded bg-emerald-500/20">
                    {scannedSuccess}
                  </span>
                </div>
              )}
            </div>
          </div>

          {isStarting && !cameraError && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-cyan-300 bg-black/60 px-3 py-1 rounded-full">
              جاري تشغيل الكاميرا وتحسين العدسة...
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

        {/* Manual Input Form & Quick Hint */}
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

          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
            <span>💡 للباركودات الدقيقة أو IMEI اضغط زر <strong>2x / 3x</strong></span>
            <span className="text-cyan-400 font-mono">HD Scanner</span>
          </div>
        </div>
      </div>
    </div>
  );
};
