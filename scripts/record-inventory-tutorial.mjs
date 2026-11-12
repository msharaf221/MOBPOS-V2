import { createServer } from 'vite';
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🚀 Starting Vite dev server for Inventory tutorial...');
  const server = await createServer({
    server: { port: 8431 },
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls.local[0];
  const demoUrl = `${baseUrl}?demo=1`;

  const outputDir = path.resolve('public', 'tutorials');
  const tempDir = path.resolve('tutorials-temp-inv');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  console.log('🎬 Launching Chromium with video recording...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: tempDir,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();

  async function setupTutorialOverlay() {
    await page.evaluate(() => {
      const banner = document.createElement('div');
      banner.id = 'tut-banner';
      banner.style.position = 'fixed';
      banner.style.bottom = '28px';
      banner.style.left = '50%';
      banner.style.transform = 'translateX(-50%)';
      banner.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
      banner.style.color = '#ffffff';
      banner.style.padding = '12px 32px';
      banner.style.borderRadius = '9999px';
      banner.style.fontSize = '20px';
      banner.style.fontWeight = 'bold';
      banner.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(59, 130, 246, 0.8)';
      banner.style.zIndex = '9999999';
      banner.style.direction = 'rtl';
      banner.style.fontFamily = 'Cairo, sans-serif';
      banner.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      banner.innerText = 'نظام MOBPOS — شرح إضافة منتج جديد للمخزن وتسعيره';
      document.body.appendChild(banner);

      const cursor = document.createElement('div');
      cursor.id = 'tut-cursor';
      cursor.style.position = 'fixed';
      cursor.style.width = '24px';
      cursor.style.height = '24px';
      cursor.style.border = '2px solid #ef4444';
      cursor.style.backgroundColor = 'rgba(239, 68, 68, 0.35)';
      cursor.style.borderRadius = '50%';
      cursor.style.pointerEvents = 'none';
      cursor.style.zIndex = '10000000';
      cursor.style.transform = 'translate(-50%, -50%)';
      cursor.style.transition = 'top 0.25s cubic-bezier(0.16, 1, 0.3, 1), left 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s ease';
      cursor.style.left = '-100px';
      cursor.style.top = '-100px';
      document.body.appendChild(cursor);

      window.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
      });
      window.addEventListener('mousedown', () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(1.6)';
        cursor.style.backgroundColor = 'rgba(239, 68, 68, 0.7)';
      });
      window.addEventListener('mouseup', () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        cursor.style.backgroundColor = 'rgba(239, 68, 68, 0.35)';
      });
    });
  }

  async function setStep(text, waitMs = 2500) {
    await page.evaluate((msg) => {
      const b = document.getElementById('tut-banner');
      if (b) {
        b.style.transform = 'translateX(-50%) scale(1.05)';
        b.innerText = msg;
        setTimeout(() => {
          b.style.transform = 'translateX(-50%) scale(1)';
        }, 200);
      }
    }, text);
    await page.waitForTimeout(waitMs);
  }

  async function smoothClick(selector) {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: 'visible' });
    const box = await loc.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y, { steps: 20 });
      await page.waitForTimeout(300);
      await page.mouse.down();
      await page.waitForTimeout(150);
      await page.mouse.up();
      await page.waitForTimeout(400);
    } else {
      await loc.click();
    }
  }

  async function smoothType(selector, text) {
    await smoothClick(selector);
    const loc = page.locator(selector).first();
    await loc.pressSequentially(text, { delay: 90 });
    await page.waitForTimeout(300);
  }

  console.log('📹 Recording Video 2: Add Product to Inventory...');
  await page.goto(demoUrl);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await setupTutorialOverlay();

  await setStep('مرحباً بكم — سنتعلم الآن كيفية إضافة منتج جديد للمخزن', 3000);

  // 1. Navigate to Inventory
  await setStep('الخطوة 1: الدخول إلى شاشة «المخزون» من القائمة الجانبية', 2500);
  await smoothClick('button:has-text("المخزون")');
  await page.waitForTimeout(1000);

  // 2. Click "منتج جديد"
  await setStep('الخطوة 2: الضغط على زر «منتج جديد» في أعلى الشاشة', 2500);
  await smoothClick('button:has-text("منتج جديد")');
  await page.waitForSelector('text=إضافة منتج جديد', { timeout: 5000 });

  // 3. Enter product name
  await setStep('الخطوة 3: كتابة اسم المنتج (مثلاً: جراب حماية MagSafe الأصلي)', 2500);
  await smoothType('input[value=""]:visible', 'جراب حماية MagSafe الأصلي');

  // 4. Generate barcode automatically
  await setStep('الخطوة 4: توليد باركود دولي تلقائياً بنقرة واحدة (أو مسحه بالاسكانر)', 2500);
  await smoothClick('button:has-text("توليد تلقائي")');
  await page.waitForTimeout(1000);

  // 5. Select category
  await setStep('الخطوة 5: اختيار فئة المنتج (سماعات / شواحن / إكسسوارات)', 2500);
  const selectCategory = page.locator('select').first();
  await selectCategory.selectOption({ label: 'شواحن وكابلات' });
  await page.waitForTimeout(1000);

  // 6. Enter Cost & Sell price
  await setStep('الخطوة 6: تحديد سعر الشراء (التكلفة) وسعر البيع للجمهور', 3000);
  const numberInputs = page.locator('input[type="number"]');
  // Cost price
  await numberInputs.nth(0).fill('65');
  await page.waitForTimeout(500);
  // Sell price
  await numberInputs.nth(1).fill('140');
  await page.waitForTimeout(500);

  // 7. Quantity
  await setStep('الخطوة 7: إدخال رصيد البداية والكمية المتاحة في المحل (30 قطعة)', 2500);
  await numberInputs.nth(2).fill('30');
  await page.waitForTimeout(500);

  // 8. Submit
  await setStep('الخطوة 8: الضغط على «إضافة» لحفظ الصنف في قاعدة البيانات', 2500);
  const addSubmitBtn = page.locator('div.border-t button:has-text("إضافة")').last();
  await addSubmitBtn.scrollIntoViewIfNeeded();
  await smoothClick('div.border-t button:has-text("إضافة")');
  await page.waitForTimeout(1500);

  // 9. Show product in list
  await setStep('المنتج أصبح متاحاً الآن في المخزن وجاهزاً للبيع الفوري في الـ POS! ✅', 4000);

  // End recording
  await page.close();
  await context.close();
  await browser.close();
  await server.close();

  const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.webm'));
  if (files.length === 0) {
    throw new Error('No webm video recorded!');
  }
  const rawVideo = path.join(tempDir, files[0]);
  const mp4Output = path.join(outputDir, '02-inventory-add-product.mp4');

  console.log(`🔄 Converting ${rawVideo} to MP4 using ffmpeg...`);
  execSync(`ffmpeg -y -i "${rawVideo}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${mp4Output}"`, { stdio: 'inherit' });
  fs.rmSync(tempDir, { recursive: true, force: true });

  const stat = fs.statSync(mp4Output);
  console.log(`🎉 Tutorial Video 2 created: ${mp4Output} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(err => {
  console.error('Recording error:', err);
  process.exit(1);
});

