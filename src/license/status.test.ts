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
  isClockTampered,
  validateLicenseKeyFormat,
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

test('clock tampering is detected when current time is earlier than last known recorded time', () => {
  const lastRecordedTime = '2026-08-28T12:00:00.000Z';
  const tamperedNow = new Date('2026-08-20T10:00:00.000Z'); // 8 days earlier!
  const normalNow = new Date('2026-08-28T12:10:00.000Z'); // 10 minutes later (normal)
  const minorDriftNow = new Date('2026-08-28T11:58:00.000Z'); // 2 minutes earlier (within 5m tolerance)

  assert.equal(isClockTampered(lastRecordedTime, tamperedNow), true);
  assert.equal(isClockTampered(lastRecordedTime, normalNow), false);
  assert.equal(isClockTampered(lastRecordedTime, minorDriftNow), false);

  // If clock tampering occurs, getLicenseStatus returns expired even if expiry is far in future
  const farFutureExpiry = '2027-01-01T00:00:00.000Z';
  assert.equal(getLicenseStatus(farFutureExpiry, false, tamperedNow, lastRecordedTime), 'expired');
  assert.equal(getLicenseStatus(farFutureExpiry, false, normalNow, lastRecordedTime), 'active');
});

test('malformed and corrupted license keys are rejected by validateLicenseKeyFormat', () => {
  assert.equal(validateLicenseKeyFormat('').valid, false);
  assert.equal(validateLicenseKeyFormat(null).valid, false);
  assert.equal(validateLicenseKeyFormat('not-a-key').valid, false);
  assert.equal(validateLicenseKeyFormat('MOBPOS.onlytwo.parts').valid, false);
  assert.equal(validateLicenseKeyFormat('WRONGPREFIX.payload.signature').valid, false);
  assert.equal(validateLicenseKeyFormat('MOBPOS2.invalid spaces.signature').valid, false);
  assert.equal(validateLicenseKeyFormat('MOBPOS2.payload!@#.signature').valid, false);

  // Valid structure
  const validKey = 'MOBPOS2.eyJpZCI6IjEyMyJ9.c2lnbmF0dXJlMQ';
  assert.equal(validateLicenseKeyFormat(validKey).valid, true);
});
