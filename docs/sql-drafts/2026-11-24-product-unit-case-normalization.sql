-- DRAFT ONLY. Requires project-specific representative approval before operating use.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create schema product_unit_case_backup_20261124;
revoke all on schema product_unit_case_backup_20261124 from public,anon,authenticated,service_role;
create table product_unit_case_backup_20261124.run_state(
  singleton boolean primary key default true check(singleton), company_id uuid not null,
  publication_hash text not null, fixed_price_hash text not null, non_draft_quote_hash text not null,
  product_count integer not null, document_count integer not null, document_line_count integer not null,
  quote_count integer not null, quote_line_count integer not null,
  applied_at timestamptz not null default clock_timestamp(), restored_at timestamptz
);
create table product_unit_case_backup_20261124.product_rows(
  company_id uuid not null,id uuid primary key,before_row jsonb not null,after_row jsonb
);
create table product_unit_case_backup_20261124.document_rows(
  company_id uuid not null,id uuid primary key,before_row jsonb not null,after_row jsonb
);
create table product_unit_case_backup_20261124.quote_item_rows(
  company_id uuid not null,id uuid primary key,before_row jsonb not null,after_row jsonb
);
alter table product_unit_case_backup_20261124.run_state enable row level security;
alter table product_unit_case_backup_20261124.product_rows enable row level security;
alter table product_unit_case_backup_20261124.document_rows enable row level security;
alter table product_unit_case_backup_20261124.quote_item_rows enable row level security;
revoke all on all tables in schema product_unit_case_backup_20261124 from public,anon,authenticated,service_role;

do $normalize$
declare company uuid; products integer; documents integer; document_lines integer; quotes integer; quote_lines integer;
  publication_hash text; fixed_price_hash text; non_draft_quote_hash text; changed integer;
