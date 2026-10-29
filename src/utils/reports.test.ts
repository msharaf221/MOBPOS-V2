import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyCloseReport, transactionTypeToArabic, fmtNum } from './dailyClose.ts';

test('transactionTypeToArabic translates types to clear friendly Arabic', () => {
  assert.equal(transactionTypeToArabic('sale'), 'مبيعات');
  assert.equal(transactionTypeToArabic('maintenance'), 'صيانة');
  assert.equal(transactionTypeToArabic('expense'), 'مصروف');
  assert.equal(transactionTypeToArabic('income'), 'إيراد');
  assert.equal(transactionTypeToArabic('customer_payment'), 'تحصيل آجل');
  assert.equal(transactionTypeToArabic('purchase'), 'مشتريات');
  assert.equal(transactionTypeToArabic('transfer'), 'تحويل خزن');
  assert.equal(transactionTypeToArabic('waste'), 'هالك');
  assert.equal(transactionTypeToArabic('inventory_adjustment'), 'تسوية جرد');
  assert.equal(transactionTypeToArabic('maintenance_cost'), 'تكلفة قطع صيانة');
  assert.equal(transactionTypeToArabic('refund'), 'مرتجع');
  assert.equal(transactionTypeToArabic('deposit'), 'إيداع');
  assert.equal(transactionTypeToArabic('withdrawal'), 'سحب');
  assert.equal(transactionTypeToArabic('custom_unmapped'), 'custom_unmapped');
});

test('buildDailyCloseReport correctly aggregates sales, maintenance, expenses and net cash movement', () => {
  const targetDate = '2026-10-29';

  const input = {
    dateStr: targetDate,
    sales: [
      {
        invoiceNumber: 'INV-001',
        total: 1000,
        profit: 300,
        paid: 800,
        paymentMethod: 'cash',
        createdAt: '2026-10-29T10:00:00Z',
      },
      {
        invoiceNumber: 'INV-002',
        total: 500,
        profit: 150,
        paid: 500,
        paymentMethod: 'cash',
        createdAt: '2026-10-29T14:30:00Z',
      },
      // Previous day invoice - should be excluded
      {
        invoiceNumber: 'INV-000',
        total: 2000,
        profit: 600,
        paid: 2000,
        paymentMethod: 'cash',
        createdAt: '2026-10-28T20:00:00Z',
      },
    ],
    saleReturns: [
      {
        refundAmount: 100,
        netValue: 100,
        reason: 'عيب صناعة',
        createdAt: '2026-10-29T11:00:00Z',
      },
    ],
    transactions: [
      {
        type: 'maintenance',
        amount: 450,
        description: 'إيراد صيانة شاشة iPhone',
        createdAt: '2026-10-29T12:00:00Z',
      },
      {
        type: 'expense',
        amount: -50,
        description: 'ضيافة وفاتورة كهرباء',
        createdAt: '2026-10-29T13:00:00Z',
      },
      {
        type: 'customer_payment',
        amount: 200,
        description: 'سداد دفعة آجل عميل',
        createdAt: '2026-10-29T15:00:00Z',
      },
    ],
    safes: [
      { name: 'الخزينة الرئيسية', balance: 5000 },
      { name: 'خزينة الفرع', balance: 1200 },
    ],
  };

  const sections = buildDailyCloseReport(input);

  assert.equal(sections.length, 4);

  // Section 0: Daily Summary
  const summary = sections[0];
  assert.match(summary.title, /2026-10-29/);

  // Check sales count: 2
  const salesCountRow = summary.rows.find(r => r[0] === 'عدد فواتير البيع');
  assert.equal(salesCountRow?.[1], 2);

  // Total sales: 1500
  const salesTotalRow = summary.rows.find(r => r[0] === 'إجمالي المبيعات');
  assert.equal(salesTotalRow?.[1], fmtNum(1500));

  // Net sales after returns: 1500 - 100 = 1400
  const netSalesRow = summary.rows.find(r => r[0] === 'صافي المبيعات بعد المرتجعات');
  assert.equal(netSalesRow?.[1], fmtNum(1400));

  // Cash collected from sales: 800 + 500 = 1300
  const collectedRow = summary.rows.find(r => r[0] === 'المحصّل نقدياً من المبيعات');
  assert.equal(collectedRow?.[1], fmtNum(1300));

  // Credit remaining on customers: 1500 - 1300 = 200
  const creditRow = summary.rows.find(r => r[0] === 'بيع آجل (متبقي على العملاء)');
  assert.equal(creditRow?.[1], fmtNum(200));

  // Sales profit: 300 + 150 = 450
  const profitRow = summary.rows.find(r => r[0] === 'ربح المبيعات');
  assert.equal(profitRow?.[1], fmtNum(450));

  // Maintenance income: 450
  const maintRow = summary.rows.find(r => r[0] === 'إيراد الصيانة المسلّمة');
  assert.equal(maintRow?.[1], fmtNum(450));

  // Net cash flow: collected(1300) + maint(450) + customerPayments(200) - expenses(50) - returns(100) = 1800
  assert.ok(summary.footer);
  assert.equal(summary.footer[1], fmtNum(1800));

  // Section 2: Safes transactions table
  const txSection = sections[2];
  assert.equal(txSection.rows.length, 3);
  const maintTxRow = txSection.rows.find(r => r[2] === 'إيراد صيانة شاشة iPhone');
  assert.equal(maintTxRow?.[1], 'صيانة'); // Verified friendly Arabic translation!
});

test('buildDailyCloseReport handles defensive fallbacks: corrupt dates and missing fields', () => {
  const sections = buildDailyCloseReport({
    dateStr: '2026-10-29',
    sales: [
      {
        invoiceNumber: 'INV-BAD',
        total: 100,
        profit: 20,
        paid: 100,
        paymentMethod: 'cash',
        createdAt: 'invalid-date-string',
      },
      {
        invoiceNumber: 'INV-FALLBACK',
        total: 250,
        profit: 50,
        paid: 250,
        paymentMethod: 'cash',
        // Fallback property 'date' instead of 'createdAt'
        createdAt: '',
        date: '2026-10-29T08:00:00Z',
      } as any,
    ],
    saleReturns: [],
    transactions: [],
    safes: [],
  });

  const summary = sections[0];
  const salesCountRow = summary.rows.find(r => r[0] === 'عدد فواتير البيع');
  // Only the valid fallback row should be included
  assert.equal(salesCountRow?.[1], 1);
});
