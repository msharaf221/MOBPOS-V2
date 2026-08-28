/**
 * اختبارات تحويل نتيجة فحص التحديث لدوال نقية.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUpdateCheckMessage,
  formatLastChecked,
} from './updateCheck.ts';

test('dev result is reported as installed-only', () => {
  const msg = buildUpdateCheckMessage({ ok: true, dev: true }, '1.0.2');
  assert.equal(msg.kind, 'dev');
  assert.match(msg.message, /النسخ المثبتة فقط/);
});

test('failure keeps the button retryable', () => {
  const msg = buildUpdateCheckMessage({ ok: false }, '1.0.2');
  assert.equal(msg.kind, 'error');
  assert.match(msg.message, /حاول تاني بعد شوية/);
});

test('update available includes the latest version', () => {
  const msg = buildUpdateCheckMessage(
    { ok: true, updateAvailable: true, currentVersion: '1.0.2', latestVersion: '1.0.3' },
    '1.0.2'
  );
  assert.equal(msg.kind, 'available');
  assert.equal(msg.latestVersion, '1.0.3');
  assert.match(msg.message, /v1\.0\.3/);
  assert.match(msg.message, /تلقائيًا/);
  assert.match(msg.message, /عند إغلاق التطبيق الجاي/);
});

test('no update shows the current version', () => {
  const msg = buildUpdateCheckMessage(
    { ok: true, updateAvailable: false, currentVersion: '1.0.2' },
    '1.0.2'
  );
  assert.equal(msg.kind, 'up-to-date');
  assert.match(msg.message, /v1\.0\.2/);
  assert.match(msg.message, /أحدث إصدار/);
});

test('missing latestVersion with available update is handled defensively', () => {
  const msg = buildUpdateCheckMessage(
    { ok: true, updateAvailable: true },
    '1.0.2'
  );
  assert.equal(msg.kind, 'unknown');
  assert.match(msg.message, /تم الفحص/);
});

test('formatLastChecked returns empty for invalid date', () => {
  assert.equal(formatLastChecked(new Date(NaN)), '');
  assert.match(formatLastChecked(new Date('2026-08-28T14:30:00Z')), /:/);
});
