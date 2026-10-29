import test from 'node:test';
import assert from 'node:assert/strict';

function compareVersions(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/, '').trim();
  const clean2 = v2.replace(/^v/, '').trim();
  const parts1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
  const parts2 = clean2.split('.').map(n => parseInt(n, 10) || 0);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

test('compareVersions handles standard semantic versions', () => {
  assert.equal(compareVersions('1.0.30', '1.0.29'), 1);
  assert.equal(compareVersions('1.0.29', '1.0.29'), 0);
  assert.equal(compareVersions('1.0.28', '1.0.29'), -1);
  assert.equal(compareVersions('v1.0.30', '1.0.29'), 1);
  assert.equal(compareVersions('1.1.0', '1.0.29'), 1);
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
});

test('profit accounting: zero cost does not yield 100% false profit', () => {
  // If an inventory item has costPrice = 0 or missing, it should NOT count as 100% profit
  const totalCost = 0;
  const finalTotal = 1500;
  const profit = totalCost > 0 ? Math.max(0, finalTotal - totalCost) : 0;
  assert.equal(profit, 0);
});

test('profit accounting: accurately calculates gross profit when cost is known', () => {
  const items = [
    { unitPrice: 500, costPrice: 350, quantity: 2 }, // revenue 1000, cost 700
    { unitPrice: 200, costPrice: 120, quantity: 1 }  // revenue 200, cost 120
  ];
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0); // 1200
  const discount = 50;
  const finalTotal = subtotal - discount; // 1150
  const totalCost = items.reduce((s, i) => s + i.costPrice * i.quantity, 0); // 820
  const grossProfit = totalCost > 0 ? Math.max(0, finalTotal - totalCost) : 0; // 330
  assert.equal(grossProfit, 330);

  // Net Operating Profit after operating expenses
  const operatingExpenses = 100;
  const netOperatingProfit = grossProfit - operatingExpenses;
  assert.equal(netOperatingProfit, 230);
});

test('payment method normalization maps Arabic or English safely', () => {
  const normalize = (method: string): 'cash' | 'card' | 'installment' => {
    const m = (method || '').toLowerCase();
    if (m.includes('فيزا') || m.includes('visa') || m.includes('card') || m.includes('بطاق') || m.includes('إنستاباي')) {
      return 'card';
    }
    if (m.includes('قسط') || m.includes('أجل') || m.includes('آجل') || m.includes('installment') || m.includes('debt')) {
      return 'installment';
    }
    return 'cash';
  };

  assert.equal(normalize('نقدي (كاش)'), 'cash');
  assert.equal(normalize('cash'), 'cash');
  assert.equal(normalize('فيزا أو بطاقة'), 'card');
  assert.equal(normalize('إنستاباي'), 'card');
  assert.equal(normalize('تقسيط أو آجل'), 'installment');
  assert.equal(normalize('installment'), 'installment');
});
