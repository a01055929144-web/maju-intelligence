-- DRAFT ONLY. New schema/table + three operating row corrections require separate approval.
-- Backup remains outside Git, inside this same operating database; not disaster recovery.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Deliberately not IF NOT EXISTS: never overwrite or reuse an earlier backup.
create schema promotion_tax_backup_20261119;
revoke all on schema promotion_tax_backup_20261119 from public, anon, authenticated, service_role;
create table promotion_tax_backup_20261119.promotion_rows (
  promotion_id uuid primary key,
  company_id uuid not null,
  before_row jsonb not null,
  after_row jsonb,
  product_hash text not null,
  publication_hash text not null,
  draft_hash text not null,
  backed_up_at timestamptz not null default clock_timestamp(),
  restored_at timestamptz,
  check (before_row->>'id' = promotion_id::text),
  check (before_row->>'company_id' = company_id::text)
);
alter table promotion_tax_backup_20261119.promotion_rows enable row level security;
revoke all on promotion_tax_backup_20261119.promotion_rows from public, anon, authenticated, service_role;

do $correction$
declare
  document_ids uuid[];
  document_revisions integer[];
  document_hashes text[];
  document_id uuid;
  company uuid;
  promotion_ids uuid[];
  day date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  publications_before text;
  drafts_before text;
  others_before text;
  expected_scope text := current_setting('maju.promotion_tax_scope_hash',true);
  changed integer;
