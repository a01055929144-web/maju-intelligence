-- DOWN for CC-19a/CC-17. Refuses while templates are in use or category moves exist (data would be lost).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
  if exists(select 1 from public.normalized_customers where margin_template_id is not null) then raise exception 'cc19a_down_refused_customers_linked'; end if;
  if exists(select 1 from public.margin_templates) then raise exception 'cc19a_down_refused_templates_exist'; end if;
  if exists(select 1 from public.product_category_moves) then raise exception 'cc19a_down_refused_move_history_exists'; end if;
end $$;
drop function public.move_product_category(uuid,text,text,uuid);
drop function if exists public.cc17_in_subtree(text,text);
drop function public.cc17_category_norm(text);
drop table public.product_category_moves;
drop index public.normalized_customers_margin_template_idx;
alter table public.normalized_customers drop constraint normalized_customers_margin_template_fk;
alter table public.normalized_customers drop column margin_template_id;
drop table public.margin_template_items, public.margin_template_categories, public.margin_templates;
commit;
