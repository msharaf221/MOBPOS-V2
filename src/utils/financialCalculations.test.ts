import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateComprehensivePnl,
  calculateInventoryValuation,
  isPnlTransaction,
  isOperationalExpense,
  isOperationalIncome,
  calculateTransactionsBreakdown,
} from './financialCalculations.ts';

test('isPnlTransaction: strict separation of Cash Flow vs P&L', () => {
  // Cash flow only: capital deposits and owner withdrawals must NOT enter P&L
  assert.equal(isPnlTransaction('capital'), false);
  assert.equal(isPnlTransaction('withdrawal'), false);
  assert.equal(isPnlTransaction('transfer'), false);
  assert.equal(isPnlTransaction('wallet_deposit'), false);
  assert.equal(isPnlTransaction('wallet_withdrawal'), false);
  assert.equal(isPnlTransaction('purchase'), false);

  // Operational items: should enter P&L
  assert.equal(isPnlTransaction('expense'), true);
  assert.equal(isPnlTransaction('income'), true);
  assert.equal(isPnlTransaction('maintenance_cost'), true);
});

test('isOperationalExpense & isOperationalIncome: accurate classification', () => {
  const capitalTx = { type: 'capital', amount: 50000 };
  const withdrawalTx = { type: 'withdrawal', amount: 15000 };
  const expenseTx = { type: 'expense', amount: 200, category: 'مصروفات نثرية' };
  const incomeTx = { type: 'income', amount: 350, category: 'خدمة شحن' };

  assert.equal(isOperationalExpense(capitalTx), false);
  assert.equal(isOperationalIncome(capitalTx), false);

  assert.equal(isOperationalExpense(withdrawalTx), false);
  assert.equal(isOperationalIncome(withdrawalTx), false);

  assert.equal(isOperationalExpense(expenseTx), true);
  assert.equal(isOperationalIncome(expenseTx), false);

  assert.equal(isOperationalIncome(incomeTx), true);
  assert.equal(isOperationalExpense(incomeTx), false);
});

test('calculateTransactionsBreakdown: groups capital, withdrawals, expenses and other income cleanly', () => {
  const transactions = [
    { type: 'capital', amount: 1000000, description: 'تمويل رأس مال' },
    { type: 'withdrawal', amount: 100000, description: 'مسحوبات الشريك' },
    { type: 'expense', amount: 500, description: 'فاتورة نت' },
    { type: 'income', amount: 250, description: 'إيراد تشغيلي آخر' },
  ];

  const breakdown = calculateTransactionsBreakdown(transactions);
  assert.equal(breakdown.capitalInflow, 1000000);
  assert.equal(breakdown.ownerWithdrawals, 100000);
  assert.equal(breakdown.operatingExpenses, 500);
  assert.equal(breakdown.otherOperatingIncome, 250);
});

test('calculateComprehensivePnl: ignores capital injections and withdrawals in operating P&L', () => {
  const result = calculateComprehensivePnl({
    sales: [
      {
        id: 's1',
        total: 1000,
        profit: 400,
      },
    ],
    maintenance: [
      {
        id: 'm1',
        status: 'delivered',
        finalPrice: 500,
        finalCost: 200,
        profit: 300,
      },
    ],
    transactions: [
      // Capital injection: 1,000,000 EGP (must NOT count as operating revenue)
      { id: 't1', type: 'capital', amount: 1000000, description: 'إيداع رأس مال جديد' },
      // Owner withdrawal: 200,000 EGP (must NOT count as operating expense)
      { id: 't2', type: 'withdrawal', amount: 200000, description: 'مسحوبات شخصية للشريك' },
      // Actual operational expense: 200 EGP
      { id: 't3', type: 'expense', amount: 200, description: 'فاتورة كهرباء وبوفيه' },
    ],
    stockWastes: [],
    returns: [],
  });

  // Total operating revenue = 1,000 (sale) + 500 (maintenance) = 1,500 (NOT 1,001,500!)
  assert.equal(result.totalOperatingRevenue, 1500);
  assert.equal(result.netSalesRevenue, 1000);
  assert.equal(result.maintRevenue, 500);

  // Gross profit = 400 (sale profit) + 300 (maintenance profit) = 700
  assert.equal(result.grossOperatingProfit, 700);

  // Operational expenses = 200 (NOT 200,200!)
  assert.equal(result.operatingExpenses, 200);

  // Net operating profit = 700 - 200 = 500
  assert.equal(result.netOperatingProfit, 500);
  assert.equal(result.isLoss, false);
  assert.equal(result.statusLabel, 'ربح');
  assert.ok(result.profitMarginPct >= 33 && result.profitMarginPct <= 34); // ~33%
});

