import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCrashReport, isRecoverableError } from './errorHandling.ts';

test('formatCrashReport formats error and stack trace cleanly', () => {
  const err = new Error('Database connection failed');
  const compStack = '\n    in POS\n    in App';
  const report = formatCrashReport(err, compStack);

  assert.equal(report.errorName, 'Error');
  assert.equal(report.errorMessage, 'Database connection failed');
  assert.ok(report.stack && report.stack.includes('Database connection failed'));
  assert.equal(report.componentStack, compStack);
  assert.ok(report.rawReport.includes('MOBPOS Crash Report'));
  assert.ok(report.rawReport.includes('Database connection failed'));
  assert.ok(report.rawReport.includes(compStack));
});

test('formatCrashReport handles null or undefined errors gracefully', () => {
  const report = formatCrashReport(null);

  assert.equal(report.errorName, 'Error');
  assert.equal(report.errorMessage, 'Unknown error occurred');
  assert.ok(report.rawReport.includes('Unknown error occurred'));
});

test('isRecoverableError distinguishes recoverable UI errors from fatal stack overflows', () => {
  assert.equal(isRecoverableError(new Error('Syntax or render mismatch')), true);
  assert.equal(isRecoverableError(new TypeError('Cannot read properties of undefined')), true);

  const fatalError = new RangeError('Maximum call stack size exceeded');
  assert.equal(isRecoverableError(fatalError), false);
});