begin
  select (array_agg(distinct company_id))[1],count(*) into company,products from public.product_catalog
  where (purchase_unit is not null and purchase_unit<>upper(purchase_unit) and purchase_unit~'[a-z]')
     or (sales_unit is not null and sales_unit<>upper(sales_unit) and sales_unit~'[a-z]');
  if products<>169 or (select count(distinct company_id) from public.product_catalog where
      (purchase_unit is not null and purchase_unit<>upper(purchase_unit) and purchase_unit~'[a-z]')
      or (sales_unit is not null and sales_unit<>upper(sales_unit) and sales_unit~'[a-z]'))<>1
  then raise exception 'product_unit_scope_changed'; end if;

  select count(distinct d.id),count(*) into documents,document_lines
  from public.pricing_documents d cross join lateral jsonb_array_elements(coalesce(d.content->'lines','[]')) l
  join public.product_catalog p on p.company_id=d.company_id and p.id=nullif(l->>'productId','')::uuid
  where d.company_id=company and l->>'unit'<>upper(l->>'unit') and l->>'unit'~'[a-z]'
    and ((p.purchase_unit<>upper(p.purchase_unit) and p.purchase_unit~'[a-z]') or (p.sales_unit<>upper(p.sales_unit) and p.sales_unit~'[a-z]'));
  select count(distinct q.id),count(*) into quotes,quote_lines
  from public.sales_quotes q join public.sales_quote_items i on i.company_id=q.company_id and i.quote_id=q.id
  join public.product_catalog p on p.company_id=i.company_id and p.id=i.product_catalog_id
  where q.company_id=company and q.status='draft' and (
    (i.unit<>upper(i.unit) and i.unit~'[a-z]')
    or (i.sales_unit_snapshot<>upper(i.sales_unit_snapshot) and i.sales_unit_snapshot~'[a-z]')
    or (i.purchase_unit_snapshot<>upper(i.purchase_unit_snapshot) and i.purchase_unit_snapshot~'[a-z]'));
  if documents<>1 or document_lines<>2 or quotes<>0 or quote_lines<>0 then raise exception 'product_unit_draft_scope_changed'; end if;

  select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]')::text) into publication_hash
    from public.pricing_document_versions v where v.company_id=company;
  select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]')::text) into fixed_price_hash
    from public.customer_price_agreements a where a.company_id=company;
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]')::text) into non_draft_quote_hash from (
    select q.id,q.company_id,q.status,to_jsonb(q) quote,
      coalesce(jsonb_agg(to_jsonb(i) order by i.id) filter(where i.id is not null),'[]') items
    from public.sales_quotes q left join public.sales_quote_items i on i.company_id=q.company_id and i.quote_id=q.id
    where q.company_id=company and q.status<>'draft' group by q.id,q.company_id,q.status
  ) x;
  insert into product_unit_case_backup_20261124.run_state values(true,company,publication_hash,fixed_price_hash,non_draft_quote_hash,products,documents,document_lines,quotes,quote_lines,clock_timestamp(),null);

  perform 1 from public.product_catalog p where p.company_id=company and
    ((p.purchase_unit<>upper(p.purchase_unit) and p.purchase_unit~'[a-z]') or (p.sales_unit<>upper(p.sales_unit) and p.sales_unit~'[a-z]')) order by p.id for update;
  insert into product_unit_case_backup_20261124.product_rows
    select p.company_id,p.id,to_jsonb(p),null from public.product_catalog p where p.company_id=company and
    ((p.purchase_unit<>upper(p.purchase_unit) and p.purchase_unit~'[a-z]') or (p.sales_unit<>upper(p.sales_unit) and p.sales_unit~'[a-z]'));
  if (select count(*) from product_unit_case_backup_20261124.product_rows)<>169 then raise exception 'product_unit_backup_mismatch'; end if;

  insert into product_unit_case_backup_20261124.document_rows
  select d.company_id,d.id,to_jsonb(d),null from public.pricing_documents d where d.company_id=company and exists(
    select 1 from jsonb_array_elements(coalesce(d.content->'lines','[]')) l
    join product_unit_case_backup_20261124.product_rows b on b.id=nullif(l->>'productId','')::uuid
    where l->>'unit'<>upper(l->>'unit') and l->>'unit'~'[a-z]') for update;
  insert into product_unit_case_backup_20261124.quote_item_rows
  select i.company_id,i.id,to_jsonb(i),null from public.sales_quote_items i join public.sales_quotes q
    on q.company_id=i.company_id and q.id=i.quote_id join product_unit_case_backup_20261124.product_rows b on b.id=i.product_catalog_id
    where i.company_id=company and q.status='draft' and (
      (i.unit<>upper(i.unit) and i.unit~'[a-z]')
      or (i.sales_unit_snapshot<>upper(i.sales_unit_snapshot) and i.sales_unit_snapshot~'[a-z]')
      or (i.purchase_unit_snapshot<>upper(i.purchase_unit_snapshot) and i.purchase_unit_snapshot~'[a-z]')) for update of i;

  update public.product_catalog p set
    purchase_unit=case when p.purchase_unit<>upper(p.purchase_unit) and p.purchase_unit~'[a-z]' then upper(p.purchase_unit) else p.purchase_unit end,
    sales_unit=case when p.sales_unit<>upper(p.sales_unit) and p.sales_unit~'[a-z]' then upper(p.sales_unit) else p.sales_unit end,
    updated_at=clock_timestamp()
  from product_unit_case_backup_20261124.product_rows b where p.company_id=b.company_id and p.id=b.id;
  get diagnostics changed=row_count; if changed<>169 then raise exception 'product_unit_write_mismatch'; end if;

  update public.pricing_documents d set content=jsonb_set(d.content,'{lines}',(
    select jsonb_agg(case when b.id is not null and l.item->>'unit'<>upper(l.item->>'unit') and l.item->>'unit'~'[a-z]'
      then jsonb_set(l.item,'{unit}',to_jsonb(upper(l.item->>'unit'))) else l.item end order by l.n)
    from jsonb_array_elements(d.content->'lines') with ordinality l(item,n)
    left join product_unit_case_backup_20261124.product_rows b on b.id=nullif(l.item->>'productId','')::uuid
  )),revision=d.revision+1,updated_at=clock_timestamp()
  from product_unit_case_backup_20261124.document_rows b where d.company_id=b.company_id and d.id=b.id;

  update public.sales_quote_items i set unit=upper(i.unit),sales_unit_snapshot=upper(i.sales_unit_snapshot),
    purchase_unit_snapshot=upper(i.purchase_unit_snapshot),updated_at=clock_timestamp()
  from product_unit_case_backup_20261124.quote_item_rows b where i.company_id=b.company_id and i.id=b.id;

  update product_unit_case_backup_20261124.product_rows b set after_row=to_jsonb(p) from public.product_catalog p where p.company_id=b.company_id and p.id=b.id;
  update product_unit_case_backup_20261124.document_rows b set after_row=to_jsonb(d) from public.pricing_documents d where d.company_id=b.company_id and d.id=b.id;
  update product_unit_case_backup_20261124.quote_item_rows b set after_row=to_jsonb(i) from public.sales_quote_items i where i.company_id=b.company_id and i.id=b.id;

  if exists(select 1 from public.product_catalog p join product_unit_case_backup_20261124.product_rows b on b.id=p.id
      where p.purchase_unit<>upper(p.purchase_unit) or p.sales_unit<>upper(p.sales_unit))
    or publication_hash is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]')::text) from public.pricing_document_versions v where v.company_id=company)
    or fixed_price_hash is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]')::text) from public.customer_price_agreements a where a.company_id=company)
    or non_draft_quote_hash is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]')::text) from (
      select q.id,q.company_id,q.status,to_jsonb(q) quote,
        coalesce(jsonb_agg(to_jsonb(i) order by i.id) filter(where i.id is not null),'[]') items
      from public.sales_quotes q left join public.sales_quote_items i on i.company_id=q.company_id and i.quote_id=q.id
      where q.company_id=company and q.status<>'draft' group by q.id,q.company_id,q.status
    ) x)
  then raise exception 'product_unit_protected_data_changed'; end if;
end $normalize$;
select product_count,document_count,document_line_count,quote_count,quote_line_count from product_unit_case_backup_20261124.run_state;
commit;
