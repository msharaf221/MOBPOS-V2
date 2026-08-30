#!/usr/bin/env node
/**
 * التقاط صور شاشات MOBPOS للدعاية والإعلان 📸
 *
 * السكربت بيشغّل متصفح Chromium بلا واجهة، بيفتح التطبيق، بيعدي شاشة الترخيص
 * وتسجيل الدخول، بيحقن بيانات تجريبية واقعية، وبعدين بيلف على كل الشاشات
 * ويصوّرها بالوضع الفاتح والداكن.
 *
 * ⚠️ مهم: السكربت **ما بيغيّرش أي سطر في كود التطبيق**. عشان يعدي شاشة
 * الترخيص بيستخدم اعتراض طلبات (request interception) ويستبدل وحدة
 * `src/license/keys.ts` في الذاكرة فقط بمفتاح عام مؤقت مولّد محلياً، وسيرفر
 * التفعيل بيتعطّل لنفس الجلسة. الكود على الديسك يفضل زي ما هو.
 *
 * الاستخدام:
 *   npm run dev                                # في terminal منفصل
 *   node scripts/install-headless-chrome.cjs   # مرة واحدة
 *   node scripts/capture-marketing.cjs
 *
 * اختيارات:
 *   --url http://127.0.0.1:8420   عنوان التطبيق
 *   --out marketing/screenshots   مجلد الحفظ
 *   --themes light,dark           light | dark | midnight
 *   --pages dashboard,pos         لقطات محددة (افتراضي: الكل)
 *   --shop "اسم المحل"            اسم المحل الظاهر في الصور
 *   --width 1600 --height 1000    مقاس النافذة
 *   --scale 2                     كثافة البكسل (2 = صور ريتنا حادة)
 *   --no-seed                     من غير بيانات تجريبية
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { webcrypto } = require('crypto');
const puppeteer = require('puppeteer-core');
const { buildDemoData } = require('./marketing/demo-data.cjs');

const ROOT = path.resolve(__dirname, '..');
const CHROME_DIR = process.env.MOBPOS_CHROME_DIR || path.join(os.homedir(), '.cache', 'mobpos-chromium');
const CHROME_BIN = process.env.MOBPOS_CHROME_BIN || path.join(CHROME_DIR, 'headless_shell');

/** الشاشات اللي بنصوّرها — الترتيب هو ترتيب القائمة الجانبية */
const PAGES = [
  { id: 'dashboard', label: 'لوحة التحكم', file: '01-dashboard' },
  { id: 'pos', label: 'نقطة البيع', file: '02-pos' },
  { id: 'inventory', label: 'المخزون', file: '04-inventory' },
  { id: 'inventoryAudit', label: 'جرد المخزون', file: '05-inventory-audit' },
  { id: 'imei', label: 'إدارة IMEI', file: '06-imei' },
  { id: 'maintenance', label: 'الصيانة', file: '07-maintenance' },
  { id: 'customers', label: 'العملاء', file: '08-customers' },
  { id: 'sales', label: 'المبيعات', file: '09-sales' },
  { id: 'safes', label: 'الخزائن', file: '10-safes' },
  { id: 'finance', label: 'المالية', file: '11-finance' },
  { id: 'sideAccounts', label: 'الحسابات الجانبية', file: '12-side-accounts' },
  { id: 'suppliers', label: 'الموردين', file: '13-suppliers' },
  { id: 'users', label: 'الموظفين', file: '14-users' },
  { id: 'settings', label: 'الإعدادات', file: '15-settings' },
];

