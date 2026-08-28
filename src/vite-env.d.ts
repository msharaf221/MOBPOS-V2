/// <reference types="vite/client" />

/** App version injected from package.json by vite.config.ts (`define`). */
declare const __APP_VERSION__: string;

// واردات الملفات الخام كروابط (vite-plugin-singlefile يحوّلها base64 data-URIs)
declare module '*.woff2?url' {
  const src: string;
  export default src;
}
declare module '*.woff?url' {
  const src: string;
  export default src;
}
declare module '*.png?url' {
  const src: string;
  export default src;
}

interface MobposBridge {
  isDesktop?: boolean;
  printSilent?: () => Promise<boolean>;
  toggleKiosk?: () => Promise<boolean>;
  checkUpdates?: () => Promise<{ ok: boolean; dev?: boolean; updateAvailable?: boolean }>;
  printHtml?: (html: string, opts?: { silent?: boolean }) => Promise<boolean>;
  savePdf?: (html: string, fileName: string) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
  windowControl?: (action: 'minimize' | 'maximize-toggle' | 'close') => Promise<void>;
  getWindowState?: () => Promise<{ maximized: boolean }>;
  onWindowState?: (cb: (state: { maximized: boolean }) => void) => () => void;
  getStableMachineId?: () => Promise<string | null>;
}

interface Window {
  mobpos?: MobposBridge;
}
