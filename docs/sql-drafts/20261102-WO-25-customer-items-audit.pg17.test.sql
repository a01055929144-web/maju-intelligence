\set ON_ERROR_STOP on
do $$ begin
 if current_database() !~ '^customer_items_test_ui(_[a-z0-9]+)?$' or current_setting('server_version_num')::int not between 170000 and 179999 then raise exception 'Disposable PG17 DB required'; end if;
end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
alter role service_role bypassrls;
create table public.companies(id uuid primary key);
create table public.normalized_customers(id uuid primary key,company_id uuid not null references public.companies(id),unique(company_id,id));
create table public.product_catalog(id uuid primary key,company_id uuid not null references public.companies(id),unique(company_id,id));
create table public.excel_mapping_presets(id uuid primary key,company_id uuid not null references public.companies(id));
grant usage on schema public to anon,authenticated,service_role;
grant select,update on public.companies to service_role;
grant select on public.normalized_customers,public.product_catalog to service_role;
\ir 20261102-WO-25-import-audit-schema.sql
\ir 20261102-WO-25-customer-items.sql
\ir 20261102-WO-25-customer-items-audit.sql
insert into public.companies values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.normalized_customers values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001');
insert into public.product_catalog values('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001');
create function public.test_fail_import_audit() returns trigger language plpgsql as $$ begin
 if new.file_name='fail.csv' then raise exception 'Synthetic audit failure'; end if; return new;
end $$;
create trigger test_fail_import_audit before insert on public.import_jobs for each row execute function public.test_fail_import_audit();
set role service_role;
do $$
declare
 company uuid := '00000000-0000-4000-8000-000000000001';
 row jsonb := '{"customer_id":"00000000-0000-4000-8000-000000000011","product_id":"00000000-0000-4000-8000-000000000021","sales_unit":"kg","last_price":1000,"last_date":"2026-10-29","tax_type":"unknown","price_includes_tax":null}';
 raw jsonb := '{"customerName":"합성 매장","productCode":"001","salesUnit":"kg","lastPrice":"900","lastDate":"2026-10-29","taxType":"","priceIncludesTax":""}';
 audit jsonb; response jsonb;
begin
 audit:=jsonb_build_array(jsonb_build_object('source_row_number',2,'raw_values',raw,'normalized_values',raw||'{"lastPrice":"1000"}'));
 response:=public.import_customer_items_audited(company,'synthetic.csv','합성 작성자','customer-items:'||repeat('1',64),jsonb_build_array(row),audit);
 if response <> '{"applied":1,"skipped":0,"replayed":false}' then raise exception 'Initial audited save failed'; end if;
 if (select count(*) from public.import_jobs)<>1 or (select count(*) from public.import_rows)<>1 then raise exception 'Missing audit'; end if;
 if (select raw_values->>'lastPrice'<>'900' or normalized_values->>'lastPrice'<>'1000' or previous_values is not null or action<>'insert' from public.import_rows) then raise exception 'Original/edited contract lost'; end if;
 response:=public.import_customer_items_audited(company,'synthetic.csv','합성 작성자','customer-items:'||repeat('1',64),jsonb_build_array(row),audit);
 if response->>'replayed'<>'true' or (select count(*) from public.import_rows)<>1 then raise exception 'Retry duplicated audit'; end if;
 audit:=jsonb_build_array(jsonb_build_object('source_row_number',1002,'raw_values',raw,'normalized_values',raw||'{"lastDate":"2026-10-30","lastPrice":"1200"}'));
 perform public.import_customer_items_audited(company,'newer.csv','합성 작성자','customer-items:'||repeat('2',64),jsonb_build_array(row||'{"last_date":"2026-10-30","last_price":1200}'),audit);
 if not exists(select 1 from public.import_rows where previous_values->>'last_price'='1000' and action='update' and source_row_number=1002) then raise exception 'Previous actual values/source row lost'; end if;
 begin
  perform public.import_customer_items_audited(company,'fail.csv','합성 작성자','customer-items:'||repeat('3',64),jsonb_build_array(row||'{"last_date":"2026-10-31","last_price":1300}'),audit);
  raise exception 'Expected synthetic failure';
 exception when raise_exception then
  if sqlerrm <> 'Synthetic audit failure' then raise; end if;
 end;
 if (select last_price from public.customer_items)<>1200 or (select count(*) from public.import_jobs)<>2 then raise exception 'Audit failure partially saved prices'; end if;
 begin
  perform public.import_customer_items_audited(company,'private.csv','합성 작성자','customer-items:'||repeat('4',64),jsonb_build_array(row),jsonb_build_array(jsonb_build_object('source_row_number',2,'raw_values',raw||'{"phone":"private"}','normalized_values',raw)));
  raise exception 'Private extra fields accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.import_customer_items_audited('00000000-0000-4000-8000-000000000002','cross.csv','합성 작성자','customer-items:'||repeat('5',64),jsonb_build_array(row),audit);
  raise exception 'Cross-company actual prices accepted';
 exception when foreign_key_violation then null; end;
 if has_function_privilege('anon','public.import_customer_items_audited(uuid,text,text,text,jsonb,jsonb)','EXECUTE')
 or has_function_privilege('authenticated','public.import_customer_items_audited(uuid,text,text,text,jsonb,jsonb)','EXECUTE') then raise exception 'Public audit RPC'; end if;
end $$;
reset role;
-- Synthetic fixture cleanup only. Real audit jobs must be exported/archived with explicit approval.
delete from public.import_jobs;
\ir 20261102-WO-25-customer-items-audit.down.sql
do $$ begin
 if to_regprocedure('public.import_customer_items_audited(uuid,text,text,text,jsonb,jsonb)') is not null then raise exception 'Audit down failed'; end if;
 if (select last_price from public.customer_items)<>1200 then raise exception 'Down removed actual data'; end if;
 if to_regprocedure('public.import_customer_items(uuid,jsonb)') is null then raise exception 'Legacy import lost'; end if;
end $$;
\echo 'PASS: customer items audit original/edited/previous values, retry, atomic rollback, company guard and down'
