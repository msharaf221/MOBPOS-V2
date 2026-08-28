/**
 * اختبارات حالة الترخيص النقية — تعمل على Node بدون React.
 *
 *  `npm test` (بعد تحديث package.json) يشغّل ده مع باقي الاختبارات.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getLicenseStatus,
  getLicenseDaysRemaining,
  formatLicenseExpiry,
  formatLicenseStatus,
} from './status.ts';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-08-28T12:00:00.000Z');
const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();

test('lifetime license is always active and has no expiry text', () => {
  assert.equal(getLicenseStatus('', true, now), 'active');
  assert.equal(getLicenseStatus(iso(-10 * DAY), true, now), 'active');
  assert.equal(getLicenseDaysRemaining('', true, now), Infinity);
  assert.equal(formatLicenseExpiry('', true), 'مدى الحياة');
});

test('active license far from expiry is active', () => {
  const expiresAt = iso(30 * DAY);
  assert.equal(getLicenseStatus(expiresAt, false, now), 'active');
  assert.equal(getLicenseDaysRemaining(expiresAt, false, now), 30);
  assert.equal(formatLicenseStatus(getLicenseStatus(expiresAt, false, now)), 'شغّالة');
});

test('license expiring within 7 days is expiring', () => {
  assert.equal(getLicenseStatus(iso(7 * DAY), false, now), 'expiring');
  assert.equal(getLicenseStatus(iso(1 * DAY), false, now), 'expiring');
  assert.equal(getLicenseStatus(iso(6 * DAY), false, now), 'expiring');
  assert.equal(formatLicenseStatus(getLicenseStatus(iso(2 * DAY), false, now)), 'قرب تنتهي');
});

test('expired license is expired', () => {
  assert.equal(getLicenseStatus(iso(-1 * DAY), false, now), 'expired');
  assert.equal(getLicenseStatus(iso(-30 * DAY), false, now), 'expired');
  assert.equal(formatLicenseStatus('expired'), 'منتهية');
  assert.equal(getLicenseDaysRemaining(iso(-1 * DAY), false, now), 0);
});

test('missing or invalid expiry falls back safely', () => {
  assert.equal(getLicenseStatus('', false, now), 'active');
  assert.equal(getLicenseStatus('not-a-date', false, now), 'active');
  assert.equal(getLicenseDaysRemaining('not-a-date', false, now), 0);
});
