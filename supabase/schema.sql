-- MOBPOS optional cloud sync schema
--
-- Security model: every row is owned by the authenticated Supabase user. The
-- browser must send a Supabase Auth access token; the public anon key alone is
-- intentionally denied by the RLS policies below. `tenant_id` is an
-- application/shop partition, not an authentication boundary.

create table if not exists public.mobpos_stores (
  tenant_id text not null,
  store text not null,
  data jsonb not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, store)
);

-- Existing pre-RLS rows created by the old anonymous schema have no trustworthy
-- owner and are deliberately not backfilled. Export them before applying this
-- migration if they must be retained, then re-upload them after signing in.
alter table public.mobpos_stores add column if not exists owner_id uuid;
alter table public.mobpos_stores alter column owner_id set default auth.uid();
-- Do not force NOT NULL here: rows created by the legacy anonymous schema
-- have no verifiable owner and must remain inaccessible until re-imported.

alter table public.mobpos_stores enable row level security;

-- Remove policies from the old tenant_id-only schema.
drop policy if exists "Allow anonymous read by tenant" on public.mobpos_stores;
drop policy if exists "Allow anonymous insert by tenant" on public.mobpos_stores;
drop policy if exists "Allow anonymous update by tenant" on public.mobpos_stores;
drop policy if exists "Allow anonymous delete by tenant" on public.mobpos_stores;
drop policy if exists "Allow read by tenant" on public.mobpos_stores;
drop policy if exists "Allow insert by tenant" on public.mobpos_stores;
drop policy if exists "Allow update by tenant" on public.mobpos_stores;
drop policy if exists "Allow delete by tenant" on public.mobpos_stores;
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

-- Recommended operational limits. Supabase Auth users should be provisioned by
-- an administrator; do not expose the service_role key to this Electron app.

-- ============================================================
--  Supabase Storage hardening
--
--  MOBPOS does not use Supabase Storage. This block exists so a deployment
--  can prove that no bucket is publicly listable/readable — the exact class
--  of finding raised as "Public Storage Bucket Listing" in security scans.
--
--  Run it against your project; it is idempotent and safe to re-run.
-- ============================================================

-- 1) No bucket may be public. `public = true` makes every object in the
--    bucket world-readable *and* listable without a token.
update storage.buckets set public = false where public = true;

-- 2) RLS must stay on for the object/bucket tables (Supabase default).
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

-- 3) Remove any permissive anon policy left over from a template project.
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        'anon' = any(roles)
        or 'public' = any(roles)
        or qual = 'true'
      )
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;
end $$;

-- 4) If you later add a bucket, scope it to its owner like this:
--
--   create policy "Owner can read own objects"
--     on storage.objects for select to authenticated
--     using (bucket_id = 'mobpos-backups' and owner = auth.uid());
--
--   create policy "Owner can write own objects"
--     on storage.objects for insert to authenticated
--     with check (bucket_id = 'mobpos-backups' and owner = auth.uid());

-- 5) Verification query — must return zero rows:
--   select id, name, public from storage.buckets where public;
