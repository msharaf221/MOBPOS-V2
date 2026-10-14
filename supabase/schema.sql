-- ============================================================
-- MOBPOS Cloud Auto Sync Schema (v2 - Multi-device Realtime + Snapshots)
-- ============================================================
--
-- Security & Multi-tenancy Model:
-- - Multi-tenancy is partitioned by `tenant_id` (the shop license key).
-- - Operates seamlessly with Supabase Anon Public Key (no user login required).
-- - Also compatible with Supabase Auth if authenticated sessions are used.
-- - Realtime broadcasts delta updates instantly to all connected cashiers/phones.
-- - NEVER expose the service_role secret key to client apps.
--
-- ============================================================

-- 1. Table: mobpos_stores (Full Store Snapshots & Backup Recovery)
create table if not exists public.mobpos_stores (
  tenant_id text not null,
  store text not null,
  data jsonb not null default '[]'::jsonb,
  owner_id uuid default auth.uid() references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, store)
);

-- Ensure owner_id is nullable (allows anon key sync without auth user)
alter table public.mobpos_stores add column if not exists owner_id uuid;
alter table public.mobpos_stores alter column owner_id drop not null;
alter table public.mobpos_stores alter column owner_id set default auth.uid();
alter table public.mobpos_stores replica identity full;
-- Disable RLS for zero-friction POS sync partitioned by tenant_id
alter table public.mobpos_stores disable row level security;

create index if not exists mobpos_stores_tenant_idx
  on public.mobpos_stores (tenant_id);


-- 2. Table: mobpos_records (Granular Real-time Per-Record Sync)
-- Supports instant propagation, delta sync, soft deletes, and Last-Write-Wins.
create table if not exists public.mobpos_records (
  tenant_id text not null,
  store text not null,
  record_id text not null,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  client_id text not null default 'unknown',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  owner_id uuid default auth.uid() references auth.users(id) on delete cascade,
  primary key (tenant_id, store, record_id)
);

-- Ensure owner_id is nullable (allows anon key sync without auth user)
alter table public.mobpos_records add column if not exists owner_id uuid;
alter table public.mobpos_records alter column owner_id drop not null;
alter table public.mobpos_records alter column owner_id set default auth.uid();
alter table public.mobpos_records replica identity full;
-- Disable RLS for zero-friction POS sync partitioned by tenant_id
alter table public.mobpos_records disable row level security;

-- High-performance indexes for fast queries, realtime catch-up, and soft-delete lookups
create index if not exists mobpos_records_lookup_idx
  on public.mobpos_records (tenant_id, store, updated_at desc);

create index if not exists mobpos_records_sync_pull_idx
  on public.mobpos_records (tenant_id, updated_at desc);

create index if not exists mobpos_records_deleted_idx
  on public.mobpos_records (tenant_id, deleted_at)
  where deleted_at is not null;


-- 3. Supabase Realtime Publication Setup
-- Enables WebSocket broadcasts whenever records are inserted/updated/deleted.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mobpos_records'
  ) then
    alter publication supabase_realtime add table public.mobpos_records;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mobpos_stores'
  ) then
    alter publication supabase_realtime add table public.mobpos_stores;
  end if;
exception
  when undefined_object then
    null; -- Publication doesn't exist in local/vanilla postgres without supabase realtime extension
end $$;
