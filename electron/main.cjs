// ============================================================
//  MOBPOS — Desktop App (Electron Main Process)
//
//  لماذا سيرفر محلي بدل فتح الملف مباشرة؟
//  1) Google OAuth (النسخ لجوجل) يحتاج أصل ويب حقيقي http://...
//  2) IndexedDB و crypto.subtle يعملان بشكل مضمون على أصل ثابت
//  3) بصمة الجهاز والترخيص تبقى ثابتة بين كل عمليات التشغيل
//
//  مميزات إضافية:
//  - نافذة frameless بشريط عنوان مخصص — إحساس تطبيق حقيقي
//  - وضع الكيوسك:  MOBPOS.exe --kiosk
//  - طباعة حرارية صامتة بدون نافذة الطباعة (ESC/POS عبر الطابعة الافتراضية)
//  - حفظ PDF حقيقي للتقارير عبر نافذة مخفية + printToPDF
//  - تحديث تلقائي عبر electron-updater
// ============================================================

const { app, BrowserWindow, Menu, shell, session, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { startServer, PREFERRED_PORT } = require('./local-server.cjs');

const isKiosk = process.argv.includes('--kiosk');
const isDev = !app.isPackaged && process.env.MOBPOS_ELECTRON_DEV === '1';
const devServerUrl = process.env.MOBPOS_ELECTRON_DEV_SERVER_URL || `http://127.0.0.1:${PREFERRED_PORT}`;

let mainWindow = null;
let serverInfo = null;
let appUrl = '';
let appOrigin = '';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com https://www.googleapis.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self' http://127.0.0.1:8420 ws://127.0.0.1:8420 https://mobpos.onrender.com https://accounts.google.com https://www.googleapis.com https://*.googleapis.com https://*.supabase.co wss://*.supabase.co",
  "frame-src 'self' https://accounts.google.com",
].join('; ');

// ===== Auto-update =====
function setupAutoUpdate() {
  try {
    // electron-updater متاح فقط في النسخة المثبتة (وليس أثناء التطوير)
    if (!app.isPackaged) return;
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (e) => console.error('[updater]', e?.message || e));
    // افحص بعد 5 ثوانٍ من التشغيل، ثم كل 6 ساعات
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error('[updater check failed]', e?.message || e)), 5000);
    setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error('[updater check failed]', e?.message || e)), 6 * 60 * 60 * 1000);
  } catch (err) {
    // التحديث التلقائي اختياري — لا يكسر التطبيق
    console.error('[updater setup failed]', err?.message || err);
  }
}

function setupCspHeaders() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    let appliesToApp = false;
    try {
      const origin = new URL(details.url).origin;
      appliesToApp = origin === appOrigin || origin === `http://127.0.0.1:${PREFERRED_PORT}`;
    } catch {
      appliesToApp = details.url.startsWith('file://');
    }

    if (!appliesToApp) return callback({ responseHeaders: details.responseHeaders });

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    });
  });
}

function hashMachineId(value) {
  return crypto.createHash('sha256').update(`mobpos-machine-id::${value}`).digest('hex').slice(0, 32);
}

function readStableMachineId() {
  try {
    let raw = '';
    if (process.platform === 'win32') {
      raw = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      raw = (raw.match(/MachineGuid\s+REG_\w+\s+([^\r\n]+)/i) || [])[1] || raw;
    } else if (process.platform === 'darwin') {
      raw = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' });
      raw = (raw.match(/"IOPlatformUUID"\s=\s"([^"]+)"/) || [])[1] || raw;
    } else {
      for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        if (fs.existsSync(file)) {
          raw = fs.readFileSync(file, 'utf8');
          break;
        }
      }
    }

    raw = String(raw || '').trim();
    return raw ? hashMachineId(`${process.platform}:${raw}`) : null;
  } catch (err) {
    console.error('[machine-id]', err?.message || err);
    return null;
  }
}

// ===== Hidden HTML renderer (print / PDF) =====
/**
 * يحمّل HTML كامل في نافذة مخفية مستقلة ثم يطبعه أو يحوّله PDF.
 * الملف بيتحط في مجلد temp عشان:
 *  - مفيش حد أقصى لحجم التقرير (على عكس data: URLs)
 *  - الخطوط المضمّنة base64 تتحمّل طبيعي
 * النافذة ممنوع منها التنقل أو فتح أي شيء.
 */
