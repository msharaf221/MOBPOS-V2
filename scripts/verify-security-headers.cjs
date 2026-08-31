#!/usr/bin/env node
// ============================================================
//  MOBPOS — Security headers verifier
//
//  يفحص الموقع المنشور ويتأكد إن كل الرؤوس الأمنية اللي اتظبطت في
//  vercel.json فعلاً بتوصل للمتصفح، وإن robots.txt و sitemap.xml
//  و privacy.html موجودين.
//
//  الاستخدام:
//    node scripts/verify-security-headers.cjs
//    node scripts/verify-security-headers.cjs https://your-domain.com
// ============================================================

const DEFAULT_TARGET = 'https://mob-pos-v2.vercel.app';
const target = (process.argv[2] || DEFAULT_TARGET).replace(/\/$/, '');

/** الرؤوس المطلوبة + دالة تتحقق من القيمة. */
const REQUIRED_HEADERS = [
  {
    name: 'content-security-policy',
    label: 'CSP Header',
    check: v => v.includes("default-src") && v.includes("frame-ancestors 'none'"),
    expect: "default-src 'self' … frame-ancestors 'none'",
  },
  {
    name: 'x-frame-options',
    label: 'Clickjacking Protection',
    check: v => ['deny', 'sameorigin'].includes(v.toLowerCase()),
    expect: 'DENY',
  },
  {
    name: 'x-content-type-options',
    label: 'MIME Sniffing Disabled',
    check: v => v.toLowerCase() === 'nosniff',
    expect: 'nosniff',
  },
  {
    name: 'referrer-policy',
    label: 'Referrer Policy',
    check: v => v.length > 0,
    expect: 'strict-origin-when-cross-origin',
  },
  {
    name: 'permissions-policy',
    label: 'Permissions Policy',
    check: v => v.includes('camera=()') && v.includes('geolocation=()'),
    expect: 'camera=(), geolocation=(), microphone=() …',
  },
  {
    name: 'strict-transport-security',
    label: 'HSTS',
    check: v => /max-age=\d{6,}/.test(v),
    expect: 'max-age=63072000; includeSubDomains; preload',
  },
];

const REQUIRED_PATHS = [
  { path: '/robots.txt', label: 'robots.txt', mustInclude: 'Sitemap:' },
  { path: '/sitemap.xml', label: 'sitemap.xml', mustInclude: '<urlset' },
  { path: '/privacy.html', label: 'Privacy Policy', mustInclude: 'سياسة الخصوصية' },
];

const green = s => `\x1b[32m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const dim = s => `\x1b[2m${s}\x1b[0m`;

async function main() {
  console.log(`\n🔎 Checking ${target}\n`);
  let failures = 0;

  let res;
  try {
    res = await fetch(target + '/', { redirect: 'follow' });
  } catch (err) {
    console.error(red(`✖ could not reach ${target}: ${err.message}`));
    process.exit(1);
  }

  console.log('Response headers:');
  for (const h of REQUIRED_HEADERS) {
    const value = res.headers.get(h.name) || '';
    if (value && h.check(value)) {
      console.log(`  ${green('✔')} ${h.label} ${dim(`— ${value.slice(0, 70)}`)}`);
    } else {
      failures++;
      console.log(`  ${red('✖')} ${h.label} — missing/invalid. Expected: ${h.expect}`);
    }
  }

  console.log('\nPublic files:');
  for (const p of REQUIRED_PATHS) {
    try {
      const r = await fetch(target + p.path);
      const body = r.ok ? await r.text() : '';
      if (r.ok && body.includes(p.mustInclude)) {
        console.log(`  ${green('✔')} ${p.label} ${dim(`— HTTP ${r.status}`)}`);
      } else {
        failures++;
        console.log(`  ${red('✖')} ${p.label} — HTTP ${r.status}${r.ok ? ' (unexpected content)' : ''}`);
      }
    } catch (err) {
      failures++;
      console.log(`  ${red('✖')} ${p.label} — ${err.message}`);
    }
  }

  console.log(
    failures === 0
      ? green('\n✅ All security checks passed.\n')
      : red(`\n❌ ${failures} check(s) failed.\n`)
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
