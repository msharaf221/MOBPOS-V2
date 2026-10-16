/**
 * MOBPOS Cloud Auto Sync Schema (v2.1 - Universal Compatibility)
 * Script to be run in Supabase SQL Editor.
 */
export const SUPABASE_SCHEMA_SQL = `-- ============================================================
-- MOBPOS Cloud Auto Sync Schema (v2.1 - Universal Compatibility)
-- ============================================================

-- Step 1: Ensure required extensions exist
create extension if not exists "uuid-ossp";

-- Step 2: Create Table: mobpos_stores (Full Store Snapshots)
create table if not exists public.mobpos_stores (
  tenant_id text not null,
  store text not null,
  data jsonb not null default '[]'::jsonb,
  owner_id uuid default null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, store)
);

alter table public.mobpos_stores add column if not exists data jsonb not null default '[]'::jsonb;
alter table public.mobpos_stores add column if not exists owner_id uuid default null;
alter table public.mobpos_stores add column if not exists updated_at timestamptz not null default now();
alter table public.mobpos_stores alter column owner_id drop not null;
alter table public.mobpos_stores replica identity full;

create index if not exists mobpos_stores_tenant_idx
  on public.mobpos_stores (tenant_id);

-- Step 3: Create Table: mobpos_records (Granular Real-time Per-Record Sync)
create table if not exists public.mobpos_records (
  tenant_id text not null,
  store text not null,
  record_id text not null,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  client_id text not null default 'unknown',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz default null,
  owner_id uuid default null,
  primary key (tenant_id, store, record_id)
);

alter table public.mobpos_records add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.mobpos_records add column if not exists version bigint not null default 1;
alter table public.mobpos_records add column if not exists client_id text not null default 'unknown';
alter table public.mobpos_records add column if not exists updated_at timestamptz not null default now();
alter table public.mobpos_records add column if not exists deleted_at timestamptz default null;
alter table public.mobpos_records add column if not exists owner_id uuid default null;
alter table public.mobpos_records alter column owner_id drop not null;
alter table public.mobpos_records replica identity full;

create index if not exists mobpos_records_lookup_idx
  on public.mobpos_records (tenant_id, store, updated_at desc);

create index if not exists mobpos_records_sync_pull_idx
  on public.mobpos_records (tenant_id, updated_at desc);

create index if not exists mobpos_records_record_idx
  on public.mobpos_records (tenant_id, record_id);

create index if not exists mobpos_records_deleted_idx
  on public.mobpos_records (tenant_id, deleted_at)
  where deleted_at is not null;

-- Step 4: Grant Permissions to API Roles (anon, authenticated, service_role)
grant usage on schema public to anon, authenticated, service_role;
grant all on table public.mobpos_stores to anon, authenticated, service_role;
grant all on table public.mobpos_records to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Step 5: Configure Row Level Security (RLS) with Permissive Policies
alter table public.mobpos_stores enable row level security;
alter table public.mobpos_records enable row level security;

drop policy if exists "mobpos_stores_allow_all" on public.mobpos_stores;
drop policy if exists "mobpos_stores_policy" on public.mobpos_stores;
drop policy if exists "Allow all operations for mobpos_stores" on public.mobpos_stores;
drop policy if exists "Enable all operations for all users" on public.mobpos_stores;

create policy "mobpos_stores_allow_all"
  on public.mobpos_stores
  for all
  to anon, authenticated, service_role
  using (true)
  with check (true);

drop policy if exists "mobpos_records_allow_all" on public.mobpos_records;
drop policy if exists "mobpos_records_policy" on public.mobpos_records;
drop policy if exists "Allow all operations for mobpos_records" on public.mobpos_records;
drop policy if exists "Enable all operations for all users" on public.mobpos_records;

create policy "mobpos_records_allow_all"
  on public.mobpos_records
  for all
  to anon, authenticated, service_role
  using (true)
  with check (true);

-- Step 6: Supabase Realtime Publication Setup
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
    null;
end $$;

-- Step 7: Reload PostgREST Schema Cache
notify pgrst, 'reload schema';
`;