test('calculateComprehensivePnl: handles returns and net revenue deduction accurately', () => {
  const result = calculateComprehensivePnl({
    sales: [
      {
        id: 's1',
        total: 800,
        profit: 300,
      },
    ],
    returns: [
      {
        id: 'r1',
        netValue: 400,
        profitImpact: 150,
      },
    ],
    maintenance: [],
    transactions: [],
    stockWastes: [],
  });

  // Net sales revenue = 800 - 400 = 400
  assert.equal(result.netSalesRevenue, 400);
  assert.equal(result.totalOperatingRevenue, 400);

  // Net sales profit = 300 - 150 = 150
  assert.equal(result.netSalesProfit, 150);
  assert.equal(result.netOperatingProfit, 150);
});

test('calculateComprehensivePnl: zero revenue and operating loss state', () => {
  const result = calculateComprehensivePnl({
    sales: [],
    maintenance: [],
    transactions: [
      { id: 't1', type: 'expense', amount: 1500, description: 'إيجار المحل الشهري' },
    ],
    stockWastes: [
      { id: 'w1', totalCost: 300 },
    ],
  });

  assert.equal(result.totalOperatingRevenue, 0);
  assert.equal(result.grossOperatingProfit, 0);
  assert.equal(result.operatingExpenses, 1500);
  assert.equal(result.wasteTotal, 300);
  // Net profit = 0 - 1800 = -1800
  assert.equal(result.netOperatingProfit, -1800);
  assert.equal(result.isLoss, true);
  assert.equal(result.isZeroRevenue, true);
  assert.equal(result.statusLabel, 'خسارة');
  // When revenue is 0 and profit is negative, profitMarginPct must not divide by zero
  assert.equal(result.profitMarginPct, 0);
});

test('calculateInventoryValuation: supports snake_case, camelCase and filters invalid negative numbers', () => {
  const items = [
    // Standard camelCase
    { id: '1', quantity: 10, costPrice: 50, sellPrice: 80 },
    // Supabase snake_case
    { id: '2', stock_quantity: 5, cost_price: 100, sell_price: 150 },
    // Alternative snake_case
    { id: '3', quantity_in_stock: 4, purchase_price: 25, price: 40 },
    // Corrupt or invalid negative quantity/price (should be safely ignored or guarded)
    { id: '4', quantity: -2, costPrice: 100, sellPrice: 200 },
    { id: '5', quantity: 3, costPrice: 'invalid' as any, sellPrice: 60 },
  ];

  const valuation = calculateInventoryValuation(items);

  // Item 1: 10 * 50 = 500 (cost), 10 * 80 = 800 (sell), 10 pieces
  // Item 2: 5 * 100 = 500 (cost), 5 * 150 = 750 (sell), 5 pieces
  // Item 3: 4 * 25 = 100 (cost), 4 * 40 = 160 (sell), 4 pieces
  // Item 4: negative qty ignored -> 0
  // Item 5: qty 3, cost 0 -> cost 0, sell 3 * 60 = 180, 3 pieces
  // Total cost = 500 + 500 + 100 + 0 = 1100
  // Total sell = 800 + 750 + 160 + 180 = 1890
  // Total pieces = 10 + 5 + 4 + 3 = 22

  assert.equal(valuation.totalCapitalAtCost, 1100);
  assert.equal(valuation.totalRetailValue, 1890);
  assert.equal(valuation.totalPiecesCount, 22);
  assert.equal(valuation.potentialProfit, 790);
});
