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

drop index if exists public.pricing_promotion_targets_grade_uq;
alter table public.pricing_promotion_targets drop constraint if exists pricing_promotion_targets_kind_check;
alter table public.pricing_promotion_targets add constraint pricing_promotion_targets_check check ((customer_id is null) <> (template_id is null));
alter table public.pricing_promotion_targets drop constraint if exists pricing_promotion_targets_store_grade_fk;
alter table public.pricing_promotion_targets drop column if exists store_grade_id;
drop index if exists public.normalized_customers_store_grade_idx;
alter table public.normalized_customers drop constraint if exists normalized_customers_store_grade_fk;
alter table public.normalized_customers drop column if exists store_grade_id;
drop table if exists public.company_store_grades;
commit;
