\set ON_ERROR_STOP on
do $$ begin
  assert current_database() = 'order_money_safety_cx68_test';
  assert current_setting('server_version_num')::int / 10000 = 17;
end $$;
create extension if not exists pgcrypto;

create table companies(id uuid primary key);
create table product_catalog(id uuid primary key, company_id uuid not null references companies, price bigint not null);
create index on product_catalog(company_id, id);
create table store_orders(id uuid primary key, company_id uuid not null references companies, known_total bigint not null, delivery_fee bigint not null default 0, idempotency_key uuid not null, revision integer not null default 1, unique(company_id,idempotency_key));
create table store_order_lines(order_id uuid not null references store_orders, company_id uuid not null, total_amount bigint, is_market_price boolean not null default false);
create table business_documents(id uuid primary key, company_id uuid not null, source_id uuid not null, total_amount bigint not null, unique(company_id,source_id));
create table partner_ledger_entries(company_id uuid not null, source_document_id uuid not null, amount bigint not null);

create function cx68_assert_order_money(p_company uuid, p_order uuid) returns void language plpgsql as $$
declare o bigint; l bigint; d bigint; g bigint;
begin
  select known_total into strict o from store_orders where company_id=p_company and id=p_order;
  select coalesce(sum(total_amount),0)+(select delivery_fee from store_orders where id=p_order) into l from store_order_lines where company_id=p_company and order_id=p_order;
  select total_amount into d from business_documents where company_id=p_company and source_id=p_order;
  select coalesce(sum(e.amount),0) into g from partner_ledger_entries e join business_documents b on b.id=e.source_document_id and b.company_id=e.company_id where b.company_id=p_company and b.source_id=p_order;
  if o is distinct from l or d is not null and o is distinct from d or d is not null and o is distinct from g then
    raise exception 'order_money_mismatch order=% lines=% document=% ledger=%',o,l,d,g;
  end if;
end $$;

insert into companies select md5('company-'||n)::uuid from generate_series(1,3) n;
insert into product_catalog
select md5('product-'||c||'-'||p)::uuid, md5('company-'||c)::uuid, 1000+p
from generate_series(1,3) c cross join generate_series(1,5000) p;

do $$ declare started timestamptz; catalog_ms numeric; order_ms numeric; c uuid:=md5('company-1')::uuid; o uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); begin
  started:=clock_timestamp(); perform count(*) from product_catalog where company_id=c; catalog_ms:=extract(epoch from clock_timestamp()-started)*1000;
  assert (select count(*) from product_catalog where company_id=c)=5000;
  started:=clock_timestamp();
  insert into store_orders values(o,c,2200,0,gen_random_uuid(),1);
  insert into store_order_lines values(o,c,1100,false),(o,c,1100,false);
  insert into business_documents values(d,c,o,2200);
  insert into partner_ledger_entries values(c,d,2200);
  perform cx68_assert_order_money(c,o);
  order_ms:=extract(epoch from clock_timestamp()-started)*1000;
  assert catalog_ms < 10000, format('catalog query %s ms',catalog_ms);
  assert order_ms < 5000, format('order check %s ms',order_ms);
  raise notice 'CX-68 performance catalog_ms=% order_ms=%',round(catalog_ms,2),round(order_ms,2);
end $$;

do $$ declare c uuid:=md5('company-1')::uuid; o uuid:=(select id from store_orders limit 1); begin
  begin insert into store_orders select gen_random_uuid(),company_id,known_total,delivery_fee,idempotency_key,revision from store_orders where id=o;
    raise exception 'duplicate idempotency accepted'; exception when unique_violation then null; end;
  update store_order_lines set total_amount=1099 where order_id=o and ctid=(select ctid from store_order_lines where order_id=o limit 1);
  begin perform cx68_assert_order_money(c,o); raise exception 'mismatch accepted'; exception when raise_exception then assert sqlerrm like 'order_money_mismatch%'; end;
end $$;
select 'CX-68 scenarios 6 and 15 PG17 passed; CX-62 scenarios 3-5 remain isolated' result;
