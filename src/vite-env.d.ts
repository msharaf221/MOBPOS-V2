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

interface MobposUpdateCheckResponse {
  ok: boolean;
  dev?: boolean;
  updateAvailable?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  releaseNotes?: string | Array<{ version?: string; note?: string; title?: string }> | null;
}

interface MobposBridge {
  isDesktop?: boolean;
  printSilent?: () => Promise<boolean>;
  toggleKiosk?: () => Promise<boolean>;
  checkUpdates?: () => Promise<MobposUpdateCheckResponse>;
  getAppVersion?: () => Promise<string>;
  printHtml?: (html: string, opts?: { silent?: boolean }) => Promise<boolean>;
  savePdf?: (html: string, fileName: string) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
  windowControl?: (action: 'minimize' | 'maximize-toggle' | 'close') => Promise<void>;
  getWindowState?: () => Promise<{ maximized: boolean }>;
  onWindowState?: (cb: (state: { maximized: boolean }) => void) => () => void;
  getStableMachineId?: () => Promise<string | null>;
}

interface GoogleAccountsIdPromptNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
  getDismissedReason: () => string;
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  prompt: (notification?: (notification: GoogleAccountsIdPromptNotification) => void) => void;
  renderButton: (
    parent: HTMLElement,
    options?: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number | string;
      locale?: string;
    }
  ) => void;
  cancel: () => void;
}

interface GoogleAccountsOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: { access_token?: string; error?: string }) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }) => {
    requestAccessToken: (override?: { prompt?: string }) => void;
  };
}

interface Window {
  mobpos?: MobposBridge;
  google?: {
    accounts?: {
      id?: GoogleAccountsId;
      oauth2?: GoogleAccountsOAuth2;
    };
  };
}
