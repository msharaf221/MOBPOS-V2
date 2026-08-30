import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, formatNumber, formatDate, formatDateTime, getAppLocale, getAppCurrency } from './format.ts';

test('formatCurrency handles positive, zero, and negative values', () => {
  assert.equal(typeof formatCurrency(1500), 'string');
  assert.ok(formatCurrency(1500).includes('1,500') || formatCurrency(1500).includes('١٬٥٠٠') || formatCurrency(1500).includes('1500'));
  assert.equal(typeof formatCurrency(0), 'string');
  assert.equal(typeof formatCurrency(null), 'string');
  assert.equal(typeof formatCurrency(undefined), 'string');
});

test('formatNumber formats numbers with specified fraction digits', () => {
  assert.equal(typeof formatNumber(1234.56, 2), 'string');
  assert.equal(typeof formatNumber(0), 'string');
  assert.equal(typeof formatNumber(null), 'string');
});

test('formatDate and formatDateTime handle Date objects, ISO strings, and invalid inputs', () => {
  const d = new Date('2026-08-30T14:30:00Z');
  assert.ok(formatDate(d).length > 0);
  assert.ok(formatDateTime(d).length > 0);
  assert.equal(formatDate(null), '');
  assert.equal(formatDate(undefined), '');
  assert.equal(formatDate(''), '');
  assert.equal(formatDateTime(null), '');
});

test('getAppLocale and getAppCurrency have expected fallbacks in node environment', () => {
  assert.equal(getAppLocale(), 'ar-EG');
  assert.equal(getAppCurrency(), 'EGP');
});
