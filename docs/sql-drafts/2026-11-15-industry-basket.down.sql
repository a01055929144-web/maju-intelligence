-- DRAFT ONLY. Separate operating DB rollback approval required.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if exists (select 1 from public.company_industry_baskets) then
    raise exception 'industry_basket_down_refused_rows_exist';
  end if;
  if exists (
    select 1 from public.pricing_document_share_links
    where num_nonnulls(preview_id, preview_title, preview_description) > 0
  ) then
    raise exception 'industry_basket_down_refused_preview_exists';
  end if;
end $$;

insert into public.admin_audit_logs(action, target_type, metadata)
values (
  'industry_basket_schema_removed',
  'company_industry_baskets',
  jsonb_build_object('draft', '2026-11-15-industry-basket.down.sql')
);

drop index public.pricing_document_share_links_preview_id_uq;
alter table public.pricing_document_share_links
  drop constraint pricing_document_share_links_preview_description_check,
  drop constraint pricing_document_share_links_preview_title_check,
  drop constraint pricing_document_share_links_preview_shape_check,
  drop column preview_description,
  drop column preview_title,
  drop column preview_id;
drop table public.company_industry_baskets;

commit;