function withReportWindow(html, job) {
  if (typeof html !== 'string' || html.length > 20 * 1024 * 1024) return Promise.resolve(false);
  return new Promise((resolve) => {
    let reportDir = null;
    let tmpFile = null;
    let fallbackTimer = null;
    let settled = false;
    const cleanup = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (tmpFile) fs.unlink(tmpFile, () => undefined);
      if (reportDir) fs.rm(reportDir, { recursive: true, force: true }, () => undefined);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    let win = null;
    try {
      // mkdtemp creates a private directory (0700 on supported platforms),
      // avoiding predictable temp-file/symlink races for report HTML.
      reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobpos-report-'));
      tmpFile = path.join(reportDir, 'report.html');
      fs.writeFileSync(tmpFile, html, { encoding: 'utf8', mode: 0o600, flag: 'wx' });

      win = new BrowserWindow({
        show: false,
        width: 1024,
        height: 768,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          spellcheck: false,
        },
      });
      win.setMenu(null);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (e) => e.preventDefault());

      win.webContents.on('did-finish-load', async () => {
        try {
          // استنى الخطوط المضمّنة تجهز قبل الطباعة وإلا يطلع الـ PDF بخط احتياطي
          await win.webContents.executeJavaScript(
            'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : Promise.resolve(true)'
          );
          finish(await job(win));
        } catch (err) {
          console.error('[report window job failed]', err);
          finish(false);
        } finally {
          if (win && !win.isDestroyed()) win.destroy();
        }
      });

      win.webContents.on('render-process-gone', () => {
        if (win && !win.isDestroyed()) win.destroy();
        finish(false);
      });

      win.loadFile(tmpFile);
    } catch (err) {
      console.error('[report window setup failed]', err);
      if (win && !win.isDestroyed()) win.destroy();
      finish(false);
    }

    // حماية: لو علق لأي سبب، اقفل بعد دقيقة
    fallbackTimer = setTimeout(() => {
      if (!settled) {
        if (win && !win.isDestroyed()) win.destroy();
        finish(false);
      }
    }, 60000);
  });
}

// ===== App window =====
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'MOBPOS — نظام إدارة محلات الموبايلات',
    backgroundColor: '#0c1f4d',
    autoHideMenuBar: true,
    // Frameless مع شريط عنوان مخصص داخل الواجهة (إحساس تطبيق سطح مكتب حقيقي)
    // في وضع الكيوسك نحتفظ بالنافذة العادية (لا داعي لشريط عنوان)
    frame: isKiosk ? true : false,
    titleBarStyle: process.platform === 'darwin' && !isKiosk ? 'hiddenInset' : 'default',
    kiosk: isKiosk, // وضع الكيوسك (شاشة كاملة بدون خروج)
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // ممنوع الزوم (قرصة/تمريرة مع Ctrl) — التطبيق مش صفحة ويب
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
  });

  // في النسخة الإنتاجية: ممنوع F5 / Ctrl+R يعملوا Reload لصفحة التطبيق
  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const key = (input.key || '').toLowerCase();
      if (key === 'f5' || ((input.control || input.meta) && key === 'r')) {
        event.preventDefault();
      }
    });
  }

  // أشعّر الواجهة بحالة التكبير/الاستعادة عشان أزرار الشريط المخصص
  mainWindow.on('maximize', () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('mobpos:window-state', { maximized: true });
  });
  mainWindow.on('unmaximize', () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('mobpos:window-state', { maximized: false });
  });

  // الروابط الخارجية تفتح في المتصفح الافتراضي،
  // ونوافذ جوجل (تسجيل دخول النسخ الاحتياطي) تفتح داخل التطبيق
  const GOOGLE_AUTH_HOSTS = new Set(['accounts.google.com', 'googleapis.com', 'oauth2.googleapis.com']);
  function isGoogleAuthUrl(rawUrl) {
    try {
      const { hostname, protocol } = new URL(rawUrl);
      if (protocol !== 'https:') return false;
      // Exact match or a proper subdomain (e.g. www.googleapis.com), never a
      // substring match — which a URL like accounts.google.com.evil.com would
      // also satisfy.
      return [...GOOGLE_AUTH_HOSTS].some(host => hostname === host || hostname.endsWith(`.${host}`));
    } catch {
      return false;
    }
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isGoogleAuthUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          title: 'Google',
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // منع الانتقال لأي مكان خارج التطبيق المحلي
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = appOrigin;
    let sameOrigin = false;
    try {
      sameOrigin = new URL(url).origin === allowedOrigin;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    }
  });

  mainWindow.loadURL(appUrl);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ===== IPC handlers =====
