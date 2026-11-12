import { createServer } from 'vite';
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🚀 Starting Vite dev server for IMEI tutorial...');
  const server = await createServer({
    server: { port: 8432 },
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls.local[0];
  const demoUrl = `${baseUrl}?demo=1`;

  const outputDir = path.resolve('public', 'tutorials');
  const tempDir = path.resolve('tutorials-temp-imei');
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
      banner.style.fontFamily = 'Cairo, system-ui, sans-serif';
      banner.style.transition = 'all 0.4s ease';
      banner.style.pointerEvents = 'none';
      banner.innerText = 'نظام MOBPOS - دليل تسجيل وتتبع أجهزة IMEI';
      document.body.appendChild(banner);

      const cursor = document.createElement('div');
      cursor.id = 'tut-cursor';
      cursor.style.position = 'fixed';
      cursor.style.width = '32px';
      cursor.style.height = '32px';
      cursor.style.borderRadius = '50%';
      cursor.style.backgroundColor = 'rgba(239, 68, 68, 0.4)';
      cursor.style.border = '2px solid #ef4444';
      cursor.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.8)';
      cursor.style.pointerEvents = 'none';
      cursor.style.zIndex = '9999998';
      cursor.style.transform = 'translate(-50%, -50%)';
      cursor.style.transition = 'transform 0.15s ease, opacity 0.3s ease';
      cursor.style.display = 'none';
      document.body.appendChild(cursor);
    });
  }

  async function updateBanner(text) {
    console.log(`📢 [Tutorial]: ${text}`);
    await page.evaluate((msg) => {
      const banner = document.getElementById('tut-banner');
      if (banner) {
        banner.style.transform = 'translateX(-50%) scale(0.95)';
        setTimeout(() => {
          banner.innerText = msg;
          banner.style.transform = 'translateX(-50%) scale(1)';
        }, 150);
      }
    }, text);
  }

  async function pointAndClick(selector, textBefore = '', delayAfter = 1000) {
    if (textBefore) await updateBanner(textBefore);
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: 'visible', timeout: 8000 });
    const box = await loc.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y, { steps: 20 });
      await page.evaluate(({ cx, cy }) => {
        const c = document.getElementById('tut-cursor');
        if (c) {
          c.style.display = 'block';
          c.style.left = `${cx}px`;
          c.style.top = `${cy}px`;
          c.style.transform = 'translate(-50%, -50%) scale(1.4)';
          setTimeout(() => {
            c.style.transform = 'translate(-50%, -50%) scale(1)';
          }, 200);
        }
      }, { cx: x, cy: y });
      await page.waitForTimeout(300);
      await loc.click();
    } else {
      await loc.click();
    }
    await page.waitForTimeout(delayAfter);
  }

  try {
    console.log(`🌐 Navigating to ${demoUrl}...`);
    await page.goto(demoUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await setupTutorialOverlay();

    // 1. Welcome intro
    await updateBanner('نظام MOBPOS - دليل إدارة ومتابعة أجهزة السيريال و IMEI');
    await page.waitForTimeout(2500);

    // 2. Navigate to IMEI
    await pointAndClick('button:has-text("إدارة IMEI")', 'الانتقال إلى قسم إدارة هواتف وأجهزة IMEI', 2000);

    // 3. Overview of IMEI table
    await updateBanner('سجل شامل لجميع الأجهزة: المتاحة للبيع، المباعة، وتحت الضمان');
    await page.waitForTimeout(3000);

    // 4. Click Add Device
    await pointAndClick('button:has-text("إضافة جهاز جديد")', 'الضغط على زر إضافة جهاز جديد لإدخال هاتف للمحل', 1500);

    const modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });

    // 5. Select Device Product
    await updateBanner('اختيار نوع وموديل الهاتف المسجل في المخزون');
    const selectElem = modal.locator('select').first();
    await selectElem.scrollIntoViewIfNeeded();
    await selectElem.selectOption({ label: 'iPhone 15 Pro 256GB' });
    await page.waitForTimeout(1200);

    // 6. Enter IMEI 1
    await updateBanner('إدخال رقم IMEI 1 المكون من 15 رقماً بدقة');
    const imei1Input = modal.locator('input[placeholder="15 رقم"]').first();
    await imei1Input.click();
    await imei1Input.fill('356938099887711');
    await page.waitForTimeout(1200);

    // 7. Enter color
    await updateBanner('تحديد لون ومواصفات الجهاز وحالته');
    const colorInput = modal.locator('label:has-text("اللون") + input');
    await colorInput.fill('تيتانيوم أسود');
    await page.waitForTimeout(800);

    // 8. Select condition and warranty
    await updateBanner('تحديد حالة الجهاز (جديد / مستعمل) وتاريخ انتهاء الضمان');
    const conditionSelect = modal.locator('label:has-text("الحالة") + select');
    await conditionSelect.selectOption('new');
    await page.waitForTimeout(800);

    // 9. Enter purchase price
    const priceInput = modal.locator('input[type="number"]').first();
    await priceInput.fill('42000');
    await page.waitForTimeout(1000);

    // 10. Click submit (إضافة)
    await updateBanner('حفظ بيانات الجهاز وربطه فورياً بالمخزون');
    const submitBtn = modal.locator('div.border-t button:has-text("إضافة")');
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // 11. Search for the added device
    await updateBanner('البحث السريع والفوري برقم IMEI للتحقق من الجهاز وسجله');
    const searchInput = page.locator('input[placeholder*="بحث"]').first();
    await searchInput.click();
    await searchInput.type('356938099887711', { delay: 100 });
    await page.waitForTimeout(2500);

    // 12. Show device details in table
    await updateBanner('يظهر الهاتف بحالته وتفاصيل الضمان فورياً في جدول الأجهزة');
    await page.waitForTimeout(3000);

    // 13. Clear search to show full list
    await searchInput.fill('');
    await page.waitForTimeout(1500);

    // 14. Outro
    await updateBanner('تم تسجيل ومتابعة أجهزة IMEI بنجاح في نظام MOBPOS 🚀');
    await page.waitForTimeout(3000);

  } catch (err) {
    console.error('❌ Error during IMEI tutorial recording:', err);
  } finally {
    console.log('💾 Closing browser to finish raw video...');
    await page.close();
    await context.close();
    await browser.close();
    await server.close();
  }

  // Find generated .webm
  const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.webm'));
  if (files.length === 0) {
    console.error('❌ No webm file found in temp dir!');
    return;
  }
  const rawWebm = path.join(tempDir, files[0]);
  const finalMp4 = path.join(outputDir, '03-imei-device-tutorial.mp4');

  console.log(`🎬 Converting ${rawWebm} to optimized MP4 (${finalMp4})...`);
  const ffmpegCmd = `ffmpeg -y -i "${rawWebm}" -c:v libx264 -pix_fmt yuv420p -profile:v high -level 4.0 -preset fast -crf 23 -movflags +faststart "${finalMp4}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });

  // Cleanup temp
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`✅ IMEI Tutorial video successfully generated at: ${finalMp4}`);
}

main().catch(console.error);
