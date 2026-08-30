import test from 'node:test';
import assert from 'node:assert/strict';
import { diffStore } from './useIndexedDB.ts';

test('diffStore identifies newly added items and removed items', () => {
  const previous = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
  ];
  const next = [
    previous[0], // unchanged reference
    { id: '3', name: 'Item 3' }, // new item
  ];

  const { addedOrChanged, removedIds } = diffStore(previous, next);
  assert.deepEqual(removedIds, ['2']);
  assert.equal(addedOrChanged.length, 1);
  assert.equal(addedOrChanged[0].id, '3');
});

test('diffStore detects modified items when given a new object reference (copy-on-write)', () => {
  const item1 = { id: '1', name: 'Item 1', price: 100 };
  const item2 = { id: '2', name: 'Item 2', price: 200 };
  const previous = [item1, item2];

  // Modified item2 with copy-on-write
  const updatedItem2 = { ...item2, price: 250 };
  const next = [item1, updatedItem2];

  const { addedOrChanged, removedIds } = diffStore(previous, next);
  assert.deepEqual(removedIds, []);
  assert.equal(addedOrChanged.length, 1);
  assert.equal(addedOrChanged[0].id, '2');
  assert.equal(addedOrChanged[0].price, 250);
});

test('diffStore ignores in-place mutations that retain the same object reference', () => {
  const item1 = { id: '1', name: 'Item 1', quantity: 5 };
  const previous = [item1];

  // In-place mutation (anti-pattern)
  (item1 as { quantity: number }).quantity = 10;
  const next = [item1];

  const { addedOrChanged, removedIds } = diffStore(previous, next);
  // Because reference did not change, diffStore considers it untouched
  assert.equal(addedOrChanged.length, 0);
  assert.equal(removedIds.length, 0);
});

test('copy-on-write batch updates produce clean diffs for sales and waste', () => {
  const imeiList = [
    { id: 'u1', imei1: '111', status: 'available' },
    { id: 'u2', imei2: '222', status: 'available' },
    { id: 'u3', imei1: '333', status: 'available' },
  ];

  // Batch update 2 units to sold
  const soldMap = new Map([
    ['u1', { status: 'sold' }],
    ['u2', { status: 'sold' }],
  ]);

  const nextImeiList = imeiList.map(u => {
    const patch = soldMap.get(u.id);
    return patch ? { ...u, ...patch } : u;
  });

  const diff = diffStore(imeiList, nextImeiList);
  assert.equal(diff.removedIds.length, 0);
  assert.equal(diff.addedOrChanged.length, 2);
  assert.deepEqual(diff.addedOrChanged.map(u => u.id), ['u1', 'u2']);
  assert.equal(nextImeiList[2], imeiList[2]); // u3 unchanged reference
});