const THEMES = {
  light: { file: 'light', darkMode: false, themeStyle: 'default', accentColor: '#3b82f6' },
  dark: { file: 'dark', darkMode: true, themeStyle: 'default', accentColor: '#3b82f6' },
  midnight: { file: 'midnight', darkMode: true, themeStyle: 'midnightGold', accentColor: '#f59e0b' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => process.stdout.write(`📸 ${msg}\n`);

// ===== Arguments =====
function parseArgs(argv) {
  const opts = {
    url: 'http://127.0.0.1:8420',
    out: path.join(ROOT, 'marketing', 'screenshots'),
    themes: ['light', 'dark'],
    pages: PAGES.map((p) => p.id),
    shop: 'الفهد للموبايلات',
    width: 1600,
    height: 1000,
    scale: 2,
    seed: true,
    adminPassword: 'Mobpos@2026',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') opts.url = next();
    else if (a === '--out') opts.out = path.resolve(next());
    else if (a === '--themes') opts.themes = next().split(',').map((s) => s.trim());
    else if (a === '--pages') opts.pages = next().split(',').map((s) => s.trim());
    else if (a === '--shop') opts.shop = next();
    else if (a === '--width') opts.width = Number(next());
    else if (a === '--height') opts.height = Number(next());
    else if (a === '--scale') opts.scale = Number(next());
    else if (a === '--password') opts.adminPassword = next();
    else if (a === '--no-seed') opts.seed = false;
    else if (a === '--help' || a === '-h') { opts.help = true; }
  }
  return opts;
}

// ===== ترخيص مؤقت للجلسة (مفتاح عام مولّد محلياً — الذاكرة فقط) =====
async function makeDemoLicense(shopName) {
  const subtle = webcrypto.subtle;
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = await subtle.exportKey('jwk', pair.publicKey);

  const payload = {
    v: 2,
    id: 'mobpos-screen-capture',
    p: 'lifetime',
    s: shopName,
    u: 25,
    i: new Date().toISOString(),
    e: '',
    lt: true,
    to: 'MOBPOS Marketing',
    n: 'مفتاح داخلي لالتقاط صور الشاشات',
  };

  const b64url = (buf) =>
    Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    Buffer.from(`MSP2.${payloadB64}`, 'utf8')
  );

  return {
    key: `MSP2.${payloadB64}.${b64url(Buffer.from(signature))}`,
    publicKey: { kty: publicKey.kty, crv: publicKey.crv, x: publicKey.x, y: publicKey.y },
  };
}

/**
 * استبدال المفتاح العام + تعطيل سيرفر التفعيل في الوحدة المحوّلة.
 *
 * ⚠️ كل الأنماط مثبتة على `^export const` عشان ما نلمسش سطور الشرح — الملف فيه
 * مثال على شكل `export const ACTIVATION_SERVER_URL = '...'` جوه comment.
 */
function patchKeysModule(source, publicKey) {
  const replaceOnce = (src, pattern, replacement, what) => {
    if (!pattern.test(src)) throw new Error(`فشل تعديل ${what} — شكل الكود اتغير؟`);
    return src.replace(pattern, replacement);
  };

  let patched = source;
  patched = replaceOnce(
    patched,
    /^export const LICENSE_PUBLIC_KEY\s*=\s*\{[^}]*\}/m,
    `export const LICENSE_PUBLIC_KEY = ${JSON.stringify(publicKey)}`,
    'المفتاح العام'
  );
  patched = replaceOnce(
    patched,
    /^export const ACTIVATION_SERVER_URL[^=\n]*=\s*"[^"]*";/m,
    'export const ACTIVATION_SERVER_URL = "";',
    'سيرفر التفعيل'
  );
  patched = replaceOnce(
    patched,
    /^export const ACTIVATION_SERVER_TOKEN[^=\n]*=\s*"[^"]*";/m,
    'export const ACTIVATION_SERVER_TOKEN = "";',
    'توكن سيرفر التفعيل'
  );
  return patched;
}

// ===== أدوات مساعدة داخل الصفحة =====
async function exposeLicenseHelpers(page) {
  await page.evaluateOnNewDocument(() => {
    // eslint-disable-next-line no-undef
    window.__mobposReady = (async () => {
      const engine = await import('/src/license/engine.ts');
      const device = await import('/src/license/device.ts');
      window.__mobpos = { engine, device };
    })();
  });
}

async function clickByText(page, text, selector = 'button') {
  const handle = await page.evaluateHandle((t, sel) => {
    const nodes = Array.from(document.querySelectorAll(sel));
    const exact = nodes.find((n) => (n.textContent || '').trim() === t);
    if (exact) return exact;
    return nodes.find((n) => (n.textContent || '').includes(t)) || null;
  }, text, selector);
  const el = handle.asElement();
  if (!el) throw new Error(`ما لقاش عنصر فيه النص "${text}"`);
  await el.click();
  await sleep(350);
}

