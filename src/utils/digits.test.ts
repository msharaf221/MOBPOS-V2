import test from 'node:test';
import assert from 'node:assert/strict';
import { hasLocalizedDigits, normalizeDigits, parseLocalizedNumber } from './digits.ts';

test('normalizeDigits converts Eastern Arabic digits', () => {
  assert.equal(normalizeDigits('١٢٣٤٥٦٧٨٩٠'), '1234567890');
});

test('normalizeDigits converts Extended Arabic-Indic (Persian) digits', () => {
  assert.equal(normalizeDigits('۱۲۳۴۵۶۷۸۹۰'), '1234567890');
});

test('normalizeDigits converts Arabic decimal separator and drops thousands separator', () => {
  assert.equal(normalizeDigits('١٬٥٠٠٫٧٥'), '1500.75');
});

test('normalizeDigits leaves mixed Arabic text intact except digits', () => {
  assert.equal(normalizeDigits('كود ٤٢ abc'), 'كود 42 abc');
});

test('normalizeDigits returns plain ASCII unchanged (same reference path)', () => {
  assert.equal(normalizeDigits('123'), '123');
  assert.equal(normalizeDigits(''), '');
});

test('hasLocalizedDigits detects Arabic digits', () => {
  assert.equal(hasLocalizedDigits('سعر ٥٠'), true);
  assert.equal(hasLocalizedDigits('price 50'), false);
  assert.equal(hasLocalizedDigits(null), false);
  assert.equal(hasLocalizedDigits(undefined), false);
});

test('parseLocalizedNumber parses Arabic-Indic numerals', () => {
  assert.equal(parseLocalizedNumber('٢٥٠٫٥'), 250.5);
});
