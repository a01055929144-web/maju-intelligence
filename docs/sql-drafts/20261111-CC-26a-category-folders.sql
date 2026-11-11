-- DRAFT ONLY (CC-26a). Never run against production without the CEO's explicit approval phrase.
-- Per-company folder order table so every screen shows categories in the same order.
-- Dependencies: companies, product_catalog(company_id, category), and CC-19a/CC-17 functions
-- (cc17_category_norm, cc17_in_subtree, move_product_category) already applied.
-- Service-only: no anon/authenticated grants; the app server enforces company boundaries.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.product_category_folders') is not null then raise exception 'cc26a_already_applied'; end if;
  if to_regprocedure('public.move_product_category(uuid,text,text,uuid)') is null
     or to_regprocedure('public.cc17_in_subtree(text,text)') is null
     or to_regprocedure('public.cc17_category_norm(text)') is null then raise exception 'cc26a_dependency_missing'; end if;
end $$;

create table public.product_category_folders (
 company_id uuid not null references public.companies(id) on delete cascade,
 path text not null check (length(path) between 1 and 100),
 sort_order integer not null default 0 check (sort_order >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (company_id, path)
);
alter table public.product_category_folders enable row level security;
revoke all on public.product_category_folders from public, anon, authenticated;
grant select, insert, update, delete on public.product_category_folders to service_role;

-- Parent path of a normalized "A > B > C" path ('' for a top-level folder).
create function public.cc26a_parent(p text) returns text language sql immutable set search_path = public,pg_temp as
 $f$ select array_to_string((string_to_array(p, ' > '))[1 : greatest(cardinality(string_to_array(p, ' > ')) - 1, 0)], ' > ') $f$;

-- Backfill: one row per existing folder (every ancestor of every product category). Order = current display order (by name) among siblings.
insert into public.product_category_folders(company_id, path, sort_order)
select company_id, path, (row_number() over (partition by company_id, public.cc26a_parent(path) order by path) - 1)::integer
from (
  select distinct c.company_id,
         array_to_string((string_to_array(public.cc17_category_norm(c.category), ' > '))[1:n], ' > ') as path
  from public.product_catalog c,
       lateral generate_series(1, cardinality(string_to_array(public.cc17_category_norm(c.category), ' > '))) n
  where btrim(coalesce(c.category, '')) <> ''
) folders
where length(path) between 1 and 100;

-- A folder move (rename/merge) now moves the folder order rows too. Merging onto an existing folder keeps the target's order.
create or replace function public.move_product_category(p_company uuid, p_from text, p_to text, p_actor uuid default null) returns jsonb
language plpgsql security invoker set search_path = public,pg_temp as $$
declare f text := public.cc17_category_norm(p_from); t text := public.cc17_category_norm(p_to); n integer; moved jsonb;
begin
 if f = '' or t = '' or length(t) > 100 then raise exception 'cc17_invalid_path'; end if;
 if public.cc17_in_subtree(t, f) then raise exception 'cc17_cannot_move_into_itself'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category)),'[]') into moved from public.product_catalog
  where company_id = p_company and public.cc17_in_subtree(public.cc17_category_norm(category), f);
 update public.product_catalog set category = t || substr(public.cc17_category_norm(category), length(f)+1)
  where company_id = p_company and public.cc17_in_subtree(public.cc17_category_norm(category), f);
 get diagnostics n = row_count;
 delete from public.margin_group_categories s where s.company_id = p_company and public.cc17_in_subtree(public.cc17_category_norm(s.category), f)
  and exists(select 1 from public.margin_group_categories d where d.company_id = p_company and d.category = t || substr(public.cc17_category_norm(s.category), length(f)+1));
 update public.margin_group_categories set category = t || substr(public.cc17_category_norm(category), length(f)+1)
  where company_id = p_company and public.cc17_in_subtree(public.cc17_category_norm(category), f);
 delete from public.margin_template_categories s where s.company_id = p_company and public.cc17_in_subtree(public.cc17_category_norm(s.category), f)
  and exists(select 1 from public.margin_template_categories d where d.template_id = s.template_id and d.category = t || substr(public.cc17_category_norm(s.category), length(f)+1));
 update public.margin_template_categories set category = t || substr(public.cc17_category_norm(category), length(f)+1)
  where company_id = p_company and public.cc17_in_subtree(public.cc17_category_norm(category), f);
 -- CC-26a: folder order rows follow the folder; duplicates on merge are dropped (target order wins).
 delete from public.product_category_folders s where s.company_id = p_company and public.cc17_in_subtree(s.path, f)
  and exists(select 1 from public.product_category_folders d where d.company_id = p_company and d.path = t || substr(s.path, length(f)+1));
 update public.product_category_folders set path = t || substr(path, length(f)+1), updated_at = now()
  where company_id = p_company and public.cc17_in_subtree(path, f);
 -- The moved top folder must exist as a folder row under its new parent (end of the list) even if it had none.
 insert into public.product_category_folders(company_id, path, sort_order)
  select p_company, t, coalesce((select max(x.sort_order) + 1 from public.product_category_folders x where x.company_id = p_company and public.cc26a_parent(x.path) = public.cc26a_parent(t) and x.path <> t), 0)
  on conflict (company_id, path) do nothing;
 insert into public.product_category_moves(company_id,from_path,to_path,product_count,moved_products,created_by) values (p_company,f,t,n,moved,p_actor);
 return jsonb_build_object('productCount', n, 'from', f, 'to', t);
