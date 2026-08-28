#!/usr/bin/env node
/**
 * Copies ci/release.yml → .github/workflows/release.yml
 *
 * لماذا الملف مش في مكانه أصلاً؟
 * توكن GitHub المستخدم في جلسات Arena ما لوش صلاحية `workflows`، فأي push
 * بيحاول ينشئ ملف تحت `.github/workflows/` بيترفض:
 *   "refusing to allow a GitHub App to create or update workflow ... without `workflows` permission"
 * عشان كده ملف الـ workflow محفوظ في `ci/release.yml` ومتابع في Git عادي.
 *
 * شغّل الأمر ده مرة واحدة على جهازك بحسابك إنت، ثم اعمل commit + push:
 *   npm run setup:ci
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const source = path.join(repoRoot, 'ci', 'release.yml');
const destDir = path.join(repoRoot, '.github', 'workflows');
const dest = path.join(destDir, 'release.yml');

if (!fs.existsSync(source)) {
  console.error('✗ ci/release.yml غير موجود');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(source, dest);

console.log('✅ تم إنشاء .github/workflows/release.yml');
console.log('');
console.log('الخطوة التالية — ارفعه بحسابك عشان GitHub يفعّله:');
console.log('  git add .github/workflows/release.yml');
console.log('  git commit -m "ci: enable release workflow"');
console.log('  git push');
