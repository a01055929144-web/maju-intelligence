-- DRAFT ONLY (CC-19a + CC-17). Never run against production without the CEO's explicit approval phrase.
-- Dependencies: companies, product_catalog(company_id,id unique, category), margin_group_categories (pricing-p0), normalized_customers(company_id,id unique).
-- Service-only API: company authorization is enforced at the server boundary; RLS on, no anon/authenticated grants.
-- Markup basis follows pricing-p0: margin_bp 0..100000 = 0..1000% of purchase cost.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
  if to_regclass('public.margin_templates') is not null then raise exception 'cc19a_already_applied'; end if;
  if to_regclass('public.normalized_customers') is null or to_regclass('public.margin_group_categories') is null then raise exception 'cc19a_dependency_missing'; end if;
end $$;

create table public.margin_templates (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 60), margin_bp integer not null check(margin_bp between 0 and 100000),
 rounding integer not null default 10 check(rounding in (1,10,100)), sort_order integer not null default 0,
 archived_at timestamptz, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,id), unique(company_id,name)
);
create table public.margin_template_categories (
 company_id uuid not null references public.companies(id) on delete cascade, template_id uuid not null,
 category text not null check(length(trim(category)) between 1 and 100), margin_bp integer not null check(margin_bp between 0 and 100000),
 primary key(template_id,category),
 foreign key(company_id,template_id) references public.margin_templates(company_id,id) on delete cascade
);
create table public.margin_template_items (
 company_id uuid not null references public.companies(id) on delete cascade, template_id uuid not null, product_id uuid not null,
 margin_bp integer check(margin_bp between 0 and 100000), direct_price bigint check(direct_price between 0 and 1000000000000),
 primary key(template_id,product_id), check(margin_bp is not null or direct_price is not null),
 foreign key(company_id,template_id) references public.margin_templates(company_id,id) on delete cascade,
 foreign key(company_id,product_id) references public.product_catalog(company_id,id) on delete cascade
);
alter table public.normalized_customers add column margin_template_id uuid;
alter table public.normalized_customers add constraint normalized_customers_margin_template_fk
 foreign key(company_id,margin_template_id) references public.margin_templates(company_id,id);
create index normalized_customers_margin_template_idx on public.normalized_customers(company_id,margin_template_id) where margin_template_id is not null;

-- CC-17: folder move history, so a move can be audited and undone.
create table public.product_category_moves (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 from_path text not null, to_path text not null, product_count integer not null, moved_products jsonb not null,
 created_by uuid, created_at timestamptz not null default now(), unique(company_id,id)
);
alter table public.margin_templates enable row level security;
alter table public.margin_template_categories enable row level security;
alter table public.margin_template_items enable row level security;
alter table public.product_category_moves enable row level security;
revoke all on public.margin_templates, public.margin_template_categories, public.margin_template_items, public.product_category_moves from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.margin_templates, public.margin_template_categories, public.margin_template_items to service_role;
grant select,insert on public.product_category_moves to service_role;

-- "A>B" and "A > B" are the same folder; moved rows are stored in the normalized "A > B" form.
create function public.cc17_category_norm(c text) returns text language sql immutable set search_path = public,pg_temp as
 $f$ select regexp_replace(btrim(coalesce(c,'')), '\s*>\s*', ' > ', 'g') $f$;

-- Atomic: products and default/template category margins move together, or nothing does.
-- Published document versions are snapshots and are not touched.
-- Moving onto an existing folder merges: the target's margin links win, the moving folder's duplicate links are dropped.
create function public.move_product_category(p_company uuid, p_from text, p_to text, p_actor uuid default null) returns jsonb
language plpgsql security invoker set search_path = public,pg_temp as $$
declare f text := public.cc17_category_norm(p_from); t text := public.cc17_category_norm(p_to); n integer; moved jsonb;
begin
 if f = '' or t = '' or length(t) > 100 then raise exception 'cc17_invalid_path'; end if;
 if t = f or t like f || ' > %' then raise exception 'cc17_cannot_move_into_itself'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category)),'[]') into moved from public.product_catalog
  where company_id = p_company and (public.cc17_category_norm(category) = f or public.cc17_category_norm(category) like f || ' > %');
 update public.product_catalog set category = t || substr(public.cc17_category_norm(category), length(f)+1)
  where company_id = p_company and (public.cc17_category_norm(category) = f or public.cc17_category_norm(category) like f || ' > %');
 get diagnostics n = row_count;
 delete from public.margin_group_categories s where s.company_id = p_company and (public.cc17_category_norm(s.category) = f or public.cc17_category_norm(s.category) like f || ' > %')
  and exists(select 1 from public.margin_group_categories d where d.company_id = p_company and d.category = t || substr(public.cc17_category_norm(s.category), length(f)+1));
 update public.margin_group_categories set category = t || substr(public.cc17_category_norm(category), length(f)+1)
  where company_id = p_company and (public.cc17_category_norm(category) = f or public.cc17_category_norm(category) like f || ' > %');
 delete from public.margin_template_categories s where s.company_id = p_company and (public.cc17_category_norm(s.category) = f or public.cc17_category_norm(s.category) like f || ' > %')
  and exists(select 1 from public.margin_template_categories d where d.template_id = s.template_id and d.category = t || substr(public.cc17_category_norm(s.category), length(f)+1));
 update public.margin_template_categories set category = t || substr(public.cc17_category_norm(category), length(f)+1)
  where company_id = p_company and (public.cc17_category_norm(category) = f or public.cc17_category_norm(category) like f || ' > %');
 insert into public.product_category_moves(company_id,from_path,to_path,product_count,moved_products,created_by) values (p_company,f,t,n,moved,p_actor);
 return jsonb_build_object('productCount', n, 'from', f, 'to', t);
end $$;
revoke all on function public.move_product_category(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.cc17_category_norm(text) from public,anon,authenticated;
grant execute on function public.move_product_category(uuid,text,text,uuid) to service_role;
grant execute on function public.cc17_category_norm(text) to service_role;
commit;
