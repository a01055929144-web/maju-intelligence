-- DRAFT ONLY. Requires import audit schema and customer_items drafts. Production unapplied.
begin;
alter table public.import_jobs drop constraint import_jobs_target_type_check;
alter table public.import_jobs add constraint import_jobs_target_type_check
  check(target_type in ('product','customer','supplier','price_sheet','document','customer_items'));

create function public.import_customer_items_audited(p_company uuid,p_file_name text,p_actor text,p_key text,p_rows jsonb,p_audit jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare job public.import_jobs; result jsonb; previous jsonb; a jsonb; keys text[] := array['customerName','productCode','salesUnit','lastPrice','lastDate','taxType','priceIncludesTax'];
begin
 if p_file_name is null or length(btrim(p_file_name)) not between 1 and 255
    or p_actor is null or length(p_actor)>200 or p_key is null or p_key !~ '^customer-items:[0-9a-f]{64}$'
    or p_rows is null or jsonb_typeof(p_rows)<>'array' or p_audit is null or jsonb_typeof(p_audit)<>'array' then
   raise exception 'Invalid audited import' using errcode='22023';
 end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 or jsonb_array_length(p_rows)<>jsonb_array_length(p_audit) then
   raise exception 'Audit row count mismatch' using errcode='22023';
 end if;
 for a in select value from jsonb_array_elements(p_audit) loop
   if jsonb_typeof(a)<>'object' or not a ?& array['source_row_number','raw_values','normalized_values']
      or (select count(*) from jsonb_object_keys(a))<>3
      or jsonb_typeof(a->'source_row_number')<>'number' or (a->>'source_row_number')::numeric <> trunc((a->>'source_row_number')::numeric)
      or (a->>'source_row_number')::int not between 2 and 1048576
      or jsonb_typeof(a->'raw_values')<>'object' or jsonb_typeof(a->'normalized_values')<>'object' then
     raise exception 'Invalid audit row' using errcode='22023';
   end if;
   if not (a->'raw_values') ?& keys or not (a->'normalized_values') ?& keys
      or (select count(*) from jsonb_object_keys(a->'raw_values'))<>7
      or (select count(*) from jsonb_object_keys(a->'normalized_values'))<>7 then
     raise exception 'Invalid audit fields' using errcode='22023';
   end if;
   if exists(select 1 from jsonb_each(a->'raw_values') where jsonb_typeof(value)<>'string' or length(value#>>'{}')>500)
      or exists(select 1 from jsonb_each(a->'normalized_values') where jsonb_typeof(value)<>'string' or length(value#>>'{}')>500) then
     raise exception 'Invalid audit values' using errcode='22023';
   end if;
 end loop;
 if exists(select 1 from jsonb_to_recordset(p_audit) as x(source_row_number int) group by source_row_number having count(*)>1) then
   raise exception 'Duplicate source row' using errcode='22023';
 end if;
 perform 1 from public.companies where id=p_company for update;
 if not found then raise exception 'Unknown company' using errcode='22023'; end if;
 select * into job from public.import_jobs where company_id=p_company and idempotency_key=p_key;
 if found then
   if job.target_type<>'customer_items' or job.status<>'completed' then raise exception 'Import retry conflict' using errcode='22023'; end if;
   return jsonb_build_object('applied',job.applied_rows,'skipped',job.skipped_rows,'replayed',true);
 end if;
 select jsonb_agg(to_jsonb(c) order by x.ordinality) into previous
 from jsonb_array_elements(p_rows) with ordinality x(value,ordinality)
 left join public.customer_items c on c.company_id=p_company and c.customer_id=(x.value->>'customer_id')::uuid
   and c.product_id=(x.value->>'product_id')::uuid and c.sales_unit=x.value->>'sales_unit';
 result := public.import_customer_items(p_company,p_rows);
 insert into public.import_jobs(company_id,target_type,file_name,idempotency_key,status,total_rows,valid_rows,applied_rows,skipped_rows,created_by_name,completed_at)
 values(p_company,'customer_items',btrim(p_file_name),p_key,'completed',jsonb_array_length(p_rows),jsonb_array_length(p_rows),
        (result->>'applied')::int,(result->>'skipped')::int,p_actor,clock_timestamp()) returning * into job;
 insert into public.import_rows(company_id,job_id,source_row_number,raw_values,normalized_values,previous_values,match_key,match_method,action,status,applied_at)
 select p_company,job.id,(a.value->>'source_row_number')::int,a.value->'raw_values',a.value->'normalized_values',
   nullif(previous->(x.ordinality::int-1),'null'::jsonb),
   concat(x.value->>'customer_id',':',x.value->>'product_id',':',x.value->>'sales_unit'),'manual',
   case when previous->(x.ordinality::int-1)='null'::jsonb then 'insert'
        when (previous->(x.ordinality::int-1)->>'last_date')::date < (x.value->>'last_date')::date then 'update' else 'skip' end,
   'applied',clock_timestamp()
 from jsonb_array_elements(p_rows) with ordinality x(value,ordinality)
 join jsonb_array_elements(p_audit) with ordinality a(value,ordinality) using(ordinality);
 return result || '{"replayed":false}'::jsonb;
end $$;
revoke all on function public.import_customer_items_audited(uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.import_customer_items_audited(uuid,text,text,text,jsonb,jsonb) to service_role;
commit;