end $$;

-- Put a folder right before one of its siblings (or at the end when p_before is null); siblings are renumbered 0..n-1.
-- Siblings come from existing folder rows plus every folder that has products, so folders created by uploads are included.
create function public.reorder_product_category_folder(p_company uuid, p_path text, p_before text default null) returns jsonb
language plpgsql security invoker set search_path = public,pg_temp as $$
declare p text := public.cc17_category_norm(p_path); b text := nullif(public.cc17_category_norm(coalesce(p_before, '')), ''); par text; cnt integer;
begin
 if p = '' or length(p) > 100 then raise exception 'cc26a_invalid_path'; end if;
 par := public.cc26a_parent(p);
 if b is not null and b = p then return jsonb_build_object('path', p, 'changed', false); end if;
 if b is not null and public.cc26a_parent(b) <> par then raise exception 'cc26a_not_siblings'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cc26a:' || p_company::text, 0));
 with product_folders as (
   select distinct array_to_string((string_to_array(public.cc17_category_norm(c.category), ' > '))[1:n], ' > ') as path
   from public.product_catalog c,
        lateral generate_series(1, cardinality(string_to_array(public.cc17_category_norm(c.category), ' > '))) n
   where c.company_id = p_company and btrim(coalesce(c.category, '')) <> ''
 ), sib as (
   select f.path from public.product_category_folders f where f.company_id = p_company and public.cc26a_parent(f.path) = par
   union
   select pf.path from product_folders pf where public.cc26a_parent(pf.path) = par
 ), ranked as (
   select s.path, row_number() over (order by coalesce(f.sort_order, 2147483647), s.path) * 2 as pos
   from sib s left join public.product_category_folders f on f.company_id = p_company and f.path = s.path
   where s.path <> p
 ), placed as (
   select path, pos from ranked
   union all
   select p, coalesce((select r.pos - 1 from ranked r where r.path = b), (select coalesce(max(pos), 0) + 2 from ranked))
 ), numbered as (
   select path, (row_number() over (order by pos) - 1)::integer as sort_order from placed
 )
 insert into public.product_category_folders(company_id, path, sort_order)
 select p_company, path, sort_order from numbered
 on conflict (company_id, path) do update set sort_order = excluded.sort_order, updated_at = now();
 get diagnostics cnt = row_count;
 return jsonb_build_object('path', p, 'changed', true, 'siblings', cnt);
end $$;

revoke all on function public.move_product_category(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.cc26a_parent(text) from public,anon,authenticated;
revoke all on function public.reorder_product_category_folder(uuid,text,text) from public,anon,authenticated;
grant execute on function public.move_product_category(uuid,text,text,uuid) to service_role;
grant execute on function public.cc26a_parent(text) to service_role;
grant execute on function public.reorder_product_category_folder(uuid,text,text) to service_role;
commit;
