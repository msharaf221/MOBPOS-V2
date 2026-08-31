#!/usr/bin/env node
/**
 * Copies ci/*.yml → .github/workflows/
 *
 *   ci/ci.yml       → .github/workflows/ci.yml        (فحص كل Pull Request)
 *   ci/release.yml  → .github/workflows/release.yml   (بناء ونشر نسخة ويندوز)
 *
 * لماذا الملفات مش في مكانها أصلاً؟
 * توكن GitHub المستخدم في جلسات Arena ما لوش صلاحية `workflows`، فأي push
 * بيحاول ينشئ ملف تحت `.github/workflows/` بيترفض:
 *   "refusing to allow a GitHub App to create or update workflow ... without `workflows` permission"
 * عشان كده ملفات الـ workflow محفوظة في `ci/` ومتابعة في Git عادي.
 *
 * شغّل الأمر ده مرة واحدة على جهازك بحسابك إنت، ثم اعمل commit + push:
 *   npm run setup:ci
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(repoRoot, 'ci');
const destDir = path.join(repoRoot, '.github', 'workflows');

const WORKFLOWS = [
  { file: 'ci.yml', desc: 'فحص كل Pull Request (typecheck + tests + أمان + build)' },
  { file: 'release.yml', desc: 'بناء ونشر نسخة الويندوز عند رفع tag' },
];

const missing = WORKFLOWS.filter(w => !fs.existsSync(path.join(sourceDir, w.file)));
if (missing.length === WORKFLOWS.length) {
  console.error('✗ مفيش أي ملف workflow في مجلد ci/');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

const installed = [];
for (const w of WORKFLOWS) {
  const source = path.join(sourceDir, w.file);
  if (!fs.existsSync(source)) {
    console.warn(`⚠️  ci/${w.file} غير موجود — تم تخطيه`);
    continue;
  }
  fs.copyFileSync(source, path.join(destDir, w.file));
  installed.push(w);
  console.log(`✅ .github/workflows/${w.file}  — ${w.desc}`);
}

console.log('');
console.log('الخطوة التالية — ارفعهم بحسابك عشان GitHub يفعّلهم:');
console.log(`  git add ${installed.map(w => `.github/workflows/${w.file}`).join(' ')}`);
console.log('  git commit -m "ci: enable workflows"');
console.log('  git push');
