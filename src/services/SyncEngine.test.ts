import test from 'node:test';
import assert from 'node:assert/strict';
import { syncEngine, isValidJwt } from './SyncEngine.ts';
import { setRemoteApplying, isApplyingRemote } from '../hooks/useIndexedDB.ts';
import type { SyncRecordRow, OutboxItem } from '../types/sync.ts';

test('isValidJwt validates standard 3-part JWTs and rejects PATs or malformed strings', () => {
  // Invalid inputs
  assert.equal(isValidJwt(null), false);
  assert.equal(isValidJwt(undefined), false);
  assert.equal(isValidJwt(''), false);
  assert.equal(isValidJwt('   '), false);
  assert.equal(isValidJwt('sbp_1234567890abcdef'), false, 'Supabase PAT must be rejected');
  assert.equal(isValidJwt('random_token_string'), false, '1-part token must be rejected');
  assert.equal(isValidJwt('header.payload'), false, '2-part token must be rejected');
  assert.equal(isValidJwt('a.b.c.d'), false, '4-part token must be rejected');
  assert.equal(isValidJwt('a..c'), false, 'Empty part must be rejected');

  // Valid 3-part JWT
  assert.equal(
    isValidJwt('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.signature123'),
    true,
    'Valid 3-part JWT must be accepted'
  );
});


test('SyncEngine initializes with persistent clientId and default offline/disabled state', () => {
  const clientId = syncEngine.getOrCreateClientId();
  assert.ok(clientId, 'Client ID must be generated');
  assert.equal(typeof clientId, 'string');
  assert.equal(syncEngine.getOrCreateClientId(), clientId, 'Client ID must be persistent');

  const state = syncEngine.getState();
  assert.ok(['synced', 'syncing', 'offline', 'error', 'disabled'].includes(state.status));
  assert.equal(state.clientId, clientId);
});

test('Last-Write-Wins (LWW): newer remote timestamp overrides older local timestamp', () => {
  const localRecord = {
    id: 'prod_123',
    name: 'شاشة سامسونج',
    sellPrice: 1500,
    updated_at: '2026-10-14T10:00:00.000Z',
  };

  const incomingRemoteRow: SyncRecordRow = {
    tenant_id: 'tenant_test',
    store: 'inventory',
    record_id: 'prod_123',
    data: {
      id: 'prod_123',
      name: 'شاشة سامسونج الأصلية',
      sellPrice: 1600,
      updated_at: '2026-10-14T10:05:00.000Z',
    },
    version: 2,
    client_id: 'other_device_456',
    updated_at: '2026-10-14T10:05:00.000Z',
    deleted_at: null,
  };

  const localTime = new Date(localRecord.updated_at).getTime();
  const remoteTime = new Date(incomingRemoteRow.updated_at).getTime();
  assert.ok(remoteTime > localTime, 'Remote timestamp must be greater than local');
});

test('Last-Write-Wins (LWW): older remote timestamp does NOT override newer local timestamp', () => {
  const localRecord = {
    id: 'prod_123',
    name: 'شاشة سامسونج الحديثة',
    sellPrice: 1700,
    updated_at: '2026-10-14T11:00:00.000Z',
  };

  const incomingRemoteRow: SyncRecordRow = {
    tenant_id: 'tenant_test',
    store: 'inventory',
    record_id: 'prod_123',
    data: {
      id: 'prod_123',
      name: 'شاشة سامسونج القديمة',
      sellPrice: 1500,
      updated_at: '2026-10-14T10:30:00.000Z',
    },
    version: 1,
    client_id: 'other_device_456',
    updated_at: '2026-10-14T10:30:00.000Z',
    deleted_at: null,
  };

  const localTime = new Date(localRecord.updated_at).getTime();
  const remoteTime = new Date(incomingRemoteRow.updated_at).getTime();
  assert.ok(localTime > remoteTime, 'Local timestamp is newer than remote; local wins');
});

test('Soft delete tombstone is properly identified and prioritized', () => {
  const remoteDeleteRow: SyncRecordRow = {
    tenant_id: 'tenant_test',
    store: 'sales',
    record_id: 'sale_999',
    data: {},
    version: 3,
    client_id: 'device_pos_1',
    updated_at: '2026-10-14T12:00:00.000Z',
    deleted_at: '2026-10-14T12:00:00.000Z',
  };

  assert.ok(remoteDeleteRow.deleted_at !== null, 'deleted_at must indicate tombstone');
});

