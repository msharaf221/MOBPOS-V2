import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEvents, roleToArabic, categoryToArabic } from './auditLogger.ts';
import type { User } from '../types/index.ts';

const dummyUser: User = {
  id: 'u1',
  name: 'أحمد محمود',
  username: 'ahmed',
  password: 'hash',
  role: 'staff',
  createdAt: '2026-01-01T00:00:00.000Z',
};

test('roleToArabic and categoryToArabic translate correctly to friendly Arabic', () => {
  assert.equal(roleToArabic('admin'), 'المدير');
  assert.equal(roleToArabic('staff'), 'كاشير/فني');
  assert.equal(categoryToArabic('sales'), 'مبيعات');
  assert.equal(categoryToArabic('maintenance'), 'صيانة');
  assert.equal(categoryToArabic('finance'), 'المالية والخزنة');
});

test('saleCreated audit event produces clear Arabic description with customer and amounts', () => {
  const event = auditEvents.saleCreated(dummyUser, 'INV-2026-001', 1500, 1500, 'عمرو دياب', 'الخزنة الرئيسية');
  assert.equal(event.category, 'sales');
  assert.equal(event.severity, 'success');
  assert.equal(event.userId, 'u1');
  assert.equal(event.userName, 'أحمد محمود');
  assert.match(event.description, /أحمد محمود/);
  assert.match(event.description, /INV-2026-001/);
  assert.match(event.description, /عمرو دياب/);
  assert.match(event.description, /الخزنة الرئيسية/);
});

test('inventoryDeleted produces a warning/danger alert for sensitive action', () => {
  const event = auditEvents.inventoryDeleted(dummyUser, 'شاشة آيفون 13');
  assert.equal(event.category, 'inventory');
  assert.equal(event.severity, 'danger');
  assert.match(event.description, /شاشة آيفون 13/);
  assert.match(event.description, /تنبيه حرج/);
});

test('authLogin generates success and failed login records', () => {
  const success = auditEvents.authLogin(dummyUser, 'ahmed', true, '192.168.1.15');
  assert.equal(success.category, 'auth');
  assert.equal(success.severity, 'info');
  assert.match(success.description, /تسجيل الدخول/);

  const failure = auditEvents.authLogin(null, 'hacker', false, '192.168.1.50');
  assert.equal(failure.category, 'auth');
  assert.equal(failure.severity, 'danger');
  assert.match(failure.description, /محاولة دخول فاشلة/);
});
