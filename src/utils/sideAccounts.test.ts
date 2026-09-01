import test from 'node:test';
import assert from 'node:assert/strict';
import { planSettlementReversal, settledThroughSafes } from './sideAccounts.ts';

const iso = (minutesAgo: number) => new Date(2026, 0, 1, 10, minutesAgo).toISOString();

test('planSettlementReversal reverses LIFO across safes (receivable)', () => {
  const settlements = [
    { safeId: 'safeA', amount: 500, createdAt: iso(0) },
    { safeId: 'safeB', amount: 300, createdAt: iso(5) },
  ];

  // Reverse 600: newest first (safeB 300) then the rest from safeA (300).
  const ops = planSettlementReversal(settlements, 600, 1);
  assert.deepEqual(ops, [
    { safeId: 'safeB', amount: -300 },
    { safeId: 'safeA', amount: -300 },
  ]);
});

test('planSettlementReversal splits inside one settlement when needed', () => {
  const settlements = [
    { safeId: 'safeA', amount: 500, createdAt: iso(0) },
    { safeId: 'safeB', amount: 300, createdAt: iso(5) },
  ];

  // Reverse only 100 → entirely from the newest settlement (safeB).
  const ops = planSettlementReversal(settlements, 100, 1);
  assert.deepEqual(ops, [{ safeId: 'safeB', amount: -100 }]);
});

test('planSettlementReversal flips sign for payables (cash comes back in)', () => {
  const settlements = [
    { safeId: 'safeA', amount: -200, createdAt: iso(0) },
  ];

  const ops = planSettlementReversal(settlements, 150, -1);
  assert.deepEqual(ops, [{ safeId: 'safeA', amount: 150 }]);
});

test('planSettlementReversal skips earlier reversal rows instead of re-reversing them', () => {
  // History: collect 500 (safeA), reverse 200 (safeA), collect 100 (safeB).
  // Net cash in = 400; reversing 400 must extract exactly 400 — the -200 row
  // must NOT be consumed as a source again.
  const settlements = [
    { safeId: 'safeA', amount: 500, createdAt: iso(0) },
    { safeId: 'safeA', amount: -200, createdAt: iso(5) },
    { safeId: 'safeB', amount: 100, createdAt: iso(10) },
  ];

  const ops = planSettlementReversal(settlements, 400, 1);
  assert.deepEqual(ops, [
    { safeId: 'safeB', amount: -100 },
    { safeId: 'safeA', amount: -300 },
  ]);
  const total = ops.reduce((sum, op) => sum + op.amount, 0);
  assert.equal(total, -400);
});

test('planSettlementReversal ignores unordered input and unsafe rows', () => {
  const settlements = [
    { safeId: 'safeB', amount: 300, createdAt: iso(9) }, // newer
    { safeId: '', amount: 100, createdAt: iso(10) },     // no safe → skipped
    { safeId: 'safeA', amount: 500, createdAt: iso(1) }, // older
  ];

  const ops = planSettlementReversal(settlements, 400, 1);
  assert.deepEqual(ops, [
    { safeId: 'safeB', amount: -300 },
    { safeId: 'safeA', amount: -100 },
  ]);
});

test('planSettlementReversal returns empty for nothing to reverse', () => {
  assert.deepEqual(planSettlementReversal([], 500, 1), []);
  assert.deepEqual(
    planSettlementReversal([{ safeId: 'safeA', amount: 100, createdAt: iso(0) }], 0, 1),
    []
  );
  assert.deepEqual(
    planSettlementReversal([{ safeId: 'safeA', amount: 100, createdAt: iso(0) }], -50, 1),
    []
  );
  // Wrong-direction settlements are never consumed.
  assert.deepEqual(
    planSettlementReversal([{ safeId: 'safeA', amount: -100, createdAt: iso(0) }], 50, 1),
    []
  );
});

test('planSettlementReversal is best-effort when settlements cannot cover the amount', () => {
  const settlements = [{ safeId: 'safeA', amount: 100, createdAt: iso(0) }];
  // Caller should clamp, but if it doesn't we only reverse what exists.
  assert.deepEqual(planSettlementReversal(settlements, 1000, 1), [
    { safeId: 'safeA', amount: -100 },
  ]);
});

test('settledThroughSafes sums signed settlement amounts', () => {
  assert.equal(
    settledThroughSafes([
      { safeId: 'a', amount: 500, createdAt: iso(0) },
      { safeId: 'b', amount: 250, createdAt: iso(1) },
    ]),
    750
  );
  assert.equal(
    settledThroughSafes([
      { safeId: 'a', amount: 500, createdAt: iso(0) },
      { safeId: 'b', amount: -200, createdAt: iso(1) },
    ]),
    300
  );
  assert.equal(
    settledThroughSafes([
      { safeId: 'a', amount: -500, createdAt: iso(0) },
      { safeId: 'b', amount: -0.5, createdAt: iso(1) },
    ]),
    -500.5
  );
  assert.equal(settledThroughSafes([]), 0);
});
