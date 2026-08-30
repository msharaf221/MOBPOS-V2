#!/usr/bin/env node
/**
 * تنزيل Chromium بلا واجهة (headless) لتشغيل سكربتات التقاط صور الشاشات.
 *
 * ليه مش Puppeteer العادي؟
 *   Puppeteer بينزّل Chromium من storage.googleapis.com — العنوان ده محجوب في
 *   بعض بيئات العمل/السيرفرات. الحزمة `@sparticuz/chromium` منشورة على npm
 *   نفسه (registry.npmjs.org) وبتيجي ومعها مكتبات NSS المطلوبة، فبتشتغل في
 *   البيئات المقفولة كمان.
 *
 * الاستخدام:
 *   node scripts/install-headless-chrome.cjs
 *
 * النتيجة:
 *   ~/.cache/mobpos-chromium/headless_shell   (الملف التنفيذي)
 *   ~/.cache/mobpos-chromium/lib/*.so         (مكتبات التشغيل)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { execFileSync } = require('child_process');

const REGISTRY = process.env.NPM_REGISTRY || 'https://registry.npmjs.org';
const PKG = process.env.CHROMIUM_PKG || '@sparticuz/chromium';
const VERSION = process.env.CHROMIUM_PKG_VERSION || 'latest';
const CACHE_DIR = process.env.MOBPOS_CHROME_DIR || path.join(os.homedir(), '.cache', 'mobpos-chromium');

const BIN = path.join(CACHE_DIR, 'headless_shell');
const LIB = path.join(CACHE_DIR, 'lib');

function log(msg) {
  process.stdout.write(`[chrome] ${msg}\n`);
}

async function resolveTarball() {
  const url = `${REGISTRY}/${PKG.replace('/', '%2F')}/${VERSION}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`فشل قراءة بيانات الحزمة (${res.status}) من ${url}`);
  const meta = await res.json();
  const tarball = meta?.dist?.tarball;
  if (!tarball) throw new Error('مفيش رابط tarball في بيانات الحزمة');
  return { tarball, version: meta.version };
}

async function main() {
  if (fs.existsSync(BIN)) {
    try {
      const out = execFileSync(BIN, ['--version'], {
        env: { ...process.env, LD_LIBRARY_PATH: LIB },
        encoding: 'utf8',
      }).trim();
      log(`موجود بالفعل: ${out} → ${BIN}`);
      return;
    } catch {
      log('النسخة الموجودة بايظة — هنزّل من جديد');
    }
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const { tarball, version } = await resolveTarball();
  log(`بينزّل ${PKG}@${version} ...`);

  const res = await fetch(tarball);
  if (!res.ok || !res.body) throw new Error(`فشل تنزيل الحزمة (${res.status})`);

  const tmpTgz = path.join(CACHE_DIR, 'chromium.tgz');
  await pipeline(res.body, fs.createWriteStream(tmpTgz));
  log(`تم التنزيل (${(fs.statSync(tmpTgz).size / 1024 / 1024).toFixed(1)} ميجا) — بيفك الضغط`);

  // npm tarballs are plain .tar.gz — tar is available on Linux/macOS.
  execFileSync('tar', ['-xzf', tmpTgz, '-C', CACHE_DIR]);

  const pkgBin = path.join(CACHE_DIR, 'package', 'bin');

  // 1) headless_shell (مضغوط بروتلي)
  const shellBr = path.join(pkgBin, 'chromium.br');
  if (!fs.existsSync(shellBr)) throw new Error('الحزمة ما فيهاش chromium.br');
  fs.writeFileSync(BIN, zlib.brotliDecompressSync(fs.readFileSync(shellBr)));
  fs.chmodSync(BIN, 0o755);

  // 2) مكتبات NSS (libnss3/libnspr4/...) جوه al2023.tar.br
  fs.mkdirSync(LIB, { recursive: true });
  const alBr = path.join(pkgBin, 'al2023.tar.br');
  if (fs.existsSync(alBr)) {
    const alTar = path.join(CACHE_DIR, 'al2023.tar');
    fs.writeFileSync(alTar, zlib.brotliDecompressSync(fs.readFileSync(alBr)));
    execFileSync('tar', ['-xf', alTar, '-C', CACHE_DIR]);
    const extractedLib = path.join(CACHE_DIR, 'lib');
    if (fs.existsSync(extractedLib) && extractedLib !== LIB) {
      for (const f of fs.readdirSync(extractedLib)) {
        fs.copyFileSync(path.join(extractedLib, f), path.join(LIB, f));
      }
    }
    fs.rmSync(alTar, { force: true });
  }

  // تنظيف الملفات المؤقتة (نحتفظ بالباينري بس)
  fs.rmSync(tmpTgz, { force: true });
  fs.rmSync(path.join(CACHE_DIR, 'package'), { recursive: true, force: true });

  const out = execFileSync(BIN, ['--version'], {
    env: { ...process.env, LD_LIBRARY_PATH: LIB },
    encoding: 'utf8',
  }).trim();
  log(`تمام ✅ ${out}`);
  log(`المسار: ${BIN}`);
}

main().catch((err) => {
  process.stderr.write(`[chrome] فشل التثبيت: ${err?.message || err}\n`);
  process.exit(1);
});
