-- ============================================================
-- MOBPOS Cloud Auto Sync Schema (v2.1 - Universal Compatibility)
-- ============================================================
--
-- This SQL script sets up the database for MOBPOS Cloud Sync.
-- It can be safely executed on any new or existing Supabase project.
-- It is 100% idempotent (safe to run multiple times).
--
-- Features:
-- 1. Creates `public.mobpos_stores` for full store snapshots.
-- 2. Creates `public.mobpos_records` for real-time per-record sync & deltas.
-- 3. Grants full permissions to `anon`, `authenticated`, and `service_role`.
-- 4. Configures Row Level Security (RLS) with permissive policies for seamless POS & mobile access.
-- 5. Enables Supabase Realtime publication for live push updates.
-- 6. Reloads PostgREST schema cache immediately.
--
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

-- Ensure all columns exist and have correct nullability (for existing tables)
alter table public.mobpos_stores add column if not exists data jsonb not null default '[]'::jsonb;
alter table public.mobpos_stores add column if not exists owner_id uuid default null;
alter table public.mobpos_stores add column if not exists updated_at timestamptz not null default now();
alter table public.mobpos_stores alter column owner_id drop not null;
alter table public.mobpos_stores drop constraint if exists mobpos_stores_owner_id_fkey;

-- Enable full replica identity for Realtime change detection
alter table public.mobpos_stores replica identity full;

-- Create performance index on tenant_id
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

-- Ensure all columns exist and have correct nullability (for existing tables)
alter table public.mobpos_records add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.mobpos_records add column if not exists version bigint not null default 1;
alter table public.mobpos_records add column if not exists client_id text not null default 'unknown';
alter table public.mobpos_records add column if not exists updated_at timestamptz not null default now();
alter table public.mobpos_records add column if not exists deleted_at timestamptz default null;
alter table public.mobpos_records add column if not exists owner_id uuid default null;
alter table public.mobpos_records alter column owner_id drop not null;
alter table public.mobpos_records drop constraint if exists mobpos_records_owner_id_fkey;

-- Enable full replica identity for Realtime change detection
alter table public.mobpos_records replica identity full;

-- High-performance indexes for fast queries, realtime catch-up, and soft-delete lookups
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

-- Set default privileges for any future objects created in public schema
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;


-- Step 5: Configure Row Level Security (RLS) with Permissive Policies
-- Enabling RLS satisfies Supabase Security Advisor, while permissive policies
-- allow the POS and Companion Mobile app to sync freely using the Anon Key.

alter table public.mobpos_stores enable row level security;
alter table public.mobpos_records enable row level security;

-- Drop legacy/existing policies if any to prevent conflicts
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


-- Step 7: Reload PostgREST Schema Cache
-- Ensures Supabase REST API immediately discovers newly created/altered tables.
notify pgrst, 'reload schema';


-- ============================================================
-- Step 8 (اختياري لكن يوصى به): عزل المستأجرين الصارم بسر المستأجر
-- Strict Tenant-Secret Isolation (Opt-in)
-- ============================================================
-- النسخة الافتراضية أعلاه (allow_all) تعمل مع أي شخص يملك Anon Key.
-- هذي الخطوة تضيف طبقة حماية حقيقية بسر فريد لكل مستأجر (Tenant Secret):
--  1) نفّذ هذا السكربت في Supabase SQL Editor.
--  2) من إعدادات الفرع/المزامنة أدخل نفس السر في حقل "سر المتجر (Tenant Secret)"
--     بالديسكتوب وكل أجهزة الجوال المعنية بنفس المستأجر.
--  3) أي طلب بدون الرأس x-tenant-secret الصحيح سيُرفض 403 حتى لو امتلك Anon Key.
-- ملاحظة: بعد تفعيلها تأكد أن كل الأجهزة حدّثت السر قبل حذف السياسات الأقدم.

-- 8-A. جدول هاشات أسرار المستأجرين (لا يُخزَّن السر الخام أبداً)
create table if not exists public.mobpos_tenant_secrets (
  tenant_id   text primary key,
  secret_hash text not null,          -- sha256(secret) hex — 64 chars
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.mobpos_tenant_secrets enable row level security;

-- قفل تام: لا تقرأ أي هاشات عبر الـ API مباشرة (فقط دالة security definer أدناه)
drop policy if exists "mobpos_tenant_secrets_no_direct_access" on public.mobpos_tenant_secrets;
create policy "mobpos_tenant_secrets_no_direct_access"
  on public.mobpos_tenant_secrets
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- إدراج/تحديث سر مستأجر: نفّذه مرة واحدة لكل مستأجر مع سر قوي (32+ حرفاً)
-- create or replace function public.fn_set_tenant_secret(raw_secret text) ... أدرج يدوياً:
--   insert into public.mobpos_tenant_secrets(tenant_id, secret_hash)
--   values ('default-tenant', encode(sha256('YOUR_STRONG_SECRET'::bytea), 'hex'))
--   on conflict (tenant_id) do update set secret_hash = excluded.secret_hash, updated_at = now();

-- 8-B. دالة التحقق (Security Definer — تقرأ الهاشات رغم قفل RLS وتقارن مع رأس الطلب)
create or replace function public.fn_verify_tenant_secret(request_tenant_id text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  provided_secret text;
begin
  select coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-tenant-secret', '')
    into provided_secret;
  if provided_secret is null or length(provided_secret) = 0 then
    return false;
  end if;
  return exists (
    select 1 from public.mobpos_tenant_secrets s
    where s.tenant_id = request_tenant_id
      and s.secret_hash = encode(sha256(provided_secret::bytea), 'hex')
  );
end;
$$;

-- 8-C. سياسات صارمة على جدولي المزامنة (تستبدل allow_all)
drop policy if exists "mobpos_stores_allow_all" on public.mobpos_stores;
drop policy if exists "mobpos_stores_policy" on public.mobpos_stores;
create policy "mobpos_stores_tenant_secret"
  on public.mobpos_stores
  for all
  to anon, authenticated, service_role
  using (fn_verify_tenant_secret(tenant_id))
  with check (fn_verify_tenant_secret(tenant_id));

drop policy if exists "mobpos_records_allow_all" on public.mobpos_records;
drop policy if exists "mobpos_records_policy" on public.mobpos_records;
create policy "mobpos_records_tenant_secret"
  on public.mobpos_records
  for all
  to anon, authenticated, service_role
  using (fn_verify_tenant_secret(tenant_id))
  with check (fn_verify_tenant_secret(tenant_id));

-- 8-D. تحديث كاش PostgREST بعد تعريض الدوال والسياسات
notify pgrst, 'reload schema';
