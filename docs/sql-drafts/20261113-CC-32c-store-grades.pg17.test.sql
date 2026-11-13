-- Disposable PostgreSQL 17 fixture only. Never run against production.
-- 운영 구조(2026-11-13 읽기 조회)를 따른 최소 fixture + 초안 + down 왕복.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table companies(id uuid primary key);
create table margin_templates(id uuid primary key, company_id uuid not null references companies(id), unique(company_id, id));
create table normalized_customers(id uuid primary key, company_id uuid not null references companies(id), margin_template_id uuid, unique(company_id, id));
create table pricing_promotions(id uuid primary key, company_id uuid not null references companies(id), audience text not null default 'all', revision integer not null default 1, unique(company_id, id));
create table pricing_promotion_targets(
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  promotion_id uuid not null, customer_id uuid, template_id uuid, created_at timestamptz not null default now(),
  check ((customer_id is null) <> (template_id is null)),
  foreign key (company_id, promotion_id) references pricing_promotions(company_id, id) on delete cascade,
  foreign key (company_id, customer_id) references normalized_customers(company_id, id) on delete cascade,
  foreign key (company_id, template_id) references margin_templates(company_id, id) on delete cascade);
create unique index pricing_promotion_targets_customer_uq on pricing_promotion_targets(promotion_id, customer_id) where customer_id is not null;
create unique index pricing_promotion_targets_template_uq on pricing_promotion_targets(promotion_id, template_id) where template_id is not null;
create function promotion_applies_to(p_company uuid, p_promotion uuid, p_customer uuid) returns boolean language plpgsql stable set search_path to 'public','pg_temp' as $$
declare aud text; hit boolean;
begin
  select audience into aud from public.pricing_promotions where company_id = p_company and id = p_promotion;
  if aud is null then return false; end if;
  if aud = 'all' then return true; end if;
  select exists(select 1 from public.pricing_promotion_targets t where t.company_id = p_company and t.promotion_id = p_promotion
    and (t.customer_id = p_customer or (t.template_id is not null and t.template_id = (select c.margin_template_id from public.normalized_customers c where c.company_id = p_company and c.id = p_customer)))) into hit;
  return case aud when 'only' then hit else not hit end;
end $$;

