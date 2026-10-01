import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

test('E2E POS sales cycle: Scan product -> Apply discount -> Complete payment -> Print receipt -> Inventory deduction -> Return cycle & stock restoration', async (t) => {
  // 1. Launch Vite Dev Server on ephemeral port
  const server = await createServer({
    server: { port: 0 },
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls.local[0];
  const demoUrl = `${baseUrl}?demo=1`;

  // 2. Launch Chromium in headless mode
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    // 3. Open App in Demo Mode
    await page.goto(demoUrl);
    await page.waitForLoadState('networkidle');

    // Verify main app layout loaded
    await page.waitForSelector('text=نقطة البيع', { timeout: 15000 });

    // Step A: Navigate to Inventory first to verify initial stock of 'شاحن 65 وات أصلي'
    await page.click('button:has-text("المخزون")');
    await page.waitForTimeout(500);

    // Find the row for 'شاحن 65 وات أصلي'
    const initialItemRow = page.locator('tr:has-text("شاحن 65 وات أصلي")').first();
    await initialItemRow.waitFor({ timeout: 5000 });
    const initialText = await initialItemRow.innerText();
    assert.match(initialText, /42/, 'Initial stock should be 42');

    // Step B: Navigate to POS
    await page.click('button:has-text("نقطة البيع")');
    await page.waitForTimeout(500);

    // Step C: Scan / Search product using Barcode input
    const barcodeInput = page.locator('input[placeholder*="امسح الباركود"]');
    await barcodeInput.waitFor({ state: 'visible' });
    await barcodeInput.fill('6220001112224'); // Barcode for 'شاحن 65 وات أصلي'
    await barcodeInput.press('Enter');

    // Wait for cart to contain the item
    await page.waitForSelector('text=شاحن 65 وات أصلي', { timeout: 5000 });

    // Step D: Apply discount
    const discountInput = page.locator('input[placeholder="0"]').first();
    await discountInput.fill('20');
    await page.waitForTimeout(300);

    // Step E: Complete Payment
    const checkoutButton = page.locator('button:has-text("إتمام البيع وحفظ الفاتورة")');
    await checkoutButton.waitFor({ state: 'visible' });
    assert.ok(await checkoutButton.isEnabled(), 'Checkout button should be enabled');
    await checkoutButton.click();

    // Step F: Print Receipt Trigger & Modal Verification
    await page.waitForSelector('#receipt-content', { timeout: 5000 });
    const receiptContent = page.locator('#receipt-content');
    const receiptText = await receiptContent.innerText();
    assert.match(receiptText, /شاحن 65 وات أصلي/, 'Receipt should contain product name');
    assert.match(receiptText, /فاتورة مبيعات/, 'Receipt should be a sales invoice');

    // Extract invoice number from receipt modal
    const invoiceNumberMatch = receiptText.match(/(?:INV|فاتورة|رقم الفاتورة)[^\n]*\n*([^\n]+)/);
    const invoiceNumberLocator = page.locator('#receipt-content span.font-mono.font-bold');
    let invoiceNumber = '';
    if (await invoiceNumberLocator.isVisible()) {
      invoiceNumber = (await invoiceNumberLocator.innerText()).trim();
    }

    // Check print button is present and clickable
    const printButton = page.locator('button:has-text("طباعة الفاتورة")');
    assert.ok(await printButton.isVisible(), 'Print receipt button must be visible');

    // Close receipt modal
    const closeReceiptBtn = page.locator('button:has-text("إغلاق (Esc)")');
    await closeReceiptBtn.click();
    await page.waitForSelector('#receipt-content', { state: 'hidden', timeout: 3000 });

    // Step G: Inventory Stock Deduction Verification
    await page.click('button:has-text("المخزون")');
    await page.waitForTimeout(500);

    const postSaleItemRow = page.locator('tr:has-text("شاحن 65 وات أصلي")').first();
    await postSaleItemRow.waitFor({ timeout: 5000 });
    const postSaleText = await postSaleItemRow.innerText();
    assert.match(postSaleText, /41/, 'Stock should be deducted from 42 to 41');

    // Step H: Invoice Return Cycle with Stock Restoration
    await page.click('button:has-text("المبيعات")');
    await page.waitForTimeout(500);

    // Locate the sale row in the sales table
    let saleRow = null;
    if (invoiceNumber) {
      saleRow = page.locator(`tr:has-text("${invoiceNumber}")`).first();
    }
    if (!saleRow || !(await saleRow.isVisible())) {
      saleRow = page.locator('tbody tr').first();
    }
    await saleRow.waitFor({ timeout: 5000 });

    // Click details button or row to open sale details modal
    const detailsBtn = saleRow.locator('button[title*="تفاصيل"], button:has-text("عرض"), button').first();
    if (await detailsBtn.isVisible()) {
      await detailsBtn.click();
    } else {
      await saleRow.click();
    }

    // Inside sale details modal, click 'مرتجع'
    const returnBtn = page.locator('button:has-text("مرتجع")').first();
    await returnBtn.waitFor({ timeout: 5000 });
    await returnBtn.click();

    // Fill return reason in return modal
    await page.waitForSelector('text=تسجيل مرتجع', { timeout: 5000 });
    const reasonTextarea = page.locator('textarea[placeholder*="سبب المرتجع"]');
    await reasonTextarea.fill('مرتجع تجريبي للاختبار الآلي');

    // Submit return
    const submitReturnBtn = page.locator('button:has-text("حفظ المرتجع")');
    await submitReturnBtn.click();
    await page.waitForTimeout(500);

    // Close sale details modal
    const closeModalBtn = page.locator('button:has-text("إغلاق")').last();
    if (await closeModalBtn.isVisible()) {
      await closeModalBtn.click();
    }

    // Step I: Verify Inventory Stock is Restored
    await page.click('button:has-text("المخزون")');
    await page.waitForTimeout(500);

    const restoredItemRow = page.locator('tr:has-text("شاحن 65 وات أصلي")').first();
    await restoredItemRow.waitFor({ timeout: 5000 });
    const restoredText = await restoredItemRow.innerText();
    assert.match(restoredText, /42/, 'Stock should be restored back from 41 to 42');

  } finally {
    await browser.close();
    await server.close();
  }
});
