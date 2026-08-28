#!/usr/bin/env node
// ============================================================
//  التحقق من قناة التحديث التلقائي — بنفس طريقة تطبيق العميل
//
//  electron-updater داخل التطبيق يبعت طلب غير موقّع (بدون مصادقة) إلى:
//    https://github.com/{owner}/{repo}/releases/latest/download/latest.yml
//  والسكريبت ده بيعيد نفس الطلب بالظبط عشان يتأكد إن التحديث هيوصل
//  لكل العملاء فعلًا، مش بس إن الـ Release موجود في الواجهة.
//
//  الاختبارات:
//    1) جلب latest.yml        → لازم يرجع 200 (404 = الريبو private أو الـ Release ناقص)
//    2) تحليل latest.yml      → لازم فيه version + path + sha512 + size
//    3) مقارنة الإصدار         → إصدار الـ feed مقابل package.json محليًا
//    4) HEAD على ملف الـ EXE  → لازم يرجع 200 وحجمه يطابق size في latest.yml
//    5) (اختياري --full)      → تحميل ملف الـ EXE كامل والتحقق من sha512
//
//  الاستخدام:
//    npm run verify:updates                    # بدون مصادقة — بالظبط زي العميل
//    npm run verify:updates -- --token=ghp_x   # بتوكن (لتشخيص قنوات خاصة)
//    npm run verify:updates -- --full          # + تحميل الـ EXE والتحقق من sha512 (بطيء)
//
//  كود الخروج: 0 = التحديث هيصل للعملاء ✅ | 1 = فيه مشكلة والعملاء مش هيقدروا يحدّثوا ❌
// ============================================================

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 60_000;

function parseArgs(argv) {
  const opts = { token: '', full: false, owner: '', repo: '' };
  for (const arg of argv) {
    if (arg.startsWith('--token=')) opts.token = arg.slice('--token='.length);
    else if (arg === '--full') opts.full = true;
    else if (arg.startsWith('--owner=')) opts.owner = arg.slice('--owner='.length);
    else if (arg.startsWith('--repo=')) opts.repo = arg.slice('--repo='.length);
  }
  return opts;
}

// اقرأ owner/repo من إعدادات publish في electron-builder.yml (مصدر الحقيقة)
function readPublishConfig() {
  const ymlPath = path.join(REPO_ROOT, 'electron-builder.yml');
  const text = fs.readFileSync(ymlPath, 'utf8');
  const owner = (text.match(/^\s*owner:\s*(\S+)\s*$/m) || [])[1] || '';
  const repo = (text.match(/^\s*repo:\s*(\S+)\s*$/m) || [])[1] || '';
  return { owner, repo };
}

// طلب HTTP(S) مع متابعة redirect (الـ token مبيترسلش لخوادم تانية غير GitHub)
function request(url, { headers = {}, method = 'GET', token = '' } = {}) {
  return new Promise((resolve, reject) => {
    const doRequest = (target, remaining) => {
      let u;
      try {
        u = new URL(target);
      } catch (err) {
        return reject(new Error(`URL غير صالح: ${target}`));
      }
      const reqHeaders = { ...headers };
      // احترم مواصفات المتصفح/Node: ما نرسلش Authorization لمضيف مختلف عن الأصل
      if (token && u.hostname.endsWith('github.com')) {
        reqHeaders.Authorization = `Bearer ${token}`;
      }
      const req = https.request(
        u,
        { method, headers: reqHeaders, timeout: TIMEOUT_MS },
        (res) => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume();
            if (remaining <= 0) return reject(new Error('redirectات كتير — مرفوض'));
            return doRequest(new URL(res.headers.location, target).toString(), remaining - 1);
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () =>
            resolve({
              status,
              headers: res.headers,
              body: Buffer.concat(chunks),
              finalUrl: target,
            }),
          );
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error(`انتهى الوقت بعد ${TIMEOUT_MS / 1000} ثانية`)));
      req.on('error', reject);
      req.end();
    };
    doRequest(url, MAX_REDIRECTS);
  });
}

