-- DRAFT ONLY: no production application. Fresh local test DB only.
-- Prerequisites: existing companies, normalized_customers/company_id,id UNIQUE,
-- product_catalog/company_id,id UNIQUE (reuse existing composite keys).
begin;
create table public.customer_items (
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  product_id uuid not null,
  sales_unit text not null check(length(btrim(sales_unit)) between 1 and 40 and sales_unit = btrim(sales_unit)),
  last_price bigint not null check(last_price between 0 and 1000000000000),
  last_date date not null check(last_date >= date '1900-01-01'),
  source text not null default 'excel' check(source = 'excel'),
  tax_type text not null check(tax_type in ('taxable','exempt','unknown')),
  price_includes_tax boolean,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(company_id,customer_id,product_id,sales_unit),
  foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete cascade,
  foreign key(company_id,product_id) references public.product_catalog(company_id,id) on delete cascade,
  check((tax_type = 'unknown' and price_includes_tax is null) or (tax_type <> 'unknown' and price_includes_tax is not null))
);
comment on table public.customer_items is 'Imported latest actual sales price by customer/product/sales unit. Not a base price, fixed-price agreement, voucher or receivable.';
create index customer_items_product_idx on public.customer_items(company_id,product_id);
alter table public.customer_items enable row level security;
revoke all on public.customer_items from public,anon,authenticated,service_role;
grant select,insert,update on public.customer_items to service_role;

create function public.import_customer_items(p_company uuid,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare r jsonb; applied integer; total integer;
begin
  if p_company is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Invalid customer item import' using errcode = '22023';
  end if;
  total := jsonb_array_length(p_rows);
  if total < 1 or total > 1000 then raise exception 'Invalid import size' using errcode = '22023'; end if;
  -- Company lock serializes competing batches, including same-date conflict checks.
  perform 1 from public.companies where id=p_company for update;
  if not found then raise exception 'Unknown company' using errcode = '22023'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) <> 'object' then raise exception 'Invalid import row' using errcode = '22023'; end if;
    if (select count(*) from jsonb_object_keys(r)) <> 7
       or not r ?& array['customer_id','product_id','sales_unit','last_price','last_date','tax_type','price_includes_tax']
       or jsonb_typeof(r->'customer_id') <> 'string' or jsonb_typeof(r->'product_id') <> 'string'
       or jsonb_typeof(r->'sales_unit') <> 'string' or length(btrim(r->>'sales_unit')) not between 1 and 40
       or (r->>'sales_unit') <> btrim(r->>'sales_unit')
       or jsonb_typeof(r->'last_price') <> 'number'
       or (r->>'last_price')::numeric not between 0 and 1000000000000
       or trunc((r->>'last_price')::numeric) <> (r->>'last_price')::numeric
       or jsonb_typeof(r->'last_date') <> 'string' or (r->>'last_date') !~ '^\d{4}-\d{2}-\d{2}$'
       or (r->>'last_date')::date < date '1900-01-01'
       or (r->>'last_date')::date > (statement_timestamp() at time zone 'Asia/Seoul')::date
       or jsonb_typeof(r->'tax_type') <> 'string' or (r->>'tax_type') not in ('taxable','exempt','unknown')
       or case when r->>'tax_type' = 'unknown' then jsonb_typeof(r->'price_includes_tax') <> 'null'
               else jsonb_typeof(r->'price_includes_tax') <> 'boolean' end then
      raise exception 'Invalid actual price row' using errcode = '22023';
    end if;
  end loop;
  if exists(select 1 from jsonb_to_recordset(p_rows) as x(customer_id uuid,product_id uuid,sales_unit text)
            group by customer_id,product_id,sales_unit having count(*)>1) then
    raise exception 'Duplicate customer product unit' using errcode = '22023';
  end if;
  -- Check every reference, even an older row that would otherwise be skipped.
  if exists(select 1 from jsonb_to_recordset(p_rows) as x(customer_id uuid,product_id uuid)
    where not exists(select 1 from public.normalized_customers c where c.company_id=p_company and c.id=x.customer_id)
       or not exists(select 1 from public.product_catalog p where p.company_id=p_company and p.id=x.product_id)) then
    raise exception 'Invalid company relationship' using errcode = '23503';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_rows)
    as x(customer_id uuid,product_id uuid,sales_unit text,last_price bigint,last_date date,tax_type text,price_includes_tax boolean)
    join public.customer_items c on c.company_id=p_company and c.customer_id=x.customer_id and c.product_id=x.product_id and c.sales_unit=x.sales_unit
    where c.last_date=x.last_date and (c.last_price,c.tax_type,c.price_includes_tax) is distinct from (x.last_price,x.tax_type,x.price_includes_tax)) then
    raise exception 'Conflicting actual prices on the same date' using errcode = '22023';
  end if;
  insert into public.customer_items(company_id,customer_id,product_id,sales_unit,last_price,last_date,tax_type,price_includes_tax)
    select p_company,customer_id,product_id,sales_unit,last_price,last_date,tax_type,price_includes_tax
    from jsonb_to_recordset(p_rows) as x(customer_id uuid,product_id uuid,sales_unit text,last_price bigint,last_date date,tax_type text,price_includes_tax boolean)
    on conflict(company_id,customer_id,product_id,sales_unit) do update
      set last_price=excluded.last_price,last_date=excluded.last_date,tax_type=excluded.tax_type,
          price_includes_tax=excluded.price_includes_tax,source='excel',updated_at=clock_timestamp()
      where customer_items.last_date < excluded.last_date;
  get diagnostics applied = row_count;
  return jsonb_build_object('applied',applied,'skipped',total-applied);
end $$;
revoke all on function public.import_customer_items(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_customer_items(uuid,jsonb) to service_role;
commit;
