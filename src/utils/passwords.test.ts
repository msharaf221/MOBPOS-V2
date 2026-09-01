import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPasswordForStorage, verifyLoginPassword } from './passwords.ts';

// ============================================================
//  حماية تسجيل الدخول من الحسابات بدون كلمة سر
// ------------------------------------------------------------
//  كان آخر سطر في verifyLoginPassword بيقارن النص بالنص مباشرة
//  (توافق مع الحسابات القديمة جداً)، فحساب كلمة سره '' — وده ممكن
//  ييجي من نسخة احتياطية قديمة أو ملف معدّل — كان بيدخل بكلمة سر
//  فاضية.
// ============================================================

test('كلمة سر فاضية لا تدخل على حساب كلمة سره فاضية', async () => {
  assert.equal(await verifyLoginPassword('', ''), false);
});

test('كلمة سر فاضية لا تدخل على حساب له كلمة سر حقيقية', async () => {
  const stored = await hashPasswordForStorage('SuperSecret123');
  assert.equal(await verifyLoginPassword('', stored), false);
});

test('أي كلمة سر لا تدخل على حساب مخزّن بدون كلمة سر', async () => {
  assert.equal(await verifyLoginPassword('anything', ''), false);
});

test('كلمة السر الصحيحة لسه بتدخل عادي (PBKDF2)', async () => {
  const stored = await hashPasswordForStorage('SuperSecret123');
  assert.equal(await verifyLoginPassword('SuperSecret123', stored), true);
  assert.equal(await verifyLoginPassword('SuperSecret124', stored), false);
});

test('الحسابات القديمة بنص عادي لسه بتشتغل (توافق رجعي)', async () => {
  assert.equal(await verifyLoginPassword('admin123', 'admin123'), true);
  assert.equal(await verifyLoginPassword('wrong', 'admin123'), false);
});