begin
  -- Caller supplies a privately verified company/document/exact-three-promotion fingerprint.
  -- No revision number, actual identifier or operating fingerprint is embedded in Git.
  if coalesce(expected_scope,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'promotion_tax_private_scope_guard_required';
  end if;
  -- Select only the privately approved identity; mutable revision/line count are not identity.
  select array_agg(candidate.id order by candidate.id),
    array_agg(candidate.revision order by candidate.id),array_agg(candidate.content_hash order by candidate.id)
    into document_ids,document_revisions,document_hashes from (
    select d.id,d.revision,md5(d.content::text) content_hash
    from public.pricing_documents d
    cross join lateral jsonb_array_elements(d.content->'lines') l
    left join public.pricing_promotions p
      on p.company_id=d.company_id and p.id=nullif(l->>'promotionId','')::uuid
    left join public.product_catalog x on x.company_id=p.company_id and x.id=p.product_id
    where d.archived_at is null and d.kind='sheet'
    group by d.id,d.company_id,d.revision,d.content
    having count(distinct p.id)=3
      and count(distinct p.id) filter(where p.tax_type='taxable' and x.tax_type='exempt')=3
      and encode(sha256(convert_to(jsonb_build_object(
        'company_id',d.company_id,'document_id',d.id,
        'promotion_ids',jsonb_agg(distinct p.id order by p.id) filter(where p.id is not null)
      )::text,'UTF8')),'hex')=expected_scope
  ) candidate;
  if coalesce(cardinality(document_ids),0)<>1 then raise exception 'promotion_tax_candidate_count_mismatch'; end if;
  document_id:=document_ids[1];
  -- SYNTHETIC_DOCUMENT_LOCK_INJECTION_POINT.
  select d.company_id into company from public.pricing_documents d
    where d.id=document_id and d.revision=document_revisions[1]
      and md5(d.content::text)=document_hashes[1] and d.archived_at is null and d.kind='sheet' for update;
  if not found then raise exception 'promotion_tax_document_changed_while_locking'; end if;
  select array_agg(distinct nullif(l->>'promotionId','')::uuid) filter(where l->>'promotionId' is not null)
    into promotion_ids from public.pricing_documents d
    cross join lateral jsonb_array_elements(d.content->'lines') l
    where d.company_id=company and d.id=document_id;
  if coalesce(cardinality(promotion_ids),0)<>3 then raise exception 'promotion_tax_target_count_mismatch'; end if;
  if expected_scope is distinct from encode(sha256(convert_to(jsonb_build_object(
      'company_id',company,'document_id',document_id,
      'promotion_ids',(select jsonb_agg(id order by id) from unnest(promotion_ids) id)
    )::text,'UTF8')),'hex') then
    raise exception 'promotion_tax_private_scope_mismatch';
  end if;
  perform 1 from public.pricing_promotions p where p.company_id=company and p.id=any(promotion_ids)
    order by p.id for update;
  perform 1 from public.product_catalog x where x.company_id=company and x.id in
    (select p.product_id from public.pricing_promotions p where p.company_id=company and p.id=any(promotion_ids))
    order by x.id for share;
  if (select count(*) from public.pricing_promotions p join public.product_catalog x
      on x.company_id=p.company_id and x.id=p.product_id
      where p.company_id=company and p.id=any(promotion_ids) and p.tax_type='taxable'
        and x.tax_type='exempt' and x.is_active and p.allow_sheet and p.revision>=1
        and p.starts_on<=day and p.ends_on>=day and p.stock is distinct from 0
        and coalesce(x.purchase_product_name,'') ~ '(계란|달걀|특란|대란|중란|왕란)'
        and p.price=public.pricing_p0_price(p.purchase_cost,p.margin_bp,10))<>3 then
    raise exception 'promotion_tax_precondition_or_price_mismatch';
  end if;
  select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]'::jsonb)::text) into publications_before
    from public.pricing_document_versions v where v.company_id=company;
  select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]'::jsonb)::text) into drafts_before
    from public.pricing_documents d where d.company_id=company;
  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text) into others_before
    from public.pricing_promotions p where p.company_id=company and not(p.id=any(promotion_ids));
  insert into promotion_tax_backup_20261119.promotion_rows
    (promotion_id,company_id,before_row,product_hash,publication_hash,draft_hash)
    select p.id,p.company_id,to_jsonb(p),md5(to_jsonb(x)::text),publications_before,drafts_before
    from public.pricing_promotions p join public.product_catalog x on x.company_id=p.company_id and x.id=p.product_id
    where p.company_id=company and p.id=any(promotion_ids);
  get diagnostics changed=row_count;
  if changed<>3 then raise exception 'promotion_tax_backup_count_mismatch'; end if;

  update public.pricing_promotions p set tax_type='exempt',revision=p.revision+1
    from promotion_tax_backup_20261119.promotion_rows b
    where p.company_id=b.company_id and p.id=b.promotion_id and to_jsonb(p)=b.before_row;
  get diagnostics changed=row_count;
  if changed<>3 then raise exception 'promotion_tax_write_conflict'; end if;
  -- SYNTHETIC_FAILURE_INJECTION_POINT (isolated tests only).
  if exists(select 1 from promotion_tax_backup_20261119.promotion_rows b
      join public.pricing_promotions p on p.company_id=b.company_id and p.id=b.promotion_id
      where p.tax_type<>'exempt' or p.revision<>(b.before_row->>'revision')::integer+1
        or (to_jsonb(p)-array['tax_type','revision','updated_at'])<>
           (b.before_row-array['tax_type','revision','updated_at'])) then
    raise exception 'promotion_tax_unexpected_field_or_price_change';
  end if;
  if publications_before is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]'::jsonb)::text)
      from public.pricing_document_versions v where v.company_id=company)
    or drafts_before is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]'::jsonb)::text)
      from public.pricing_documents d where d.company_id=company)
    or others_before is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text)
      from public.pricing_promotions p where p.company_id=company and not(p.id=any(promotion_ids))) then
    raise exception 'promotion_tax_document_or_other_row_changed';
  end if;
  update promotion_tax_backup_20261119.promotion_rows b set after_row=to_jsonb(p)
    from public.pricing_promotions p where p.company_id=b.company_id and p.id=b.promotion_id;
end $correction$;
-- No operating values/IDs are returned.
select count(*) as backed_up_rows,
  count(*) filter(where after_row->>'tax_type'='exempt') as corrected_rows,
  count(*) filter(where before_row->'price' is distinct from after_row->'price') as price_changes
from promotion_tax_backup_20261119.promotion_rows;
commit;
