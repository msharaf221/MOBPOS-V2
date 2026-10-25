// ============================================================
//  تعريفات أنواع نظام المزامنة السحابية اللحظية (Cloud Auto Sync)
// ============================================================

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error' | 'disabled';

export interface SyncConfig {
  url: string;           // https://xxxx.supabase.co
  anonKey: string;       // Public anon key (never use service_role key)
  accessToken?: string;  // Supabase Auth access token
  refreshToken?: string; // Supabase Auth refresh token
  userEmail?: string;    // Supabase Auth account email
  tenantId?: string;     // Unique store/license partition
  /** سر عزل المستأجر (اختياري) يُرَفق كرأس x-tenant-secret — شغّيل فقط مع مخطط RLS الصارم */
  tenantSecret?: string;
  autoSyncEnabled: boolean; // Auto sync on/off toggle
}

export type OutboxAction = 'upsert' | 'delete';

export interface OutboxItem {
  id: string;            // Unique UUID for the outbox task
  tenantId: string;
  store: string;
  recordId: string;
  action: OutboxAction;
  data?: Record<string, unknown>; // Snapshot payload for upsert
  clientUpdatedAt: string; // ISO 8601 timestamp
  clientId: string;      // Unique client device identifier
  retryCount: number;
  lastError?: string;
  createdAt: string;     // ISO 8601 timestamp
}

export interface SyncRecordRow {
  tenant_id: string;
  store: string;
  record_id: string;
  data: Record<string, unknown>;
  version: number;
  client_id: string;
  updated_at: string;
  deleted_at: string | null;
  owner_id?: string;
}

export interface SyncEngineState {
  status: SyncStatus;
  isOnline: boolean;
  pendingCount: number;
  lastSyncedAt: Date | null;
  errorMessage: string | null;
  clientId: string;
  tenantId: string;
  isConfigured: boolean;
  isRealtimeConnected: boolean;
}

export type SyncStateListener = (state: SyncEngineState) => void;

export interface RemoteRecordEvent {
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Partial<SyncRecordRow>;
  oldRecord?: Partial<SyncRecordRow>;
}
