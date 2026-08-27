// ============================================================
//  Preload — جسر آمن بين صفحة التطبيق وعملية إلكترون
//  يعرّض window.mobpos بواجهة محدودة وآمنة فقط
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mobpos', {
  /** true إذا كنا داخل تطبيق سطح المكتب */
  isDesktop: true,

  /**
   * طباعة صامتة مباشرة (بدون نافذة الطباعة) — للطابعات الحرارية.
   * ترجع Promise<boolean> بالنجاح.
   */
  printSilent: () => ipcRenderer.invoke('mobpos:print-silent'),

  /**
   * طباعة تقرير HTML كامل عبر نافذة مخفية.
   * silent=false (الافتراضي) يفتح حوار اختيار الطابعة.
   */
  printHtml: (html, opts) =>
    ipcRenderer.invoke('mobpos:print-html', { html, silent: !!(opts && opts.silent) }),

  /**
   * حفظ تقرير HTML كملف PDF حقيقي — يفتح نافذة اختيار مكان الحفظ.
   * يرجع { ok, path } أو { ok:false, canceled:true } أو { ok:false, error }.
   */
  savePdf: (html, fileName) => ipcRenderer.invoke('mobpos:save-pdf', { html, fileName }),

  /** أزرار شريط العنوان المخصص: تصغير / تكبير-استعادة / إغلاق */
  windowControl: (action) => ipcRenderer.invoke('mobpos:window-control', action),

  /** الحالة الحالية للنافذة { maximized } */
  getWindowState: () => ipcRenderer.invoke('mobpos:window-state-get'),

  /** استمع لتغير حالة التكبير — يرجع دالة لإلغاء الاشتراك */
  onWindowState: (cb) => {
    const listener = (_event, state) => cb(state);
    ipcRenderer.on('mobpos:window-state', listener);
    return () => ipcRenderer.removeListener('mobpos:window-state', listener);
  },

  /** فتح وضع ملء الشاشة / الخروج منه (وضع الكيوسك) */
  toggleKiosk: () => ipcRenderer.invoke('mobpos:toggle-kiosk'),

  /** فحص التحديثات يدوياً */
  checkUpdates: () => ipcRenderer.invoke('mobpos:check-updates'),
});
