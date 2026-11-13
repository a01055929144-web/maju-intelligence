-- DRAFT ONLY (CC-29a). Never run against production without the CEO's explicit approval phrase.
-- Promotion audience: who may see / order a promotion (all stores, only the listed ones, or everyone except the listed ones).
-- Targets are individual stores (normalized_customers) and/or grades (margin_templates, CC-19a).
-- This step only adds the data and one judgment function. Existing promotions stay audience = 'all' (no behavior change).
-- The order functions (place_store_order / place_store_member_order) are changed in a later draft (CC-29b).
-- Service-only: no anon/authenticated grants; the app server enforces company boundaries and roles.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.pricing_promotion_targets') is not null then raise exception 'cc29a_already_applied'; end if;
  if to_regclass('public.pricing_promotions') is null or to_regclass('public.margin_templates') is null
     or to_regclass('public.normalized_customers') is null then raise exception 'cc29a_dependency_missing'; end if;
end $$;

alter table public.pricing_promotions add column audience text not null default 'all' check (audience in ('all','only','except'));

-- One row = one target. Exactly one of customer_id / template_id is set; both have a same-company foreign key.
create table public.pricing_promotion_targets (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 promotion_id uuid not null,
 customer_id uuid,
 template_id uuid,
 created_at timestamptz not null default now(),
 check ((customer_id is null) <> (template_id is null)),
 foreign key (company_id, promotion_id) references public.pricing_promotions(company_id, id) on delete cascade,
 foreign key (company_id, customer_id) references public.normalized_customers(company_id, id) on delete cascade,
 foreign key (company_id, template_id) references public.margin_templates(company_id, id) on delete cascade
);
create unique index pricing_promotion_targets_customer_uq on public.pricing_promotion_targets(promotion_id, customer_id) where customer_id is not null;
create unique index pricing_promotion_targets_template_uq on public.pricing_promotion_targets(promotion_id, template_id) where template_id is not null;
create index pricing_promotion_targets_company_idx on public.pricing_promotion_targets(company_id, promotion_id);
alter table public.pricing_promotion_targets enable row level security;
revoke all on public.pricing_promotion_targets from public, anon, authenticated;
grant select, insert, update, delete on public.pricing_promotion_targets to service_role;

-- Does this promotion apply to this store? A store is matched when it is listed itself or when its grade (margin template) is listed.
-- A store without a grade can only be matched by itself. Unknown promotion or a promotion of another company -> false.
create function public.promotion_applies_to(p_company uuid, p_promotion uuid, p_customer uuid) returns boolean
language plpgsql stable security invoker set search_path = public,pg_temp as $$
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

revoke all on function public.promotion_applies_to(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.promotion_applies_to(uuid,uuid,uuid) to service_role;
commit;
