import { createServer } from 'vite';
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🚀 Starting Vite dev server for Maintenance tutorial...');
  const server = await createServer({
    server: { port: 8433 },
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls.local[0];
  const demoUrl = `${baseUrl}?demo=1`;

  const outputDir = path.resolve('public', 'tutorials');
  const tempDir = path.resolve('tutorials-temp-maint');
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
      banner.innerText = 'نظام MOBPOS - دليل دورة الصيانة واستلام الأجهزة';
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
    await updateBanner('نظام MOBPOS - دليل دورة الصيانة وإدارة تذاكر الأجهزة 🛠️');
    await page.waitForTimeout(2500);

    // 2. Navigate to Maintenance
    await pointAndClick('button:has-text("الصيانة")', 'الانتقال إلى قسم الصيانة ولوحة متابعة التذاكر', 2000);

    // 3. Overview of Kanban Board
    await updateBanner('لوحة كانبان مقسمة لمراحل العمل: تم الاستلام، قيد الصيانة، مكتمل، تم التسليم');
    await page.waitForTimeout(3000);

    // 4. Click New Ticket
    await pointAndClick('button:has-text("تذكرة جديدة")', 'الضغط على تذكرة جديدة لاستلام جهاز من العميل', 1500);

    const modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });

    // 5. Fill customer details
    await updateBanner('تسجيل بيانات العميل: الاسم ورقم الهاتف للتواصل');
    const nameInput = modal.locator('input[type="text"]').first();
    await nameInput.fill('أحمد حسام محمود');
    await page.waitForTimeout(600);

    const phoneInput = modal.locator('input[type="tel"]').first();
    await phoneInput.fill('01012345678');
    await page.waitForTimeout(600);

    // 6. Fill device details
    await updateBanner('اختيار نوع الجهاز وكتابة الموديل وتفاصيل العطل بدقة');
    const typeSelect = modal.locator('select').first();
    await typeSelect.selectOption('Samsung');
    await page.waitForTimeout(600);

    const modelInput = modal.locator('input[placeholder*="مثال"]').first();
    await modelInput.fill('Galaxy S23 Ultra');
    await page.waitForTimeout(600);

    // 7. Problem description
    const problemInput = modal.locator('textarea').first();
    await problemInput.fill('تغيير باغة الشاشة الخارجية + فحص سوكت الشحن');
    await page.waitForTimeout(800);

    // 8. Estimated cost
    await updateBanner('تحديد التكلفة المبدئية المتفق عليها مع العميل');
    const costInput = modal.locator('input[type="number"]').first();
    await costInput.fill('2200');
    await page.waitForTimeout(1000);

    // 9. Submit ticket
    await updateBanner('إنشاء التذكرة وإدراجها فوراً في مرحلة الاستلام');
    const submitBtn = modal.locator('div.border-t button:has-text("إنشاء التذكرة")');
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // 10. Click the new ticket to open its details
    await pointAndClick('div:has-text("Galaxy S23 Ultra")', 'الضغط على التذكرة لفتح تفاصيل الصيانة وسجل الفحص', 2000);

    // 11. Move to "in_progress" (تحت الإصلاح)
    await updateBanner('تحديث حالة التذكرة إلى (تحت الإصلاح) للبدء في صيانة الجهاز');
    const inProgressBtn = page.locator('button:has-text("تحت الإصلاح")').first();
    await inProgressBtn.click();
    await page.waitForTimeout(1500);

    // 12. Move to "completed" (مكتمل)
    await updateBanner('تحديث حالة التذكرة إلى (مكتمل) بمجرد جاهزية الجهاز للتسليم');
    const completedBtn = page.locator('button:has-text("مكتمل")').first();
    await completedBtn.click();
    await page.waitForTimeout(1500);

    // 13. Preview receipt
    await updateBanner('معاينة وطباعة إيصال الصيانة بباركود التذكرة وشروط الضمان');
    const receiptBtn = page.locator('button:has-text("طباعة إيصال")');
    await receiptBtn.scrollIntoViewIfNeeded();
    await receiptBtn.click();
    await page.waitForTimeout(3000);

    // 14. Close receipt modal
    const closeReceiptBtn = page.locator('button:has-text("إغلاق")').last();
    await closeReceiptBtn.click();
    await page.waitForTimeout(1000);

    // 15. Close ticket modal
    const closeTicketBtn = page.locator('button.p-2.hover\\:bg-gray-100').first();
    if (await closeTicketBtn.isVisible()) {
      await closeTicketBtn.click();
    }
    await page.waitForTimeout(1000);

    // 16. Outro
    await updateBanner('تمت دورة الصيانة بنجاح وبأعلى درجات التنظيم في MOBPOS 🚀');
    await page.waitForTimeout(3000);

  } catch (err) {
    console.error('❌ Error during Maintenance tutorial recording:', err);
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
  const finalMp4 = path.join(outputDir, '04-maintenance-ticket-tutorial.mp4');

  console.log(`🎬 Converting ${rawWebm} to optimized MP4 (${finalMp4})...`);
  const ffmpegCmd = `ffmpeg -y -i "${rawWebm}" -c:v libx264 -pix_fmt yuv420p -profile:v high -level 4.0 -preset fast -crf 23 -movflags +faststart "${finalMp4}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });

  // Cleanup temp
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`✅ Maintenance Tutorial video successfully generated at: ${finalMp4}`);
}

main().catch(console.error);
