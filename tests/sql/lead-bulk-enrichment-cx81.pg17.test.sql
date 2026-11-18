do $$ begin if current_setting('server_version_num')::int/10000 <> 17 then raise exception 'cx81_pg17_required'; end if; end $$;
create role anon; create role authenticated; create role service_role;
create table public.companies(id uuid primary key);
create table public.business_permit_leads(company_id uuid not null references public.companies(id), id uuid not null, merged_into_lead_id uuid, primary key(company_id,id));
insert into public.companies values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.business_permit_leads
select '10000000-0000-4000-8000-000000000001', ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, null from generate_series(1,50)n;
insert into public.business_permit_leads values
('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000051',null),
('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000052',null);
\ir ../../docs/sql-drafts/20261117-CX-81-lead-bulk-enrichment.sql

do $$ declare j jsonb; a jsonb; b jsonb; begin
  j:=public.create_lead_bulk_enrichment_job('10000000-0000-4000-8000-000000000001','instagram_candidates',array(select id from public.business_permit_leads where company_id='10000000-0000-4000-8000-000000000001' order by id),'20000000-0000-4000-8000-000000000001','tester');
  if (j->>'total_items')::int<>50 then raise exception 'expected_50'; end if;
  a:=public.claim_lead_bulk_enrichment_item('10000000-0000-4000-8000-000000000001',(j->>'id')::uuid,50);
  perform public.complete_lead_bulk_enrichment_item('10000000-0000-4000-8000-000000000001',(a->>'id')::uuid,true,'{"candidates":[{"url":"https://instagram.com/candidate"}]}'::jsonb,null);
  b:=public.claim_lead_bulk_enrichment_item('10000000-0000-4000-8000-000000000001',(j->>'id')::uuid,50);
  if (b->>'position')::int<>2 then raise exception 'not_sequential'; end if;
  perform public.complete_lead_bulk_enrichment_item('10000000-0000-4000-8000-000000000001',(b->>'id')::uuid,false,'{}','fake');
  perform public.retry_lead_bulk_enrichment_failures('10000000-0000-4000-8000-000000000001',(j->>'id')::uuid);
  if not exists(select 1 from public.lead_bulk_enrichment_items where job_id=(j->>'id')::uuid and status='pending' and attempts_today=1) then raise exception 'retry_failed'; end if;
  perform public.cancel_lead_bulk_enrichment_job('10000000-0000-4000-8000-000000000001',(j->>'id')::uuid);
  if public.claim_lead_bulk_enrichment_item('10000000-0000-4000-8000-000000000001',(j->>'id')::uuid,50) is not null then raise exception 'cancel_failed'; end if;
  begin perform public.claim_lead_bulk_enrichment_item('10000000-0000-4000-8000-000000000002',(j->>'id')::uuid,50); raise exception 'tenant_leak'; exception when others then if sqlerrm='tenant_leak' then raise; end if; end;
end $$;

do $$ begin
  begin perform public.create_lead_bulk_enrichment_job('10000000-0000-4000-8000-000000000001','external_info',array['40000000-0000-4000-8000-000000000051'::uuid],'20000000-0000-4000-8000-000000000002','tester'); raise exception 'cross_tenant_lead';
  exception when others then if sqlerrm='cross_tenant_lead' then raise; end if; end;
  if has_function_privilege('anon','public.claim_lead_bulk_enrichment_item(uuid,uuid,integer)','execute') then raise exception 'anon_rpc_access'; end if;
  if has_function_privilege('authenticated','public.claim_lead_bulk_enrichment_item(uuid,uuid,integer)','execute') then raise exception 'authenticated_rpc_access'; end if;
end $$;

do $$ declare j jsonb; a jsonb; begin
  j:=public.create_lead_bulk_enrichment_job('10000000-0000-4000-8000-000000000002','external_info',array['40000000-0000-4000-8000-000000000051'::uuid,'40000000-0000-4000-8000-000000000052'::uuid],'20000000-0000-4000-8000-000000000003','tester');
  a:=public.claim_lead_bulk_enrichment_item('10000000-0000-4000-8000-000000000002',(j->>'id')::uuid,1);
  perform public.complete_lead_bulk_enrichment_item('10000000-0000-4000-8000-000000000002',(a->>'id')::uuid,true,'{}',null);
  if public.claim_lead_bulk_enrichment_item('10000000-0000-4000-8000-000000000002',(j->>'id')::uuid,1) is not null then raise exception 'daily_cap_failed'; end if;
  if (select error_code from public.lead_bulk_enrichment_jobs where id=(j->>'id')::uuid) <> 'daily_limit_exceeded' then raise exception 'daily_cap_not_recorded'; end if;
end $$;
select 'cx81_lead_bulk_enrichment_pg17_pass';