create function set_row_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create or replace function public.save_promotion_audience_v1(p_company uuid, p_promotion uuid, p_expected_revision integer, p_audience text, p_targets jsonb)
returns jsonb language plpgsql set search_path to 'public', 'pg_temp' as $$
declare pr public.pricing_promotions%rowtype; n integer;
begin
  if p_company is null or p_promotion is null or p_expected_revision is null or p_audience is null
    or p_audience not in ('all','only','except') or p_targets is null or jsonb_typeof(p_targets) <> 'array'
    or jsonb_array_length(p_targets) > 200 then raise exception 'Invalid audience request'; end if;
  if exists(select 1 from jsonb_array_elements(p_targets) e
    where jsonb_typeof(e) <> 'object' or coalesce(e->>'kind','') not in ('customer','template')
      or coalesce(e->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid audience target'; end if;
  select * into pr from public.pricing_promotions where company_id = p_company and id = p_promotion for update;
  if not found then raise exception 'Promotion not found'; end if;
  if pr.revision <> p_expected_revision then raise exception 'Stale promotion'; end if;
  select count(distinct (e->>'kind', lower(e->>'id'))) into n from jsonb_array_elements(p_targets) e;
  if p_audience = 'all' and n > 0 then raise exception 'Targets not allowed for all stores'; end if;
  if p_audience = 'only' and n = 0 then raise exception 'Audience targets required'; end if;
  if exists(select 1 from jsonb_array_elements(p_targets) e where e->>'kind' = 'customer'
      and not exists(select 1 from public.normalized_customers c where c.company_id = p_company and c.id = (e->>'id')::uuid))
    or exists(select 1 from jsonb_array_elements(p_targets) e where e->>'kind' = 'template'
      and not exists(select 1 from public.margin_templates m where m.company_id = p_company and m.id = (e->>'id')::uuid))
    then raise exception 'Audience target outside company'; end if;
  delete from public.pricing_promotion_targets where company_id = p_company and promotion_id = p_promotion;
  insert into public.pricing_promotion_targets(company_id, promotion_id, customer_id, template_id)
    select distinct p_company, p_promotion,
      case when e->>'kind' = 'customer' then (e->>'id')::uuid end,
      case when e->>'kind' = 'template' then (e->>'id')::uuid end
    from jsonb_array_elements(p_targets) e;
  update public.pricing_promotions set audience = p_audience, revision = revision + 1
    where company_id = p_company and id = p_promotion returning * into pr;
  return jsonb_build_object('id', pr.id, 'revision', pr.revision, 'audience', pr.audience, 'targets', n);
end $$;

\ir 20261113-CC-32c-store-grades.sql

insert into companies values ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');
insert into company_store_grades(id, company_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'VIP'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c2', 'VIP');
insert into normalized_customers(id, company_id, store_grade_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', null);
insert into pricing_promotions(id, company_id, audience) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'only'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'except');
insert into pricing_promotion_targets(company_id, promotion_id, store_grade_id) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1');

-- 노출 판정: only=등급 매장만, except=등급 매장 제외
do $$ begin
  assert promotion_applies_to('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1') = true;
  assert promotion_applies_to('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b2') = false;
  assert promotion_applies_to('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000b1') = false;
  assert promotion_applies_to('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000b2') = true;
end $$;

-- 기존 대상(매장 직접)도 그대로 동작
insert into pricing_promotion_targets(company_id, promotion_id, customer_id) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert promotion_applies_to('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b2') = true;
end $$;

-- save_promotion_audience_v1: 등급 대상 저장 / 다른 회사 등급 거부 / 보관 등급 거부 / 옛 종류 그대로
do $$ declare r jsonb; begin
  r := save_promotion_audience_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',1,'only','[{"kind":"store_grade","id":"00000000-0000-0000-0000-0000000000a1"},{"kind":"customer","id":"00000000-0000-0000-0000-0000000000b2"}]');
  assert (r->>'targets')::int = 2 and (r->>'revision')::int = 2;
  assert exists(select 1 from pricing_promotion_targets where promotion_id='00000000-0000-0000-0000-0000000000d1' and store_grade_id='00000000-0000-0000-0000-0000000000a1');
  begin perform save_promotion_audience_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',2,'only','[{"kind":"store_grade","id":"00000000-0000-0000-0000-0000000000a2"}]');
    assert false, 'other company grade must fail'; exception when raise_exception then assert sqlerrm = 'Audience target outside company'; end;
  update company_store_grades set archived_at = now() where id='00000000-0000-0000-0000-0000000000a1';
  begin perform save_promotion_audience_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',2,'only','[{"kind":"store_grade","id":"00000000-0000-0000-0000-0000000000a1"}]');
    assert false, 'archived grade must fail'; exception when raise_exception then assert sqlerrm = 'Audience target outside company'; end;
  update company_store_grades set archived_at = null where id='00000000-0000-0000-0000-0000000000a1';
  update company_store_grades set updated_at = now() - interval '1 day' where id='00000000-0000-0000-0000-0000000000a1';
assert (select updated_at from company_store_grades where id='00000000-0000-0000-0000-0000000000a1') > now() - interval '1 hour', 'updated_at trigger';
end $$;

-- 제약: 대상은 정확히 한 종류, 이름은 회사 안에서 유일(대소문자 무시), 다른 회사 등급은 못 쓴다, 쓰는 등급은 못 지운다, service_role만
do $$ begin
  begin insert into pricing_promotion_targets(company_id, promotion_id, customer_id, store_grade_id) values
    ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1');
    assert false, 'two target kinds must fail'; exception when check_violation then null; end;
  begin insert into company_store_grades(company_id, name) values ('00000000-0000-0000-0000-0000000000c1', 'vip ');
    assert false, 'duplicate name must fail'; exception when unique_violation then null; end;
  begin update normalized_customers set store_grade_id='00000000-0000-0000-0000-0000000000a2' where id='00000000-0000-0000-0000-0000000000b2';
    assert false, 'other company grade must fail'; exception when foreign_key_violation then null; end;
  begin delete from company_store_grades where id='00000000-0000-0000-0000-0000000000a1';
    assert false, 'grade in use must not be deletable'; exception when foreign_key_violation then null; end;
  assert not has_table_privilege('anon', 'company_store_grades', 'select');
  assert not has_table_privilege('authenticated', 'company_store_grades', 'select');
  assert has_table_privilege('service_role', 'company_store_grades', 'select');
end $$;
-- 보관한 이름은 다시 쓸 수 있다
update company_store_grades set archived_at = now() where id='00000000-0000-0000-0000-0000000000a2';
insert into company_store_grades(company_id, name) values ('00000000-0000-0000-0000-0000000000c2', 'VIP');

-- down: 쓰는 곳이 있으면 거부
\set ON_ERROR_STOP off
\ir 20261113-CC-32c-store-grades.down.sql
\set ON_ERROR_STOP on
do $$ begin
  assert exists (select 1 from information_schema.columns where table_name='normalized_customers' and column_name='store_grade_id'), 'down must refuse while in use';
end $$;
-- 쓰는 곳을 비운 뒤 down 성공
delete from pricing_promotion_targets where store_grade_id is not null;
update normalized_customers set store_grade_id = null;
\ir 20261113-CC-32c-store-grades.down.sql
do $$ begin
  assert not exists (select 1 from information_schema.columns where table_name='normalized_customers' and column_name='store_grade_id');
  assert not exists (select 1 from information_schema.columns where table_name='pricing_promotion_targets' and column_name='store_grade_id');
  assert to_regclass('public.company_store_grades') is null;
  assert promotion_applies_to('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b2') = true, 'old behaviour restored';
end $$;
