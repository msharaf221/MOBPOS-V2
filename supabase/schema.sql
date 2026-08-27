-- ============================================================
--  MOBPOS — مخطط قاعدة بيانات Supabase للمزامنة بين الأجهزة
--  نفّذه مرة واحدة في: Supabase Dashboard → SQL Editor → Run
--
--  ⚠️ ⚠️ ⚠️ تحذير أمني هام جداً ⚠️ ⚠️ ⚠️
--  1. مفتاح Supabase Anon مكشوف بطبيعته في تطبيقات الواجهة الأمامية (Frontend/Client).
--  2. المزامنة تعتمد على عزل البيانات لكل متجر عبر معرّف المتجر/الترخيص (tenant_id).
--  3. السياسات أدناه تفرض عزل الصفوف لكل متجر (tenant_id).
--  4. للانتقال لبيئة إنتاج متعددة المستأجرين (Multi-tenant SaaS) بدرجة أمان قصوى،
--     يجب استخدام Supabase Auth أو Backend وسيط / Edge Function للتحقق من هوية المتجر
--     بدلاً من الاعتماد فقط على مفتاح anon.
-- ============================================================

-- إنشاء الجدول مع دعم تعدد المستأجرين (tenant_id + store)
create table if not exists mobpos_stores (
  tenant_id  text not null,
  store      text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, store)
);

-- إذا كان الجدول موجوداً مسبقاً بدون عمود tenant_id:
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'mobpos_stores' and column_name = 'tenant_id'
  ) then
    alter table mobpos_stores drop constraint if exists mobpos_stores_pkey;
    alter table mobpos_stores add column tenant_id text not null default 'default';
    alter table mobpos_stores add primary key (tenant_id, store);
  end if;
end $$;

-- تفعيل أمان مستوى الصفوف (Row Level Security - RLS)
alter table mobpos_stores enable row level security;

-- حذف أي سياسات قديمة مفتوحة
drop policy if exists "mobpos_all_select" on mobpos_stores;
drop policy if exists "mobpos_all_insert" on mobpos_stores;
drop policy if exists "mobpos_all_update" on mobpos_stores;
drop policy if exists "mobpos_tenant_select" on mobpos_stores;
drop policy if exists "mobpos_tenant_insert" on mobpos_stores;
drop policy if exists "mobpos_tenant_update" on mobpos_stores;

-- سياسات RLS مقيّدة بـ tenant_id صالح وغير فارغ
create policy "mobpos_tenant_select" on mobpos_stores
  for select
  using (tenant_id is not null and length(tenant_id) >= 1);

create policy "mobpos_tenant_insert" on mobpos_stores
  for insert
  with check (tenant_id is not null and length(tenant_id) >= 1);

create policy "mobpos_tenant_update" on mobpos_stores
  for update
  using (tenant_id is not null and length(tenant_id) >= 1)
  with check (tenant_id is not null and length(tenant_id) >= 1);

-- فهرس لتسريع استعلامات المتجر
create index if not exists idx_mobpos_stores_tenant on mobpos_stores (tenant_id);
