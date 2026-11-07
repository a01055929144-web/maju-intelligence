-- Disposable PG17 fixture: confirmed upload cost -> standard product -> P0 price.
begin;
alter table product_catalog add column source text not null default 'manual';
alter table product_catalog add column source_key text;
alter table product_catalog add column product_code text;
alter table product_catalog add column purchase_unit text not null default 'EA';
alter table product_catalog add column tax_type text;
alter table product_catalog add constraint product_catalog_source_uq unique(company_id,source,source_key);

create table supplier_products (
 id uuid primary key, company_id uuid not null references companies(id) on delete cascade,
 raw_name text not null, raw_unit text, latest_cost numeric(14,2), cost_confirmed boolean not null
);
create table supplier_product_matches (
 company_id uuid not null, supplier_product_id uuid not null references supplier_products(id),
 product_catalog_id uuid not null, match_status text not null,
 foreign key(company_id,product_catalog_id) references product_catalog(company_id,id)
);
insert into companies(id) values ('00000000-0000-4000-8000-000000000001');
insert into supplier_products(id,company_id,raw_name,raw_unit,latest_cost,cost_confirmed) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','샘플','EA',18910,true);

-- The same fields createCatalogFromSupplierProducts writes for a first upload.
insert into product_catalog(id,company_id,source,source_key,product_code,purchase_product_name,purchase_unit,purchase_price,tax_type)
select '10000000-0000-4000-8000-000000000001',company_id,'supplier','standard:'||id,'P-000001',raw_name,raw_unit,latest_cost,'taxable'
from supplier_products where cost_confirmed;
-- Date-aware uploads defer the first real cost to the atomic dated batch.
-- The production column is NOT NULL, so zero is the unpriced sentinel.
insert into product_catalog(id,company_id,source,source_key,product_code,purchase_product_name,purchase_unit,purchase_price,tax_type)
values ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','supplier','standard:dated-batch-fixture','P-000002','날짜 배치 샘플','EA',0,'taxable');
insert into supplier_product_matches(company_id,supplier_product_id,product_catalog_id,match_status)
values ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','confirmed');
grant select on supplier_product_matches to service_role;

set local role service_role;
do $$
declare c uuid := '00000000-0000-4000-8000-000000000001';
begin
 if (select purchase_price from product_catalog where company_id=c and id='10000000-0000-4000-8000-000000000002')<>0 then
   raise exception 'Dated batch product is not schema-safe unpriced';
 end if;
 if (select count(*) from supplier_product_matches where company_id=c and match_status='confirmed')<>1 then
   raise exception 'First standard product is not connected';
 end if;
 perform pricing_p0_command(c,'{"action":"defaults","margin":12,"rounding":10}');
 perform pricing_p0_command(c,'{"action":"recalculate"}');
 if (select price from pricing_items where company_id=c and product_id='10000000-0000-4000-8000-000000000001')<>21180 then
   raise exception 'P0 did not recalculate imported cost';
 end if;
end $$;
rollback;
