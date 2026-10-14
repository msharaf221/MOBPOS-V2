-- ============================================================
-- MOBPOS Cloud Auto Sync Schema (v2 - Granular Realtime + Snapshots)
-- ============================================================
--
-- Security model:
-- Every row is owned by the authenticated Supabase user (`owner_id = auth.uid()`).
-- The client must send a Supabase Auth access token or sign in via Supabase Auth.
-- The public anon key alone cannot bypass RLS.
-- `tenant_id` partitions data by store / license key.
-- NEVER expose the service_role key to the Electron / mobile client.
--
-- ============================================================

-- 1. Table: mobpos_stores (Full Store Snapshots & Backup Recovery)
create table if not exists public.mobpos_stores (
  tenant_id text not null,
  store text not null,
  data jsonb not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, store)
);

alter table public.mobpos_stores add column if not exists owner_id uuid;
alter table public.mobpos_stores alter column owner_id set default auth.uid();
alter table public.mobpos_stores enable row level security;

-- Policies for mobpos_stores
drop policy if exists "Users can read own MOBPOS rows" on public.mobpos_stores;
drop policy if exists "Users can insert own MOBPOS rows" on public.mobpos_stores;
drop policy if exists "Users can update own MOBPOS rows" on public.mobpos_stores;
drop policy if exists "Users can delete own MOBPOS rows" on public.mobpos_stores;

create policy "Users can read own MOBPOS rows"
  on public.mobpos_stores for select to authenticated
  using (owner_id = auth.uid());

create policy "Users can insert own MOBPOS rows"
  on public.mobpos_stores for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Users can update own MOBPOS rows"
  on public.mobpos_stores for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Users can delete own MOBPOS rows"
  on public.mobpos_stores for delete to authenticated
  using (owner_id = auth.uid());

create index if not exists mobpos_stores_owner_tenant_idx
  on public.mobpos_stores (owner_id, tenant_id);


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
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (tenant_id, store, record_id)
);

alter table public.mobpos_records add column if not exists owner_id uuid;
alter table public.mobpos_records alter column owner_id set default auth.uid();
alter table public.mobpos_records enable row level security;

-- Policies for mobpos_records
drop policy if exists "Users can read own MOBPOS records" on public.mobpos_records;
drop policy if exists "Users can insert own MOBPOS records" on public.mobpos_records;
drop policy if exists "Users can update own MOBPOS records" on public.mobpos_records;
drop policy if exists "Users can delete own MOBPOS records" on public.mobpos_records;

create policy "Users can read own MOBPOS records"
  on public.mobpos_records for select to authenticated
  using (owner_id = auth.uid());

create policy "Users can insert own MOBPOS records"
  on public.mobpos_records for insert to authenticated
  with check (owner_id = auth.uid());

create policy "Users can update own MOBPOS records"
  on public.mobpos_records for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Users can delete own MOBPOS records"
  on public.mobpos_records for delete to authenticated
  using (owner_id = auth.uid());

-- High-performance indexes for fast queries and catch-up sync
create index if not exists mobpos_records_owner_tenant_idx
  on public.mobpos_records (owner_id, tenant_id);

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
