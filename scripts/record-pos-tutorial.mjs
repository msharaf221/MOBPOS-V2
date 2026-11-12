import { createServer } from 'vite';
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🚀 Starting Vite dev server for tutorial recording...');
  const server = await createServer({
    server: { port: 8430 },
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls.local[0];
  const demoUrl = `${baseUrl}?demo=1`;

  const outputDir = path.resolve('public', 'tutorials');
  const tempDir = path.resolve('tutorials-temp');
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

  // Helper to inject tutorial UI (captions + animated mouse cursor)
  async function setupTutorialOverlay() {
    await page.evaluate(() => {
      // 1. Bottom banner
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
      banner.innerText = 'نظام MOBPOS — شرح نقطة البيع وطباعة الفاتورة';
      document.body.appendChild(banner);

      // 2. Glowing cursor
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
    await loc.pressSequentially(text, { delay: 100 });
    await page.waitForTimeout(400);
  }

  console.log('📹 Recording Video 1: POS Quick Sale & Receipt...');
  await page.goto(demoUrl);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await setupTutorialOverlay();

  await setStep('مرحباً بكم في نظام MOBPOS لإدارة محلات الموبايل والصيانة', 3000);

  // Navigate to POS
  await setStep('الخطوة 1: الدخول إلى شاشة «نقطة البيع» السريعة', 2500);
  await smoothClick('button:has-text("نقطة البيع")');

  // Search or select product
  await setStep('الخطوة 2: مسح الباركود أو البحث عن المنتج بالاسم', 2500);
  const barcodeInput = 'input[placeholder*="امسح الباركود"]';
  await smoothType(barcodeInput, 'شاحن 65');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);

  // Add another item from quick grid if available
  await setStep('الخطوة 3: إضافة سماعة AirPods من القائمة بنقرة واحدة', 2500);
  const airpodsCard = page.locator('text=سماعة بلوتوث AirPods').first();
  if (await airpodsCard.isVisible()) {
    await smoothClick('text=سماعة بلوتوث AirPods');
    await page.waitForTimeout(1000);
  }

  // Apply discount
  await setStep('الخطوة 4: إمكانية تطبيق خصم فوري على الفاتورة (مثلاً 50 ج.م)', 2500);
  const discountInput = 'input[placeholder="0"]';
  await smoothType(discountInput, '50');

  // Complete payment
  await setStep('الخطوة 5: الضغط على «إتمام البيع وحفظ الفاتورة»', 3000);
  await smoothClick('button:has-text("إتمام البيع وحفظ الفاتورة")');

  // Receipt Preview
  await page.waitForSelector('#receipt-content', { timeout: 8000 });
  await setStep('الخطوة 6: خروج فاتورة المبيعات الحرارية 80mm متضمنة اسم المحل والأصناف', 4000);

  await setStep('تمت عملية البيع بنجاح، وخُصمت الكميات وحُسبت الأرباح فورياً! ✅', 3500);

  // Close modal and wrap up
  const closeBtn = page.locator('button:has-text("إغلاق")').first();
  if (await closeBtn.isVisible()) {
    await smoothClick('button:has-text("إغلاق")');
  }
  await page.waitForTimeout(1500);

  // End recording
  await page.close();
  await context.close();
  await browser.close();
  await server.close();

  // Find recorded video file in tempDir
  const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.webm'));
  if (files.length === 0) {
    throw new Error('No webm video recorded!');
  }
  const rawVideo = path.join(tempDir, files[0]);
  const mp4Output = path.join(outputDir, '01-pos-sale-tutorial.mp4');

  console.log(`🔄 Converting ${rawVideo} to MP4 using ffmpeg...`);
  execSync(`ffmpeg -y -i "${rawVideo}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${mp4Output}"`, { stdio: 'inherit' });

  // Clean temp files
  fs.rmSync(tempDir, { recursive: true, force: true });

  const stat = fs.statSync(mp4Output);
  console.log(`🎉 Tutorial Video 1 created successfully: ${mp4Output} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(err => {
  console.error('Recording error:', err);
  process.exit(1);
});