async function typeInto(page, selector, text) {
  await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, text, { delay: 6 });
}

/**
 * تسجيل الدخول لو ظهر فورم الدخول.
 * الجلسة في MOBPOS متخزنة في الذاكرة فقط (عن قصد — عشان القفل التلقائي)،
 * فأي reload بيرجّعنا لشاشة الدخول.
 */
async function loginIfNeeded(page, password) {
  const hasLoginForm = await page.evaluate(
    () => !!document.querySelector('input[type="password"]') && !!document.querySelector('input[type="text"]')
  );
  if (!hasLoginForm) return false;
  await typeInto(page, 'input[type="text"]', 'admin');
  await typeInto(page, 'input[type="password"]', password);
  await clickByText(page, 'دخول');
  await sleep(1800);
  return true;
}

/** يكتب إعدادات التطبيق (اسم المحل / الثيم) في IndexedDB مباشرة */
async function writeSettings(page, { darkMode, themeStyle, accentColor, shopName }) {
  await page.evaluate(
    ({ darkMode, themeStyle, accentColor, shopName }) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('MobileShopDB', 4);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('appSettings', 'readwrite');
          const store = tx.objectStore('appSettings');
          store.put(
            {
              shopName,
              shopPhone: '01000123456',
              shopAddress: 'القاهرة - شارع عبد العزيز',
              receiptFooter: 'شكراً لتعاملكم معنا 💙',
              notifSound: true,
              autoRefresh: true,
              shopLogo: undefined,
              accentColor,
              themeStyle,
            },
            'shopSettings'
          );
          store.put(darkMode, 'darkMode');
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        };
      }),
    { darkMode, themeStyle, accentColor, shopName }
  );
}

/** حقن البيانات التجريبية في IndexedDB (نفس أسماء المتاجر اللي بيستخدمها useStore) */
async function seedDemoData(page, data) {
  await page.evaluate((payload) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('MobileShopDB', 4);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const stores = Object.keys(payload);
        const tx = db.transaction(stores, 'readwrite');
        for (const storeName of stores) {
          const store = tx.objectStore(storeName);
          // users: بنضيف الموظفين الجداد من غير ما نلمس حساب admin
          if (storeName !== 'users') store.clear();
          for (const record of payload[storeName]) store.put(record);
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('tx aborted'));
      };
    });
  }, data);
}

/** يمسح خانة بحث نقطة البيع بزرار الـ × */
async function clearPosSearch(page) {
  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder^="امسح الباركود"]');
    const btn = input && input.parentElement && input.parentElement.querySelector('button');
    if (btn) btn.click();
  });
  await sleep(300);
}

/** يملأ سلة نقطة البيع بمنتجات عشان الصورة تبيّن نظام شغّال */
async function preparePosCart(page) {
  const searchSelector = 'input[placeholder^="امسح الباركود"]';
  await page.waitForSelector(searchSelector, { visible: true, timeout: 15000 });

  const addItem = async (term, cardText) => {
    await clearPosSearch(page);
    await typeInto(page, searchSelector, term);
    await sleep(600);
    try {
      await clickByText(page, cardText, 'button');
    } catch {
      return false;
    }
    await sleep(700);
    return true;
  };

  // 1) إكسسوارات للسلة
  await addItem('واقي شاشة', 'واقي شاشة زجاج 9H');
  await addItem('شاحن', 'شاحن Apple أصلي 20W');
  await addItem('كابل', 'كابل Type-C مضفر 1 متر');

  // 2) جهاز → بيفتح نافذة اختيار السيريال (IMEI)
  await addItem('iPhone 15', 'iPhone 15 Pro Max 256GB');
  await sleep(600);
  const imeiModalOpen = await page.evaluate(
    () => !!document.body.textContent.includes('اختر الجهاز') || !!document.body.textContent.includes('الرقم التسلسلي')
  );
  return { imeiModalOpen };
}

