// ============================================================
//  بصمة الجهاز v2 — Device Fingerprint
//  تُستخدم لربط الترخيص بالجهاز الذي تم التفعيل عليه.
//  البصمة محسوبة من خصائص ثابتة نسبياً في الجهاز/المتصفح،
//  وليست رقماً عشوائياً محفوظاً (فلا يفيدها مسح بيانات المتصفح).
//
//  الجديد في v2 — إشارات أقوى وأكثر تمايزاً:
//   • Canvas محسّن: رسم أغنى (تدرّجات + خطوط + نطوط متعددة)
//     والمخرجات تُجزّأ بـ SHA-256 (حجم ثابت + ثبات أعلى)
//   • WebGL: كرت الشاشة والتعريفات والإمكانيات
//   • Audio Context: بصمة محرك الصوت
//   • + كل الإشارات القديمة (UA، الشاشة، اللغة، المنطقة الزمنية…)
// ============================================================

import { sha256Hex } from './crypto';

let cachedDeviceId: string | null = null;

/** Canvas fingerprint — رسم أغنى، والمخرجات تُجزّأ لقيمة ثابتة الحجم. */
async function canvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';

    // تدرّج لوني + نصوص بنطوط مختلفة + أشكال هندسية —
    // أي اختلاف بسيط في محرك الرسم/التعريفات ينعكس على الناتج
    const grad = ctx.createLinearGradient(0, 0, 300, 80);
    grad.addColorStop(0, '#f60');
    grad.addColorStop(1, '#069');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 300, 80);

    ctx.textBaseline = 'top';
    ctx.font = '17px "Arial"';
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('MOBPOS-📱-بصمة-جهاز@2026#,;OEl', 2, 6);
    ctx.font = '13px "Times New Roman"';
    ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
    ctx.fillText('MOBPOS-📱-بصمة-جهاز@2026#,;OEl', 4, 30);

    ctx.strokeStyle = 'rgba(120, 186, 176, 0.9)';
    ctx.beginPath();
    ctx.arc(60, 58, 18, 0, Math.PI * 2, true);
    ctx.stroke();

    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    ctx.ellipse(210, 50, 45, 14, Math.PI / 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    // التجزئة: حجم ثابت + أقل حساسية لفروق الترميز الدقيقة بين المتصفحات
    return 'cv:' + (await sha256Hex(canvas.toDataURL()));
  } catch {
    return 'canvas-error';
  }
}

/** WebGL fingerprint — كرت الشاشة والتعريفات والإمكانيات. */
function webglFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'no-webgl';

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = String(
      dbg ? gl.getParameter((dbg as WEBGL_debug_renderer_info).UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
    );
    const renderer = String(
      dbg ? gl.getParameter((dbg as WEBGL_debug_renderer_info).UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    );
    const version = String(gl.getParameter(gl.VERSION));

    const params = [
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      gl.getParameter(gl.MAX_VARYING_VECTORS),
      gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    ]
      .map(String)
      .join(',');

    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | null;
    const viewport = maxViewport ? Array.from(maxViewport).join('x') : '';

    const exts = (gl.getSupportedExtensions() || []).join(',');

    return `gl:${vendor}|${renderer}|${version}|${params}|${viewport}|${exts.length}:${exts}`;
  } catch {
    return 'webgl-error';
  }
}

/**
 * Audio fingerprint — بصمة محرك الصوت عبر OfflineAudioContext:
 * مذبذب + ضاغط ديناميكي، والفروق بين المحركات تظهر في العينات الناتجة.
 * تعمل بخلفية آمنة مع مهلة زمنية (لا تعطّل حساب البصمة أبداً).
 */
function audioFingerprint(): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: string) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    try {
      const Ctor = window as unknown as {
        OfflineAudioContext?: typeof OfflineAudioContext;
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
      };
      const OfflineAC = Ctor.OfflineAudioContext || Ctor.webkitOfflineAudioContext;
      if (!OfflineAC) return done('no-audio');

      const ctx = new OfflineAC(1, 4410, 44100);

      const oscillator = ctx.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 10000;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value = 40;
      compressor.ratio.value = 12;
      compressor.attack.value = 0;
      compressor.release.value = 0.25;

      oscillator.connect(compressor);
      compressor.connect(ctx.destination);
      oscillator.start(0);

      const timer = setTimeout(() => done('audio-timeout'), 3000);
      ctx
        .startRendering()
        .then((buffer) => {
          clearTimeout(timer);
          const samples = buffer.getChannelData(0);
          let sum = 0;
          for (let i = 4500; i < 5000; i++) sum += Math.abs(samples[i]);
          done('au:' + sum.toFixed(8));
        })
        .catch(() => {
          clearTimeout(timer);
          done('audio-error');
        });
    } catch {
      done('audio-error');
    }
  });
}

/** جمع كل الإشارات — أصبحت async بسبب بصمة الصوت. */
async function collectSignals(): Promise<string> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const [canvas, audio] = await Promise.all([
    canvasFingerprint(),
    audioFingerprint(),
  ]);

  const signals = [
    navigator.userAgent || '',
    navigator.language || '',
    (navigator.languages || []).join(','),
    nav.platform || '',
    String(navigator.hardwareConcurrency || 0),
    String(nav.deviceMemory || 0),
    String(screen.width) + 'x' + String(screen.height),
    String(screen.colorDepth || 0),
    String(new Date().getTimezoneOffset()),
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    String(navigator.maxTouchPoints || 0),
    canvas,
    webglFingerprint(),
    audio,
  ];
  return signals.join('||');
}

/**
 * Compute (and cache) a stable device id like "DEV-3fa9c1b2e8d04a71".
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const hash = await sha256Hex(await collectSignals());
    cachedDeviceId = 'DEV-' + hash.slice(0, 16);
  } catch {
    // Fallback: random-but-persisted id
    let fallback = localStorage.getItem('msp_device_id_fallback');
    if (!fallback) {
      fallback = 'DEV-F-' + Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
      localStorage.setItem('msp_device_id_fallback', fallback);
    }
    cachedDeviceId = fallback;
  }
  return cachedDeviceId;
}
