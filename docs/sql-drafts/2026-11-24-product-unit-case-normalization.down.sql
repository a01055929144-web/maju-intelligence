-- DRAFT ONLY. Restores exact unit casing from the private backup when no later edit exists.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $restore$
declare company uuid; changed integer;
begin
  select company_id into company from product_unit_case_backup_20261124.run_state where singleton for update;
  if company is null or exists(select 1 from product_unit_case_backup_20261124.run_state where restored_at is not null)
    or exists(select 1 from product_unit_case_backup_20261124.product_rows where after_row is null)
    or exists(select 1 from product_unit_case_backup_20261124.document_rows where after_row is null)
  then raise exception 'product_unit_restore_backup_mismatch'; end if;
  if exists(select 1 from product_unit_case_backup_20261124.run_state s where
      s.publication_hash is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]')::text) from public.pricing_document_versions v where v.company_id=company)
      or s.fixed_price_hash is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]')::text) from public.customer_price_agreements a where a.company_id=company)
      or s.non_draft_quote_hash is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]')::text) from (
        select q.id,q.company_id,q.status,to_jsonb(q) quote,
          coalesce(jsonb_agg(to_jsonb(i) order by i.id) filter(where i.id is not null),'[]') items
        from public.sales_quotes q left join public.sales_quote_items i on i.company_id=q.company_id and i.quote_id=q.id
        where q.company_id=company and q.status<>'draft' group by q.id,q.company_id,q.status
      ) x))
  then raise exception 'product_unit_restore_refused_protected_change'; end if;
  perform 1 from public.product_catalog p join product_unit_case_backup_20261124.product_rows b on b.id=p.id order by p.id for update of p;
  perform 1 from public.pricing_documents d join product_unit_case_backup_20261124.document_rows b on b.id=d.id order by d.id for update of d;
  perform 1 from public.sales_quote_items i join product_unit_case_backup_20261124.quote_item_rows b on b.id=i.id order by i.id for update of i;
  if exists(select 1 from public.product_catalog p join product_unit_case_backup_20261124.product_rows b on b.id=p.id
      where to_jsonb(p)<>b.after_row)
    or exists(select 1 from public.pricing_documents d join product_unit_case_backup_20261124.document_rows b on b.id=d.id
      where to_jsonb(d)<>b.after_row)
    or exists(select 1 from public.sales_quote_items i join product_unit_case_backup_20261124.quote_item_rows b on b.id=i.id
      where to_jsonb(i)<>b.after_row)
  then raise exception 'product_unit_restore_refused_later_change'; end if;

  update public.product_catalog p set purchase_unit=b.before_row->>'purchase_unit',sales_unit=b.before_row->>'sales_unit',updated_at=clock_timestamp()
    from product_unit_case_backup_20261124.product_rows b where p.company_id=b.company_id and p.id=b.id;
  get diagnostics changed=row_count; if changed<>169 then raise exception 'product_unit_restore_count_mismatch'; end if;
  update public.pricing_documents d set content=b.before_row->'content',revision=d.revision+1,updated_at=clock_timestamp()
    from product_unit_case_backup_20261124.document_rows b where d.company_id=b.company_id and d.id=b.id;
  update public.sales_quote_items i set unit=b.before_row->>'unit',sales_unit_snapshot=b.before_row->>'sales_unit_snapshot',
    purchase_unit_snapshot=b.before_row->>'purchase_unit_snapshot',updated_at=clock_timestamp()
    from product_unit_case_backup_20261124.quote_item_rows b where i.company_id=b.company_id and i.id=b.id;
  update product_unit_case_backup_20261124.run_state set restored_at=clock_timestamp() where singleton;
end $restore$;
select count(*) restored_products,(select count(*) from product_unit_case_backup_20261124.document_rows) restored_documents,
  (select count(*) from product_unit_case_backup_20261124.quote_item_rows) restored_quote_lines
from product_unit_case_backup_20261124.product_rows;
commit;
