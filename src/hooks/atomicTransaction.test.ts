import test from 'node:test';
import assert from 'node:assert/strict';
import { diffStore, type MultiStoreDelta } from './useIndexedDB.ts';

test('Multi-store atomic deltas compute correct per-store diffs', () => {
  const inventoryPrev = [
    { id: 'inv1', name: 'Phone Case', quantity: 10 },
    { id: 'inv2', name: 'Charger', quantity: 5 },
  ];
  const inventoryNext = [
    { id: 'inv1', name: 'Phone Case', quantity: 9 }, // deducted 1
    inventoryPrev[1], // unchanged
  ];

  const safesPrev = [
    { id: 'safe1', name: 'Main Safe', balance: 1000 },
  ];
  const safesNext = [
    { id: 'safe1', name: 'Main Safe', balance: 1150 }, // added 150
  ];

  const salesPrev: Array<{ id: string; total: number }> = [];
  const salesNext = [
    { id: 'sale1', total: 150 },
  ];

  const deltas: MultiStoreDelta[] = [
    { storeName: 'inventory', previous: inventoryPrev, next: inventoryNext },
    { storeName: 'safes', previous: safesPrev, next: safesNext },
    { storeName: 'sales', previous: salesPrev, next: salesNext },
  ];

  assert.equal(deltas.length, 3);

  const invDiff = diffStore(deltas[0].previous, deltas[0].next);
  assert.equal(invDiff.addedOrChanged.length, 1);
  assert.equal(invDiff.addedOrChanged[0].id, 'inv1');
  assert.equal(invDiff.removedIds.length, 0);

  const safeDiff = diffStore(deltas[1].previous, deltas[1].next);
  assert.equal(safeDiff.addedOrChanged.length, 1);
  assert.equal(safeDiff.addedOrChanged[0].id, 'safe1');

  const saleDiff = diffStore(deltas[2].previous, deltas[2].next);
  assert.equal(saleDiff.addedOrChanged.length, 1);
  assert.equal(saleDiff.addedOrChanged[0].id, 'sale1');
});

test('Atomic transaction simulator aborts all stores when any store operation fails', async () => {
  // Simulating an atomic multi-store transactional engine
  const diskState: Record<string, Map<string, unknown>> = {
    inventory: new Map([['item1', { id: 'item1', qty: 10 }]]),
    safes: new Map([['safe1', { id: 'safe1', balance: 500 }]]),
    sales: new Map(),
  };

  interface MockTransaction {
    stores: string[];
    stagedWrites: Array<{ store: string; action: 'put' | 'delete' | 'clear'; id?: string; record?: unknown }>;
    aborted: boolean;
    committed: boolean;
  }

  function createTransaction(storeNames: string[]): MockTransaction {
    return {
      stores: storeNames,
      stagedWrites: [],
      aborted: false,
      committed: false,
    };
  }

  function stageWrite(tx: MockTransaction, store: string, action: 'put' | 'delete' | 'clear', id?: string, record?: unknown) {
    if (tx.aborted) throw new Error('Transaction is already aborted');
    tx.stagedWrites.push({ store, action, id, record });
  }

  function commitTransaction(tx: MockTransaction) {
    if (tx.aborted) throw new Error('Cannot commit aborted transaction');
    for (const write of tx.stagedWrites) {
      const s = diskState[write.store];
      if (!s) continue;
      if (write.action === 'put' && write.id && write.record) {
        s.set(write.id, write.record);
      } else if (write.action === 'delete' && write.id) {
        s.delete(write.id);
      } else if (write.action === 'clear') {
        s.clear();
      }
    }
    tx.committed = true;
  }

  function abortTransaction(tx: MockTransaction) {
    tx.stagedWrites = [];
    tx.aborted = true;
  }

  // Execute a multi-store transaction that FAILS mid-way
  const tx = createTransaction(['inventory', 'safes', 'sales']);
  let failed = false;

  try {
    // 1. Stage inventory deduction
    stageWrite(tx, 'inventory', 'put', 'item1', { id: 'item1', qty: 9 });

    // 2. Stage safe deposit
    stageWrite(tx, 'safes', 'put', 'safe1', { id: 'safe1', balance: 600 });

    // 3. Simulated failure during sales record creation
    throw new Error('Disk quota exceeded or database constraint violated');

    // 4. Would have staged sale write...
    // stageWrite(tx, 'sales', 'put', 'sale1', { id: 'sale1', total: 100 });
  } catch {
    failed = true;
    abortTransaction(tx);
  }

  assert.equal(failed, true);
  assert.equal(tx.aborted, true);
  assert.equal(tx.committed, false);

  // Verify disk state is completely untouched (atomic rollback)
  assert.deepEqual(diskState.inventory.get('item1'), { id: 'item1', qty: 10 });
  assert.deepEqual(diskState.safes.get('safe1'), { id: 'safe1', balance: 500 });
  assert.equal(diskState.sales.size, 0);

  // Now verify successful commit path
  const successTx = createTransaction(['inventory', 'safes', 'sales']);
  stageWrite(successTx, 'inventory', 'put', 'item1', { id: 'item1', qty: 9 });
  stageWrite(successTx, 'safes', 'put', 'safe1', { id: 'safe1', balance: 600 });
  stageWrite(successTx, 'sales', 'put', 'sale1', { id: 'sale1', total: 100 });
  commitTransaction(successTx);

  assert.equal(successTx.committed, true);
  assert.equal(successTx.aborted, false);
  assert.deepEqual(diskState.inventory.get('item1'), { id: 'item1', qty: 9 });
  assert.deepEqual(diskState.safes.get('safe1'), { id: 'safe1', balance: 600 });
  assert.deepEqual(diskState.sales.get('sale1'), { id: 'sale1', total: 100 });
});