// parse بسيط لملف latest.yml (صوريته معروفة من electron-updater) بدون مكتبات خارجية
function parseLatestYml(text) {
  const data = { version: '', path: '', sha512: '', size: null, files: [] };
  let inFiles = false;
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (/^files:\s*$/.test(line)) {
      inFiles = true;
      continue;
    }
    if (inFiles) {
      const item = line.match(/^\s*-\s+url:\s*(\S+)/);
      if (item) {
        current = { url: item[1], sha512: '', size: null };
        data.files.push(current);
        continue;
      }
      if (current) {
        const sha = line.match(/^\s*sha512:\s*(\S+)/);
        if (sha) {
          current.sha512 = sha[1];
          continue;
        }
        const size = line.match(/^\s*size:\s*(\d+)/);
        if (size) {
          current.size = Number(size[1]);
          continue;
        }
      }
    }
    if (!inFiles || !line.startsWith(' ')) {
      const m = line.match(/^(\w+):\s*(.+?)\s*$/);
      if (m) {
        const [, key, val] = m;
        if (['version', 'path', 'sha512'].includes(key)) data[key] = val.replace(/^['"]|['"]$/g, '');
        else if (key === 'size') data.size = Number(val);
      }
    }
  }
  return data;
}

function printResult(ok, label, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { owner: cfgOwner, repo: cfgRepo } = readPublishConfig();
  const owner = opts.owner || cfgOwner || 'msharaf221';
  const repo = opts.repo || cfgRepo || 'MOBPOS-V2';
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

  console.log('');
  console.log(`📡 فحص قناة التحديث التلقائي — ${owner}/${repo}`);
  console.log(`   وضع المصادقة: ${opts.token ? 'بتوكن (تشخيصي)' : 'بدون مصادقة — نفس طلب العميل بالظبط'}`);
  console.log('');

  let allOk = true;
  const base = `https://github.com/${owner}/${repo}/releases/latest/download`;

  // (1) جلب latest.yml
  let yml = null;
  try {
    const res = await request(`${base}/latest.yml`, { token: opts.token });
    if (res.status === 404) {
      allOk = false;
      printResult(false, 'جلب latest.yml', 'HTTP 404 — الريبو خاص (private) أو الـ Release مش موجود');
      console.log('');
      console.log('   التشخيص: تطبيق العميل بيطلب latest.yml بدون أي مصادقة، فالريبو الخاص بيرجع 404.');
      console.log('   الحل:خلي الريبو public (Settings → General → Danger Zone → Change visibility)،');
      console.log('   أو وزع تحديثات خاصة بتوكن electron-updater (requestHeaders) — وهو قرار أمني لازم يتفكر فيه.');
      console.log('   النتيجة الحالية: ❌ العملاء مش قادرين يجيبوا أي تحديث من الريبو ده.');
      process.exit(1);
    }
    if (res.status !== 200) {
      allOk = false;
      printResult(false, 'جلب latest.yml', `HTTP ${res.status} (من ${res.finalUrl})`);
      process.exit(1);
    }
    yml = res.body.toString('utf8');
    printResult(true, 'جلب latest.yml', 'HTTP 200');
  } catch (err) {
    allOk = false;
    printResult(false, 'جلب latest.yml', err.message);
    process.exit(1);
  }

  // (2) تحليل latest.yml
  const feed = parseLatestYml(yml);
  const shaOk = /^[A-Za-z0-9+/=]{80,140}$/.test(feed.sha512);
  const pathOk = typeof feed.path === 'string' && feed.path.endsWith('.exe') && feed.path.length > 3;
  const sizeOk = Number.isFinite(feed.size) && feed.size > 0;
  const versionOk = /^\d+\.\d+\.\d+$/.test(feed.version);
  if (!printResult(versionOk && shaOk && pathOk && sizeOk, 'محتوى latest.yml',
    `version=${feed.version || '؟'} path=${feed.path || '؟'} sha512=${shaOk ? '✓' : 'ناقص/مش فاضل'} size=${feed.size ?? '؟'}`)) {
    allOk = false;
    console.log('');
    console.log('   نص latest.yml للرجوع عليه:');
    console.log(yml.split('\n').map((l) => `     ${l}`).join('\n'));
    process.exit(1);
  }

  // (3) مقارنة الإصدار مع package.json المحلي (معلوماتية — مش شرط فشل)
  const feedVer = feed.version;
  const localVer = String(pkg.version);
  const cmp = feedVer.localeCompare(localVer, undefined, { numeric: true });
  printResult(true, 'إصدار الـ feed مقابل package.json',
    `الـ feed: ${feedVer} — المحلي: ${localVer}${cmp < 0 ? ' ⚠️ (الـ feed أقدم من الكود المحلي!)' : cmp > 0 ? ' (المحلي أقدم من الـ feed — طبيعي لو لسه ما اتعملش release)' : ' ✓ متطابق'}`);

  // (4) HEAD على ملف الـ EXE المشار له في path
  try {
    const res = await request(`${base}/${encodeURIComponent(feed.path)}`, { method: 'HEAD', token: opts.token });
    const len = Number(res.headers['content-length'] || 0);
    const lenOk = res.status === 200 && (len === 0 || len === feed.size);
    if (!printResult(lenOk, `توفر ${feed.path}`,
      len ? `HTTP ${res.status} — ${len.toLocaleString('en')} بايت (متوقع ${feed.size.toLocaleString('en')})` : `HTTP ${res.status}`)) {
      allOk = false;
    }
  } catch (err) {
    allOk = false;
    printResult(false, `توفر ${feed.path}`, err.message);
  }

  // (5) اختياري: تحميل كامل + sha512
  if (opts.full) {
    try {
    console.log(`  ⏳ جارٍ تحميل ${feed.path} كامل للتحقق من sha512 (${(feed.size / 1024 / 1024).toFixed(1)} MB) ...`);
    const hash = crypto.createHash('sha512');
    const res = await request(`${base}/${encodeURIComponent(feed.path)}`, { token: opts.token });
    hash.update(res.body);
    const digest = hash.digest('base64');
    if (!printResult(res.status === 200 && digest === feed.sha512, 'sha512 لملف التثبيت',
      digest === feed.sha512 ? 'متطابق مع latest.yml ✓' : `الـ feed: ${feed.sha512} — المحسوب: ${digest}`)) {
      allOk = false;
    }
    } catch (err) {
      allOk = false;
      printResult(false, 'sha512 لملف التثبيت', err.message);
    }
  }

  console.log('');
  if (allOk) {
    console.log(`🎉 كل الفحوصات نجحت — التحديث v${feed.version} هيوصل لكل العملاء التلقائي (electron-updater هيلاقيه في ${base}/latest.yml).`);
    process.exit(0);
  } else {
    console.log('⚠️ فيه مشكلة — راجع النقاط اللي فوق قبل ما تعتمد على التحديث التلقائي.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('خطأ غير متوقع:', err);
  process.exit(1);
});
