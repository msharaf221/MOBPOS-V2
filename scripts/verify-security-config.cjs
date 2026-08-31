#!/usr/bin/env node
// ============================================================
//  MOBPOS — Security config verifier (offline / CI)
//
//  الفرق بينه وبين verify-security-headers.cjs:
//    • ده بيفحص *الكود* — مش محتاج إنترنت ولا موقع منشور، فينفع في CI
//      على أي Pull Request قبل ما يتدمج.
//    • التاني بيفحص *الموقع المنشور* بعد الـ deploy.
//
//  الهدف: أي حد يشيل رأس حماية أو ملف بالغلط، الـ CI يقع فوراً
//  بدل ما الفينيدنج ترجع في فحص الأمان الجاي.
//
//  الاستخدام:  node scripts/verify-security-config.cjs
// ============================================================

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));

const green = s => `\x1b[32m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const dim = s => `\x1b[2m${s}\x1b[0m`;

let failures = 0;
function check(label, condition, hint) {
  if (condition) {
    console.log(`  ${green('✔')} ${label}`);
  } else {
    failures++;
    console.log(`  ${red('✖')} ${label}${hint ? dim(` — ${hint}`) : ''}`);
  }
}

// ===== 1) رؤوس الحماية على Vercel =====
console.log('\nvercel.json — رؤوس الحماية:');
{
  if (!exists('vercel.json')) {
    failures++;
    console.log(`  ${red('✖')} vercel.json مفقود`);
  } else {
    const cfg = JSON.parse(read('vercel.json'));
    const rule = (cfg.headers || []).find(h => h.source === '/(.*)');
    const headers = new Map((rule?.headers || []).map(h => [h.key.toLowerCase(), h.value]));
    const csp = headers.get('content-security-policy') || '';

    check('CSP موجود', csp.length > 0, 'finding #1');
    check("CSP فيه default-src 'self'", csp.includes("default-src 'self'"));
    check("CSP فيه frame-ancestors 'none'", csp.includes("frame-ancestors 'none'"), 'finding #2');
    check("CSP فيه object-src 'none'", csp.includes("object-src 'none'"));
    check('CSP مفيهوش wildcard خطير', !/script-src[^;]*\*(?!\.)/.test(csp), "script-src * يبطّل الحماية");
    check('X-Frame-Options: DENY', (headers.get('x-frame-options') || '').toUpperCase() === 'DENY', 'finding #2');
    check('X-Content-Type-Options: nosniff', headers.get('x-content-type-options') === 'nosniff', 'finding #4');
    check('Referrer-Policy مظبوط', (headers.get('referrer-policy') || '').includes('strict-origin'), 'finding #5');

    const pp = headers.get('permissions-policy') || '';
    check('Permissions-Policy بيقفل الكاميرا', pp.includes('camera=()'), 'finding #9');
    check('Permissions-Policy بيقفل المايك', pp.includes('microphone=()'), 'finding #9');
    check('Permissions-Policy بيقفل الموقع', pp.includes('geolocation=()'), 'finding #9');
    check('HSTS مفعّل', /max-age=\d{6,}/.test(headers.get('strict-transport-security') || ''));
  }
}

// ===== 2) الملفات العامة =====
console.log('\nالملفات العامة:');
{
  check('robots.txt موجود', exists('public/robots.txt'), 'finding #8');
  if (exists('public/robots.txt')) {
    const robots = read('public/robots.txt');
    check('robots.txt فيه سطر Sitemap:', /^Sitemap:\s*https?:\/\//m.test(robots), 'finding #10');
    for (const p of ['/api', '/admin', '/master']) {
      check(`robots.txt بيمنع ${p}`, robots.includes(`Disallow: ${p}`));
    }
  }

  check('sitemap.xml موجود', exists('public/sitemap.xml'), 'finding #10');
  if (exists('public/sitemap.xml')) {
    check('sitemap فيه urlset', read('public/sitemap.xml').includes('<urlset'));
  }

  check('privacy.html موجود', exists('public/privacy.html'), 'finding #7');
}

// ===== 3) سياسة الخصوصية: محتوى + بيانات تواصل شغالة =====
console.log('\nسياسة الخصوصية (PDPL — قانون 151/2020):');
if (exists('public/privacy.html')) {
  const privacy = read('public/privacy.html');
  check('بتذكر القانون 151 لسنة 2020', privacy.includes('151'));
  check('فيها قسم حقوق صاحب البيانات', privacy.includes('حقوق'));
  check('فيها مدد الاحتفاظ', privacy.includes('الاحتفاظ'));
  check('فيها وسيلة تواصل (mailto)', /mailto:[^"\s@]+@[^"\s]+/.test(privacy));

  // أهم فحص: مفيش دومين وهمي راجع تاني.
  // mobpos.app مش متسجّل — أي إيميل عليه بيرجع bounce، والوعد بالرد
  // خلال 30 يوم على صندوق ميت مخالفة صريحة.
  const placeholders = [/@mobpos\.app/i, /0100-000-0000/, /example\.com/i, /your-?domain/i];
  const hit = placeholders.find(re => re.test(privacy));
  check('مفيش بيانات تواصل وهمية', !hit, hit ? `لقيت ${hit}` : '');
}

// ===== 4) الرؤوس في تطبيق سطح المكتب =====
console.log('\nتطبيق سطح المكتب (Electron):');
{
  const main = exists('electron/main.cjs') ? read('electron/main.cjs') : '';
  check('CSP مظبوط في main.cjs', main.includes('Content-Security-Policy'));
  check("frame-ancestors 'none' في إلكترون", main.includes("frame-ancestors 'none'"));
  check('صلاحيات المتصفح مقفولة', main.includes('setPermissionRequestHandler'));

  const local = exists('electron/local-server.cjs') ? read('electron/local-server.cjs') : '';
  check('السيرفر المحلي بيبعت رؤوس حماية', local.includes('SECURITY_HEADERS'));
  check('nosniff في السيرفر المحلي', local.includes('nosniff'));
}

// ===== 5) خادم التفعيل =====
console.log('\nخادم التفعيل:');
{
  const server = exists('activation-server/server.js') ? read('activation-server/server.js') : '';
  check('بيبعت رؤوس حماية', server.includes('X-Content-Type-Options'));
  check('CORS قابل للتقييد', server.includes('ALLOWED_ORIGINS'));
  check('ردود التفعيل مش بتتكاش', server.includes('no-store'));
}

// ===== 6) تخزين Supabase =====
console.log('\nSupabase:');
{
  const schema = exists('supabase/schema.sql') ? read('supabase/schema.sql') : '';
  check('RLS مفعّل على الجدول', schema.includes('enable row level security'));
  check('فيه بلوك تأمين التخزين', schema.includes('storage.buckets'));
  check('بيقفل أي bucket عام', schema.includes('set public = false'));
}

console.log(
  failures === 0
    ? green('\n✅ كل فحوصات إعدادات الأمان عدّت.\n')
    : red(`\n❌ ${failures} فحص فشل — الرجاء المراجعة قبل الدمج.\n`)
);
process.exit(failures === 0 ? 0 : 1);