/** ينقر أول جهاز في نافذة اختيار الـ IMEI بنقرة موثوقة (trusted) */
async function pickFirstImeiUnit(page) {
  const handles = await page.$$('button');
  for (const h of handles) {
    const txt = await h.evaluate((el) => el.textContent || '');
    if (/\d{15,}/.test(txt)) {
      await h.click();
      return true;
    }
  }
  return false;
}

/** لو نافذة الـ IMEI لسه مفتوحة، نقفلها بزرار الـ × اللي جنب العنوان */
async function closeImeiModalIfNeeded(page) {
  const stillOpen = await page.evaluate(() => document.body.textContent.includes('اختر الجهاز'));
  if (!stillOpen) return;
  const handle = await page.evaluateHandle(() => {
    const heading = Array.from(document.querySelectorAll('h3')).find((x) =>
      (x.textContent || '').includes('اختر الجهاز')
    );
    return heading && heading.parentElement ? heading.parentElement.querySelector('button') : null;
  });
  const el = handle.asElement();
  if (el) await el.click();
  await sleep(600);
}

// ===== البرنامج الرئيسي =====
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*/, '') + '\n');
    return;
  }

  if (!fs.existsSync(CHROME_BIN)) {
    throw new Error(`مفيش Chromium في ${CHROME_BIN}\nشغّل الأول: node scripts/install-headless-chrome.cjs`);
  }

  // التأكد إن التطبيق شغّال
  try {
    const res = await fetch(opts.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    throw new Error(`التطبيق مش شغّال على ${opts.url} — شغّل \`npm run dev\` في terminal تاني`);
  }

  fs.mkdirSync(opts.out, { recursive: true });
  const { key: licenseKey, publicKey } = await makeDemoLicense(opts.shop);

  const browser = await puppeteer.launch({
    executablePath: CHROME_BIN,
    env: { ...process.env, LD_LIBRARY_PATH: path.join(CHROME_DIR, 'lib') },
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--lang=ar',
      `--window-size=${opts.width},${opts.height}`,
    ],
  });

  const captured = [];
  const shot = async (page, name, note) => {
    const file = path.join(opts.out, `${name}.png`);
    await page.screenshot({ path: file, captureBeyondViewport: false });
    captured.push({ file: path.relative(ROOT, file), note });
    log(`${path.basename(file)}  (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: opts.scale });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ar,en;q=0.8' });

    // اعتراض طلبات: نستبدل keys.ts بنسخة فيها مفتاحنا المؤقت (في الذاكرة فقط)
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      try {
        if (request.url().includes('/src/license/keys.ts')) {
          const original = await fetch(request.url()).then((r) => r.text());
          await request.respond({
            status: 200,
            contentType: 'application/javascript; charset=utf-8',
            body: patchKeysModule(original, publicKey),
          });
          return;
        }
        await request.continue();
      } catch (err) {
        // الطلب ممكن يكون اتلغى (تنقّل سريع) — نتجاهل بهدوء
        if (!/Request is already handled|Session closed|net::ERR_ABORTED/.test(String(err?.message))) {
          process.stderr.write(`[intercept] ${err?.message}\n`);
        }
      }
    });

    await exposeLicenseHelpers(page);

    // ---------- 1) شاشة التفعيل (قبل ما نفعّل) ----------
    log('بيفتح التطبيق...');
    await page.goto(opts.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate(() => window.__mobposReady);
    await sleep(1500);
    await shot(page, '00-license-activation', 'شاشة تفعيل الترخيص');

    // ---------- 2) تفعيل الترخيص المؤقت ----------
    const activation = await page.evaluate((k) => window.__mobpos.engine.activateLicense(k), licenseKey);
    if (!activation?.ok) throw new Error(`التفعيل فشل: ${activation?.error || 'unknown'}`);
    log('تم تفعيل الترخيص المؤقت');

    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1500);
    await shot(page, '00-login', 'شاشة تسجيل الدخول');

    // ---------- 3) تسجيل الدخول + تغيير كلمة المرور الافتراضية ----------
    await typeInto(page, 'input[type="text"]', 'admin');
    await typeInto(page, 'input[type="password"]', 'admin123');
    await clickByText(page, 'دخول');
    await sleep(1200);

    const forceChange = await page.evaluate(
      () => !!document.querySelector('input[placeholder="أدخل كلمة المرور الحالية"]')
    );
    if (forceChange) {
      await typeInto(page, 'input[placeholder="أدخل كلمة المرور الحالية"]', 'admin123');
      await typeInto(page, 'input[placeholder="كلمة مرور جديدة وقوية"]', opts.adminPassword);
      await typeInto(page, 'input[placeholder="أعد إدخال كلمة المرور الجديدة"]', opts.adminPassword);
      await page.click('form button[type="submit"]');
      await sleep(2000);
      log('تم تغيير كلمة المرور الافتراضية');
    }

    // ---------- 4) حقن البيانات التجريبية ----------
    if (opts.seed) {
      await page.waitForFunction(() => !!document.body.textContent, { timeout: 30000 });
      const demo = buildDemoData({ shopName: opts.shop });
      await seedDemoData(page, demo);
      log(`تم حقن بيانات تجريبية: ${demo.sales.length} فاتورة، ${demo.inventory.length} منتج، ${demo.imeiUnits.length} جهاز`);
    }

    // ---------- 5) لفّة على الثيمات والشاشات ----------
    for (const themeName of opts.themes) {
      const theme = THEMES[themeName];
      if (!theme) throw new Error(`ثيم غير معروف: ${themeName}`);
      await writeSettings(page, { ...theme, shopName: opts.shop });
      await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
      await loginIfNeeded(page, opts.adminPassword);
      await page.waitForSelector('aside, nav', { timeout: 30000 });
      await sleep(1800);
      log(`— الثيم: ${themeName}`);

      for (const target of PAGES) {
        if (!opts.pages.includes(target.id)) continue;

        if (target.id === 'pos') {
          // نقطة البيع: نملأ السلة الأول
          await clickByText(page, target.label, 'button, a');
          await sleep(1200);
          const state = await preparePosCart(page);
          await sleep(900);
          if (state.imeiModalOpen) {
            await shot(page, `${target.file}-imei-picker-${theme.file}`, 'نافذة اختيار السيريال IMEI أثناء البيع');
            // نختار أول جهاز متاح بنقرة "حقيقية" عشان تسكر النافذة ويتضاف للسلة
            const picked = await pickFirstImeiUnit(page);
            await sleep(900);
            if (picked) await closeImeiModalIfNeeded(page);
          } else {
            await closeImeiModalIfNeeded(page);
          }
          // نمسح البحث عشان شبكة المنتجات تظهر كاملة في الصورة
          await clearPosSearch(page);
          await sleep(900);
          await shot(page, `${target.file}-${theme.file}`, 'نقطة البيع مع سلة مشتريات');
          continue;
        }

        await clickByText(page, target.label, 'button, a');
        // استنى الشاشة تظهر فعلاً (العنوان في الهيدر) + خلّص أنيميشن الأرقام
        await page
          .waitForFunction(
            (label) => document.body.textContent.includes(label),
            { timeout: 20000 },
            target.label
          )
          .catch(() => undefined);
        await sleep(1500);
        await shot(page, `${target.file}-${theme.file}`, target.label);
      }
    }

    // ---------- 6) ملف وصف للصور ----------
    const manifest = {
      generatedAt: new Date().toISOString(),
      app: { name: 'MOBPOS', version: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version },
      viewport: `${opts.width}x${opts.height}@${opts.scale}x`,
      shopName: opts.shop,
      themes: opts.themes,
      images: captured,
    };
    fs.writeFileSync(path.join(opts.out, 'manifest.json'), JSON.stringify(manifest, null, 2));
    log(`تم — ${captured.length} صورة في ${path.relative(ROOT, opts.out)}/`);
  } finally {
    await browser.close();
  }
}

// يتنفذ بس لما يتشغل كسكربت (مش لما يتعمله require من مكان تاني)
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`❌ فشل الالتقاط: ${err?.stack || err}\n`);
    process.exit(1);
  });
}

module.exports = { patchKeysModule, makeDemoLicense, PAGES, THEMES };
