-- DOWN for CC-26a. Restores the CC-19a move_product_category (no folder order rows) and drops the order table.
-- Refused when any folder order was edited after the backfill (that order would be lost); roll the screens back first.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.product_category_folders') is null then raise exception 'cc26a_not_applied'; end if;
  if exists(select 1 from public.product_category_folders where updated_at > created_at + interval '1 second') then raise exception 'cc26a_down_refused_order_edited'; end if;
end $$;

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
 insert into public.product_category_moves(company_id,from_path,to_path,product_count,moved_products,created_by) values (p_company,f,t,n,moved,p_actor);
 return jsonb_build_object('productCount', n, 'from', f, 'to', t);
end $$;
revoke all on function public.move_product_category(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.move_product_category(uuid,text,text,uuid) to service_role;

drop function public.reorder_product_category_folder(uuid,text,text);
drop function public.cc26a_parent(text);
drop table public.product_category_folders;
commit;
