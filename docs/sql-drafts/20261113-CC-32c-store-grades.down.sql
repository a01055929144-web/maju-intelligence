-- CC-32c down. 등급을 쓰는 매장이나 행사 대상이 있으면 거부한다(데이터를 지우지 않는다).
begin;
do $$ begin
  if exists (select 1 from public.normalized_customers where store_grade_id is not null)
     or exists (select 1 from public.pricing_promotion_targets where store_grade_id is not null) then
    raise exception 'store_grade_in_use';
  end if;
end $$;

create or replace function public.promotion_applies_to(p_company uuid, p_promotion uuid, p_customer uuid)
returns boolean language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare aud text; hit boolean;
begin
  select audience into aud from public.pricing_promotions where company_id = p_company and id = p_promotion;
  if aud is null then return false; end if;
  if aud = 'all' then return true; end if;
  select exists(
    select 1 from public.pricing_promotion_targets t
    where t.company_id = p_company and t.promotion_id = p_promotion
      and (t.customer_id = p_customer
        or (t.template_id is not null and t.template_id = (select c.margin_template_id from public.normalized_customers c where c.company_id = p_company and c.id = p_customer)))
  ) into hit;
  return case aud when 'only' then hit else not hit end;
end $$;

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

drop index if exists public.pricing_promotion_targets_grade_uq;
alter table public.pricing_promotion_targets drop constraint if exists pricing_promotion_targets_kind_check;
alter table public.pricing_promotion_targets add constraint pricing_promotion_targets_check check ((customer_id is null) <> (template_id is null));
alter table public.pricing_promotion_targets drop constraint if exists pricing_promotion_targets_store_grade_fk;
alter table public.pricing_promotion_targets drop column if exists store_grade_id;
drop index if exists public.normalized_customers_store_grade_idx;
alter table public.normalized_customers drop constraint if exists normalized_customers_store_grade_fk;
alter table public.normalized_customers drop column if exists store_grade_id;
drop trigger if exists company_store_grades_set_updated_at on public.company_store_grades;
drop table if exists public.company_store_grades;
commit;
