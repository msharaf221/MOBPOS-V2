// ============================================================
//  بصمة الجهاز v3 — Device Fingerprint
//  تُستخدم لربط الترخيص بالجهاز الذي تم التفعيل عليه.
//
//  بدلاً من الاعتماد على هاش صارم واحد يتغير بالكامل عند تغير إشارة
//  متذبذبة (تعريف كرت الشاشة، دقة الشاشة، User-Agent...)، نحفظ مجموعة
//  إشارات مستقلة ونقبل الجهاز عند تحقق أغلبية مستقرة (4 من 6 على الأقل).
//  في Electron نفضّل معرف نظام التشغيل الثابت (machine-id / UUID) عبر
//  preload IPC لأنه أكثر ثباتاً من بصمات Canvas/WebGL.
// ============================================================

import { sha256Hex } from './crypto';

export const DEVICE_FINGERPRINT_VERSION = 3;
export const DEVICE_MATCH_THRESHOLD = 4;

export interface DeviceFingerprintSignal {
  key: string;
  value: string;
  stable: boolean;
}

export interface DeviceFingerprint {
  version: typeof DEVICE_FINGERPRINT_VERSION;
  signals: DeviceFingerprintSignal[];
  hash: string;
}

export interface DeviceMatchResult {
  matches: boolean;
  matchedSignals: number;
  totalSignals: number;
  threshold: number;
  currentHash: string;
}

let cachedFingerprint: DeviceFingerprint | null = null;
let cachedDeviceId: string | null = null;

function normalizeSignal(value: unknown): string {
  return String(value ?? '').trim().toLowerCase() || 'unknown';
}

async function stableMachineId(): Promise<string> {
  try {
    const bridge = window.mobpos;
    if (!bridge?.isDesktop || !bridge.getStableMachineId) return 'not-electron';
    const id = await bridge.getStableMachineId();
    return id ? `machine:${normalizeSignal(id)}` : 'no-machine-id';
  } catch {
    return 'machine-id-error';
  }
}

/** Canvas fingerprint — hashed to a fixed-size value. */
async function canvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';

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

    return 'cv:' + (await sha256Hex(canvas.toDataURL()));
  } catch {
    return 'canvas-error';
  }
}

/** WebGL fingerprint — graphics hardware/driver capabilities. */
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

    // Deliberately omit gl.VERSION and full extension names from the matching
    // signal: they are highly driver/browser-version sensitive. The capability
    // counts and renderer/vendor provide enough entropy while tolerating updates.
    const extensionCount = (gl.getSupportedExtensions() || []).length;

    return `gl:${normalizeSignal(vendor)}|${normalizeSignal(renderer)}|${params}|${viewport}|ext:${extensionCount}`;
  } catch {
    return 'webgl-error';
  }
}

/** Audio engine fingerprint with timeout so it never blocks startup. */
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

      const timer = window.setTimeout(() => done('audio-timeout'), 3000);
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

function screenBucket(): string {
  try {
    // Bucket the resolution in coarse 200px steps so plugging in a slightly
    // different monitor does not invalidate the fingerprint by itself.
    const width = Math.round((screen.width || 0) / 200) * 200;
    const height = Math.round((screen.height || 0) / 200) * 200;
    return `${width}x${height}|d${screen.colorDepth || 0}`;
  } catch {
    return 'screen-error';
  }
}

function browserFamily(): string {
  const ua = navigator.userAgent || '';
  const family = /edg\//i.test(ua)
    ? 'edge'
    : /opr\//i.test(ua)
      ? 'opera'
      : /firefox\//i.test(ua)
        ? 'firefox'
        : /chrome\//i.test(ua)
          ? 'chromium'
          : /safari\//i.test(ua)
            ? 'safari'
            : 'unknown-browser';
  const platform = navigator.platform || 'unknown-platform';
  return `${family}|${platform}`;
}

async function collectDeviceFingerprint(): Promise<DeviceFingerprint> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const [machineId, canvas, audio] = await Promise.all([
    stableMachineId(),
    canvasFingerprint(),
    audioFingerprint(),
  ]);

  const signals: DeviceFingerprintSignal[] = [
    { key: 'machine', value: machineId, stable: machineId.startsWith('machine:') },
    { key: 'platform', value: normalizeSignal(`${browserFamily()}|${navigator.language || ''}|${Intl.DateTimeFormat().resolvedOptions().timeZone || ''}`), stable: true },
    { key: 'cpu-memory', value: normalizeSignal(`${navigator.hardwareConcurrency || 0}|${nav.deviceMemory || 0}|${navigator.maxTouchPoints || 0}`), stable: true },
    { key: 'screen', value: normalizeSignal(screenBucket()), stable: false },
    { key: 'graphics', value: webglFingerprint(), stable: false },
    { key: 'canvas-audio', value: `${canvas}|${audio}`, stable: false },
  ];

  const hashInput = signals.map(signal => `${signal.key}=${signal.value}`).join('||');
  const hash = await sha256Hex(hashInput);
  return { version: DEVICE_FINGERPRINT_VERSION, signals, hash };
}

/** Returns the full fuzzy fingerprint used for new activations. */
export async function getDeviceFingerprint(): Promise<DeviceFingerprint> {
  if (cachedFingerprint) return cachedFingerprint;
  cachedFingerprint = await collectDeviceFingerprint();
  return cachedFingerprint;
}

/**
 * Compute (and cache) a stable device id like "DEV-3fa9c1b2e8d04a71".
 * This remains as the server-facing identifier for compatibility.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const fingerprint = await getDeviceFingerprint();
    cachedDeviceId = 'DEV-' + fingerprint.hash.slice(0, 16);
  } catch {
    let fallback = localStorage.getItem('msp_device_id_fallback');
    if (!fallback) {
      fallback = 'DEV-F-' + Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
      localStorage.setItem('msp_device_id_fallback', fallback);
    }
    cachedDeviceId = fallback;
  }
  return cachedDeviceId;
}

function isDeviceFingerprint(value: unknown): value is DeviceFingerprint {
  const candidate = value as DeviceFingerprint;
  return !!candidate && Array.isArray(candidate.signals) && typeof candidate.hash === 'string';
}

/** Compare the current fingerprint against a stored one using majority matching. */
export async function matchCurrentDeviceFingerprint(stored: unknown): Promise<DeviceMatchResult> {
  const current = await getDeviceFingerprint();
  const storedFingerprint = isDeviceFingerprint(stored) ? stored : null;

  if (!storedFingerprint) {
    return {
      matches: false,
      matchedSignals: 0,
      totalSignals: current.signals.length,
      threshold: DEVICE_MATCH_THRESHOLD,
      currentHash: current.hash,
    };
  }

  const currentByKey = new Map(current.signals.map(signal => [signal.key, signal.value]));
  let matchedSignals = 0;
  for (const signal of storedFingerprint.signals) {
    if (currentByKey.get(signal.key) === signal.value) matchedSignals++;
  }

  // Exact hash match remains a fast success path, but no longer the only path.
  const matches = storedFingerprint.hash === current.hash || matchedSignals >= DEVICE_MATCH_THRESHOLD;
  return {
    matches,
    matchedSignals,
    totalSignals: storedFingerprint.signals.length,
    threshold: DEVICE_MATCH_THRESHOLD,
    currentHash: current.hash,
  };
}
