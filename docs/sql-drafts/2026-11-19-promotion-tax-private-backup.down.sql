-- DRAFT ONLY. Separate approval required. Restore tax only; retain the private backup.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $restore$
declare changed integer;
begin
  perform 1 from promotion_tax_backup_20261119.promotion_rows order by promotion_id for update;
  if (select count(*) from promotion_tax_backup_20261119.promotion_rows)<>3
    or exists(select 1 from promotion_tax_backup_20261119.promotion_rows where restored_at is not null or after_row is null) then
    raise exception 'promotion_tax_restore_backup_mismatch';
  end if;
  perform 1 from public.pricing_promotions p join promotion_tax_backup_20261119.promotion_rows b
    on p.company_id=b.company_id and p.id=b.promotion_id order by p.id for update of p;
  if (select count(*) from public.pricing_promotions p join promotion_tax_backup_20261119.promotion_rows b
      on p.company_id=b.company_id and p.id=b.promotion_id
      join public.product_catalog x on x.company_id=p.company_id and x.id=p.product_id
      where to_jsonb(p)-'updated_at'=b.after_row-'updated_at' and md5(to_jsonb(x)::text)=b.product_hash)<>3 then
    raise exception 'promotion_tax_restore_refused_later_change';
  end if;
  if exists(select 1 from promotion_tax_backup_20261119.promotion_rows b where
    b.publication_hash is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]'::jsonb)::text)
      from public.pricing_document_versions v where v.company_id=b.company_id)
    or b.draft_hash is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]'::jsonb)::text)
      from public.pricing_documents d where d.company_id=b.company_id)) then
    raise exception 'promotion_tax_restore_refused_document_change';
  end if;
  update public.pricing_promotions p set tax_type=b.before_row->>'tax_type',revision=p.revision+1
    from promotion_tax_backup_20261119.promotion_rows b
    where p.company_id=b.company_id and p.id=b.promotion_id;
  get diagnostics changed=row_count;
  if changed<>3 then raise exception 'promotion_tax_restore_count_mismatch'; end if;
  if exists(select 1 from promotion_tax_backup_20261119.promotion_rows b
      join public.pricing_promotions p on p.company_id=b.company_id and p.id=b.promotion_id
      where p.revision<>(b.after_row->>'revision')::integer+1
        or to_jsonb(p)-array['revision','updated_at']<>b.before_row-array['revision','updated_at']) then
    raise exception 'promotion_tax_restore_unexpected_change';
  end if;
  update promotion_tax_backup_20261119.promotion_rows set restored_at=clock_timestamp();
end $restore$;
select count(*) filter(where restored_at is not null) as restored_rows
from promotion_tax_backup_20261119.promotion_rows;
-- Never DROP the backup automatically; retention/deletion needs a separate decision.
commit;
