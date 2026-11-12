import { createServer } from 'vite';
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🚀 Starting Vite dev server for Safes & Daily Close tutorial...');
  const server = await createServer({
    server: { port: 8434 },
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls.local[0];
  const demoUrl = `${baseUrl}?demo=1`;

  const outputDir = path.resolve('public', 'tutorials');
  const tempDir = path.resolve('tutorials-temp-safes');
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
      banner.innerText = 'نظام MOBPOS - دليل إدارة الخزائن والإقفال اليومي';
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

    // 1. Intro
    await updateBanner('نظام MOBPOS - دليل إدارة الخزائن، حركة النقدية، والإقفال اليومي 💰');
    await page.waitForTimeout(2500);

    // 2. Navigate to Safes
    await pointAndClick('button:has-text("الخزائن")', 'الانتقال إلى قسم الخزائن لمتابعة النقدية وأرصدة الفروع والمحافظ', 2000);

    // 3. Overview of Safes
    await updateBanner('عرض تفصيلي لأرصدة الخزينة الرئيسية ودرج الكاشير والمحافظ الإلكترونية');
    await page.waitForTimeout(3000);

    // 4. Click Transfer between Safes
    await pointAndClick('button:has-text("تحويل")', 'الضغط على زر تحويل لنقل مبالغ نقدية بين الخزائن بأمان', 1500);

    // 5. Fill Transfer Modal
    const modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });

    await updateBanner('اختيار الخزينة المحول منها والمحول إليها');
    const fromSelect = modal.locator('select').first();
    const toSelect = modal.locator('select').nth(1);

    // Select options by index (1 = first safe, 2 = second safe)
    await fromSelect.selectOption({ index: 1 });
    await page.waitForTimeout(600);
    await toSelect.selectOption({ index: 2 });
    await page.waitForTimeout(600);

    // Enter transfer amount
    await updateBanner('تحديد مبلغ التحويل وتأكيد العملية');
    const amountInput = modal.locator('input[type="number"]').first();
    await amountInput.fill('1500');
    await page.waitForTimeout(1000);

    // Submit transfer
    const transferBtn = modal.locator('button:has-text("تحويل")');
    await transferBtn.click();
    await page.waitForTimeout(2000);

    await updateBanner('تم التحويل النقدي بنجاح وتحديث أرصدة الخزائن فورياً');
    await page.waitForTimeout(2500);

    // 6. Navigate to Finance for Daily Close
    await pointAndClick('button:has-text("المالية")', 'الانتقال إلى قسم المالية لمتابعة المبيعات، المصروفات، والإقفال', 2000);

    // 7. Overview of Financial Stats
    await updateBanner('مؤشرات مالية دقيقة ولحظية لأداء النشاط وإجمالي الأرباح والمصروفات');
    await page.waitForTimeout(3000);

    // 8. Click Daily Close (Print / PDF)
    await pointAndClick('button:has-text("الإقفال اليومي")', 'الضغط على زر الإقفال اليومي لتوليد تقرير المطابقة والحسابات', 2000);

    // 9. Report Preview Modal
    await page.waitForTimeout(1000);
    await updateBanner('تقرير إقفال يومي رسمي يشمل: المبيعات، المرتجعات، المصروفات، ورصيد الدرج');
    await page.waitForTimeout(4000);

    // 10. Close Report via Escape
    await updateBanner('يمكن طباعة التقرير مباشرة للطابعة أو تصديره بصيغة PDF ومشاركته');
    await page.waitForTimeout(2500);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    // 11. Outro
    await updateBanner('تم إقفال اليوم ومراجعة الخزائن بنجاح تام في نظام MOBPOS 🚀');
    await page.waitForTimeout(3000);

  } catch (err) {
    console.error('❌ Error during Safes & Daily Close tutorial recording:', err);
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
  const finalMp4 = path.join(outputDir, '05-daily-close-safe-tutorial.mp4');

  console.log(`🎬 Converting ${rawWebm} to optimized MP4 (${finalMp4})...`);
  const ffmpegCmd = `ffmpeg -y -i "${rawWebm}" -c:v libx264 -pix_fmt yuv420p -profile:v high -level 4.0 -preset fast -crf 23 -movflags +faststart "${finalMp4}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });

  // Cleanup temp
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`✅ Safes & Daily Close Tutorial video successfully generated at: ${finalMp4}`);
}

main().catch(console.error);