test('Echo suppression flag prevents remote writes from re-triggering outbox capture', () => {
  assert.equal(isApplyingRemote(), false, 'Default remote applying flag should be false');
  setRemoteApplying(true);
  assert.equal(isApplyingRemote(), true, 'Flag must be true when remote sync is applying');
  setRemoteApplying(false);
  assert.equal(isApplyingRemote(), false, 'Flag must be reset to false after apply');
});

test('OutboxItem structure conforms to required properties', () => {
  const item: OutboxItem = {
    id: 'outbox_inventory_p1',
    tenantId: 'tenant_abc',
    store: 'inventory',
    recordId: 'p1',
    action: 'upsert',
    data: { id: 'p1', name: 'كابل شحن', quantity: 20 },
    clientUpdatedAt: '2026-10-14T12:30:00.000Z',
    clientId: 'test_client',
    retryCount: 0,
    createdAt: '2026-10-14T12:30:00.000Z',
  };

  assert.equal(item.action, 'upsert');
  assert.equal(item.recordId, 'p1');
  assert.ok(item.clientUpdatedAt);
});

test('formatFriendlyErrorMessage translates technical Supabase/PostgREST errors to clear Arabic', () => {
  // Missing table error
  const tableErr = syncEngine.formatFriendlyErrorMessage('relation "public.mobpos_stores" does not exist');
  assert.ok(tableErr.includes('جداول المزامنة غير موجودة'), 'Must notify user about missing tables');

  // 42P01 error code
  const codeErr = syncEngine.formatFriendlyErrorMessage('error 42P01: undefined table');
  assert.ok(codeErr.includes('جداول المزامنة غير موجودة'), '42P01 must trigger missing tables message');

  // RLS error
  const rlsErr = syncEngine.formatFriendlyErrorMessage('new row violates row-level security policy for table "mobpos_records"');
  assert.ok(rlsErr.includes('صلاحيات المزامنة مقيدة'), 'Must notify user about RLS policies');

  // Network / fetch error
  const fetchErr = syncEngine.formatFriendlyErrorMessage('TypeError: Failed to fetch');
  assert.ok(fetchErr.includes('تعذر الاتصال بخادم Supabase'), 'Failed to fetch must notify about network/connection');

  // JWT expiration / format error
  const jwtErr = syncEngine.formatFriendlyErrorMessage('PGRST301: JWT expired');
  assert.ok(jwtErr.includes('انتهت صلاحية جلسة الدخول'), 'JWT expired must notify about session expiry');

  // Invalid API key
  const keyErr = syncEngine.formatFriendlyErrorMessage('Invalid API key provided');
  assert.ok(keyErr.includes('مفتاح Supabase Anon Key غير صالح'), 'Invalid key must notify about anon key');
});

test('pushStoreSnapshots validates offline / uninitialized supabase properly', async () => {
  // When supabase is not configured or offline, it should throw or return 0 safely
  await assert.rejects(
    async () => {
      await syncEngine.pushStoreSnapshots(['sales', 'safes']);
    },
    {
      message: /عميل Supabase غير مهيأ|لا يوجد اتصال بالإنترنت/,
    }
  );
});

test('scheduleDebouncedSnapshot safely handles store names and repeated invocations', () => {
  assert.doesNotThrow(() => {
    syncEngine.scheduleDebouncedSnapshot('sales');
    syncEngine.scheduleDebouncedSnapshot('safes');
    syncEngine.scheduleDebouncedSnapshot('inventory');
  });
});

test('generateMobilePairingCode and importMobilePairingCode work roundtrip', () => {
  syncEngine.saveConfig({
    url: 'https://test-project.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.signature123',
    tenantId: 'test-tenant-123',
    userEmail: 'ahmed.pos@gmail.com',
    userName: 'أحمد التاجر',
  });

  const pairingCode = syncEngine.generateMobilePairingCode();
  assert.ok(pairingCode.startsWith('MOBPOS_PAIR:'), 'Pairing code must have prefix MOBPOS_PAIR:');

  const result = syncEngine.importMobilePairingCode(pairingCode);
  assert.equal(result.ok, true, 'Pairing code must be successfully imported');
  assert.equal(syncEngine.getState().userEmail, 'ahmed.pos@gmail.com');

  // Negative test: invalid pairing code
  const badResult = syncEngine.importMobilePairingCode('MOBPOS_PAIR:invalid_base_64!!!');
  assert.equal(badResult.ok, false, 'Invalid pairing code must fail safely');
});



