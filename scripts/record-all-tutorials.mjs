import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const TUTORIAL_SCRIPTS = [
  { name: '01. بيع كاش وتقسيط وطباعة الفاتورة', script: 'scripts/record-pos-tutorial.mjs', file: '01-pos-sale-tutorial.mp4' },
  { name: '02. إضافة منتج وتوليد الباركود وتحديث المخزون', script: 'scripts/record-inventory-tutorial.mjs', file: '02-inventory-add-product.mp4' },
  { name: '03. تسجيل ومتابعة أجهزة IMEI وفترة الضمان', script: 'scripts/record-imei-tutorial.mjs', file: '03-imei-device-tutorial.mp4' },
  { name: '04. دورة الصيانة واستلام الأجهزة وطباعة الإيصال', script: 'scripts/record-maintenance-tutorial.mjs', file: '04-maintenance-ticket-tutorial.mp4' },
  { name: '05. إدارة الخزائن وحركة النقدية والإقفال اليومي', script: 'scripts/record-safes-close-tutorial.mjs', file: '05-daily-close-safe-tutorial.mp4' },
];

console.log('═════════════════════════════════════════════════════════════');
console.log('       🎬 MOBPOS - تسجيل وتوليد جميع فيديوهات الشرح         ');
console.log('═════════════════════════════════════════════════════════════\n');

const outputDir = path.resolve('public', 'tutorials');
fs.mkdirSync(outputDir, { recursive: true });

for (const [index, item] of TUTORIAL_SCRIPTS.entries()) {
  console.log(`\n▶️ [${index + 1}/${TUTORIAL_SCRIPTS.length}] جاري تسجيل: ${item.name}...`);
  const res = spawnSync('node', [item.script], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`❌ فشل تسجيل الفيديو: ${item.name}`);
  } else {
    console.log(`✅ اكتمل التسجيل بنجاح: ${item.file}`);
  }
}

console.log('\n═════════════════════════════════════════════════════════════');
console.log('                     ملخص الفيديوهات المتاحة                ');
console.log('═════════════════════════════════════════════════════════════');

for (const item of TUTORIAL_SCRIPTS) {
  const filePath = path.join(outputDir, item.file);
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
    console.log(`🎥 ${item.file.padEnd(35)} | ${sizeMb.padStart(6)} MB | ✅ جاهز للمشاركة`);
  } else {
    console.log(`❌ ${item.file.padEnd(35)} | غير موجود`);
  }
}

console.log('═════════════════════════════════════════════════════════════\n');

