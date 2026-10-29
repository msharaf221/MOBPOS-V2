import React, { useState, useEffect, useRef } from 'react';
import { X, Flashlight, Camera, Keyboard, AlertCircle } from 'lucide-react';
import { playBeep, triggerHaptic } from '../utils/sound';
import type { IScannerControls } from '@zxing/browser';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isScanningRef = useRef(false);
  // 🔴 FIX: مرجع للتحكم في قارئ ZXing البديل (iOS WKWebView بلا BarcodeDetector)
  const zxingControlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setShowManualInput(false);
      setCameraError(null);
      setManualCode('');
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('الكاميرا غير مدعومة على هذا الجهاز أو المتصفح');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
        videoRef.current.autoplay = true;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('[Camera] Initial play failed, waiting for metadata:', playErr);
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.warn('[Camera] Retry play failed:', e));
          };
        }
      }

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      const capabilities = (track as any)?.getCapabilities?.() || {};
      if (capabilities.torch) {
        setHasTorch(true);
      }

      isScanningRef.current = true;
      runBarcodeDetection();
    } catch (err: any) {
      console.warn('[Camera] Failed to start stream:', err);
      setCameraError(err.message || 'تعذر فتح الكاميرا. يرجى التأكد من منح الصلاحيات.');
      setShowManualInput(true);
    }
  };

  const stopCamera = () => {
    isScanningRef.current = false;
    try {
      zxingControlsRef.current?.stop();
    } catch { /* ignore */ }
    zxingControlsRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const next = !torchEnabled;
      await (track as any).applyConstraints({
        advanced: [{ torch: next }],
      });
      setTorchEnabled(next);
      triggerHaptic('light');
    } catch (e) {
      console.warn('[Torch] Failed to toggle torch:', e);
    }
  };

  const runBarcodeDetection = async () => {
    // 1. Try Native BarcodeDetector if available and supported
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    let nativeDetectorWorked = false;

    if (BarcodeDetectorClass) {
      try {
        let desiredFormats = ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'];
        if (typeof BarcodeDetectorClass.getSupportedFormats === 'function') {
          const supported: string[] = await BarcodeDetectorClass.getSupportedFormats();
          desiredFormats = desiredFormats.filter(f => supported.includes(f));
        }

        if (desiredFormats.length > 0) {
          const detector = new BarcodeDetectorClass({ formats: desiredFormats });
          nativeDetectorWorked = true;

          const nativeLoop = async () => {
            if (!isScanningRef.current || !videoRef.current) return;

            if (videoRef.current.readyState >= 2) {
              try {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  const raw = barcodes[0].rawValue.trim();
                  if (raw && isScanningRef.current) {
                    playBeep();
                    triggerHaptic('medium');
                    onScan(raw);
                    onClose();
                    return;
                  }
                }
              } catch {
                // Ignore transient frame errors
              }
            }
            if (isScanningRef.current) {
              requestAnimationFrame(nativeLoop);
            }
          };

          requestAnimationFrame(nativeLoop);
          return;
        }
      } catch (e) {
        console.info('[BarcodeDetector] Not available or unsupported, using ZXing canvas engine:', e);
      }
    }

    // 2. High-reliability Canvas-based ZXing Engine (Android Webview & iOS WKWebView)
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      let lastScanTime = 0;
      const zxingLoop = () => {
        if (!isScanningRef.current) return;
        const video = videoRef.current;
        const now = performance.now();

        if (video && video.readyState >= 2 && now - lastScanTime > 140) {
          lastScanTime = now;
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
          }

          if (ctx && canvas.width > 0 && canvas.height > 0) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
              const result = reader.decodeFromCanvas(canvas);
              if (result && result.getText()) {
                const raw = result.getText().trim();
                if (raw && isScanningRef.current) {
                  playBeep();
                  triggerHaptic('medium');
                  onScan(raw);
                  onClose();
                  return;
                }
              }
            } catch {
              // Expected when no barcode is visible in frame
            }
          }
        }

        if (isScanningRef.current) {
          requestAnimationFrame(zxingLoop);
        }
      };

      requestAnimationFrame(zxingLoop);
    } catch (zxingErr) {
      console.warn('[ZXing] Fallback scanner failed, enabling manual input:', zxingErr);
      setShowManualInput(true);
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
                  torchEnabled ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-300 hover:text-white'
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
                showManualInput ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-300 hover:text-white'
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
            <div className="relative w-48 h-36 border-2 border-cyan-400/80 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.4)] overflow-hidden">
              {/* Corner accents */}
              <span className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-white rounded-tl" />
              <span className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-white rounded-tr" />
              <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-white rounded-bl" />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-white rounded-br" />

              {/* Animated laser scanline */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_8px_#06b6d4] animate-bounce duration-1000" />
            </div>
          </div>

          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/90 p-4 flex flex-col items-center justify-center text-center space-y-2">
              <AlertCircle size={32} className="text-amber-400" />
              <p className="text-xs text-slate-300 font-medium">{cameraError}</p>
              <p className="text-[11px] text-cyan-400">استخدم الإدخال اليدوي أو قارئ الباركود الخارجي بالأسفل</p>
            </div>
          )}
        </div>

        {/* Manual Input Form */}
        <div className="p-4 bg-slate-950/90 border-t border-white/[0.08] space-y-2.5">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="اكتب الباركود أو السيريال يدوياً..."
              autoFocus
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
            وجّه الكاميرا نحو باركود الصنف أو سيريال الجهاز وسيلتقطه النظام تلقائياً
          </p>
        </div>
      </div>
    </div>
  );
};