function setupIpc() {
  // طباعة صامتة مباشرة للطابعة الافتراضية (حرارية 80mm عادةً) — للإيصالات
  ipcMain.handle('mobpos:print-silent', async () => {
    if (!mainWindow) return false;
    return new Promise((resolve) => {
      mainWindow.webContents.print(
        { silent: true, printBackground: true, margins: 0 },
        (success, reason) => resolve(!!success || reason === undefined)
      );
    });
  });

  // طباعة تقرير HTML كامل — نافذة مخفية + حوار اختيار الطابعة
  ipcMain.handle('mobpos:print-html', async (_e, payload) => {
    const html = typeof payload?.html === 'string' ? payload.html : '';
    const silent = !!payload?.silent;
    if (!html) return false;
    return withReportWindow(html, (win) => {
      return new Promise((resolve) => {
        win.webContents.print(
          { silent, printBackground: true, margins: { marginType: 'default' } },
          (success) => resolve(!!success)
        );
      });
    });
  });

  // حفظ تقرير كـ PDF حقيقي مع نافذة اختيار مكان الحفظ
  ipcMain.handle('mobpos:save-pdf', async (_e, payload) => {
    const html = typeof payload?.html === 'string' ? payload.html : '';
    let fileName = typeof payload?.fileName === 'string' ? payload.fileName : 'report';
    if (!html) return { ok: false, error: 'لا يوجد محتوى للتقرير' };

    fileName = fileName.replace(/[[\]:*?/\\"<>|]/g, ' ').trim() || 'report';
    if (!fileName.toLowerCase().endsWith('.pdf')) fileName += '.pdf';

    try {
      const defaultPath = path.join(app.getPath('documents'), fileName);
      const picked = await dialog.showSaveDialog(mainWindow, {
        title: 'حفظ التقرير كملف PDF',
        defaultPath,
        buttonLabel: 'حفظ',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };

      const targetPath = picked.filePath;
      const success = await withReportWindow(html, async (win) => {
        const pdf = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          landscape: false,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        });
        fs.writeFileSync(targetPath, pdf);
        return true;
      });

      if (!success) return { ok: false, error: 'تعذّر توليد ملف PDF' };
      return { ok: true, path: targetPath };
    } catch (err) {
      console.error('[save-pdf]', err);
      return { ok: false, error: 'حدث خطأ أثناء حفظ الملف' };
    }
  });

  // أزرار شريط العنوان المخصص
  ipcMain.handle('mobpos:window-control', async (_e, action) => {
    if (!mainWindow) return;
    if (action === 'minimize') mainWindow.minimize();
    else if (action === 'maximize-toggle') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    } else if (action === 'close') mainWindow.close();
  });

  ipcMain.handle('mobpos:window-state-get', async () => ({
    maximized: mainWindow ? mainWindow.isMaximized() : false,
  }));

  // تبديل وضع الكيوسك / ملء الشاشة
  ipcMain.handle('mobpos:toggle-kiosk', async () => {
    if (!mainWindow) return false;
    mainWindow.setKiosk(!mainWindow.isKiosk());
    return mainWindow.isKiosk();
  });

  // فحص التحديثات يدوياً — يستخدم واجهة electron-updater v6:
  //   UpdateCheckResult = { isUpdateAvailable, updateInfo, versionInfo }
  // الإصدار القديم كان بيشيك `result.updateInfo` وهو موجود دايماً حتى لو مفيش تحديث.
  ipcMain.handle('mobpos:check-updates', async () => {
    try {
      if (!app.isPackaged) return { ok: true, dev: true, currentVersion: app.getVersion() };
      const { autoUpdater } = require('electron-updater');
      const result = await autoUpdater.checkForUpdates();
      const currentVersion = app.getVersion();
      if (!result) {
        return { ok: true, updateAvailable: false, currentVersion };
      }
      return {
        ok: true,
        updateAvailable: !!result.isUpdateAvailable,
        currentVersion,
        latestVersion: result.updateInfo?.version,
        releaseNotes: result.updateInfo?.releaseNotes ?? null,
      };
    } catch {
      return { ok: false };
    }
  });

  // رقم الإصدار الحالي للتطبيق — يظهر في كارت «تحديثات التطبيق».
  ipcMain.handle('mobpos:app-version', async () => app.getVersion());

  // معرف نظام تشغيل ثابت ومجزأ، يُستخدم كبصمة جهاز أكثر ثباتاً داخل Electron.
  ipcMain.handle('mobpos:get-stable-machine-id', async () => readStableMachineId());
}

// ===== App lifecycle =====

// نسخة واحدة فقط — مهم جداً لسلامة بيانات IndexedDB
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setName('MOBPOS');
    app.setAppUserModelId('com.mobpos.system');
    Menu.setApplicationMenu(null);

    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
      callback(['clipboard-read', 'clipboard-sanitized-write'].includes(permission));
    });

    setupIpc();
    setupAutoUpdate();

    if (isDev) {
      appUrl = devServerUrl;
      appOrigin = new URL(devServerUrl).origin;
      console.log(`MOBPOS Vite dev server: ${appUrl}`);
    } else {
      try {
        serverInfo = await startServer(PREFERRED_PORT);
        appUrl = `http://127.0.0.1:${serverInfo.port}/`;
        appOrigin = new URL(appUrl).origin;
        console.log(`MOBPOS local server: ${appUrl}`);
      } catch (err) {
        console.error('Failed to start local server:', err);
        app.quit();
        return;
      }
    }

    setupCspHeaders();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (serverInfo && serverInfo.server) serverInfo.server.close();
    app.quit();
  });
}
