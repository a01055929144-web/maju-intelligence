-- CX-81 review draft only. Do not apply without DB approval.
create table if not exists public.lead_bulk_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  action text not null check (action in ('external_info','place_links','instagram_candidates')),
  status text not null default 'queued' check (status in ('queued','running','completed','cancelled','failed')),
  idempotency_key uuid not null,
  lead_ids uuid[] not null check (cardinality(lead_ids) between 1 and 5000),
  total_items smallint not null check (total_items between 1 and 5000),
  succeeded_items smallint not null default 0,
  failed_items smallint not null default 0,
  actor_name text not null,
  cancel_requested_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (company_id, idempotency_key),
  unique (company_id, id)
);

create table if not exists public.lead_bulk_enrichment_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  job_id uuid not null,
  lead_id uuid not null,
  action text not null,
  position smallint not null check (position between 1 and 5000),
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','cancelled')),
  attempts_today smallint not null default 0,
  attempt_day date,
  result jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  unique (job_id, lead_id), unique (job_id, position),
  foreign key (company_id, job_id) references public.lead_bulk_enrichment_jobs(company_id, id) on delete cascade,
  foreign key (company_id, lead_id) references public.business_permit_leads(company_id, id) on delete cascade
);

create index if not exists lead_bulk_enrichment_items_claim_idx
  on public.lead_bulk_enrichment_items(company_id, job_id, status, position);

alter table public.lead_bulk_enrichment_jobs enable row level security;
alter table public.lead_bulk_enrichment_items enable row level security;
revoke all on public.lead_bulk_enrichment_jobs, public.lead_bulk_enrichment_items from public, anon, authenticated;
grant select, insert, update on public.lead_bulk_enrichment_jobs, public.lead_bulk_enrichment_items to service_role;

create or replace function public.create_lead_bulk_enrichment_job(p_company_id uuid, p_action text, p_lead_ids uuid[], p_idempotency_key uuid, p_actor_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_job public.lead_bulk_enrichment_jobs; v_count int; v_ids uuid[];
begin
  if p_action not in ('external_info','place_links','instagram_candidates') or cardinality(p_lead_ids) not between 1 and 5000 then raise exception 'invalid_bulk_request'; end if;
  select array_agg(id order by ord), count(*) into v_ids, v_count
  from (select distinct on (l.id) l.id, u.ord from unnest(p_lead_ids) with ordinality u(id,ord)
        join public.business_permit_leads l on l.id=u.id and l.company_id=p_company_id and l.merged_into_lead_id is null order by l.id,u.ord) s;
  if v_count <> cardinality(p_lead_ids) then raise exception 'lead_not_found_or_duplicate'; end if;
  select * into v_job from public.lead_bulk_enrichment_jobs where company_id=p_company_id and idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_job); end if;
  insert into public.lead_bulk_enrichment_jobs(company_id,action,idempotency_key,lead_ids,total_items,actor_name)
  values(p_company_id,p_action,p_idempotency_key,v_ids,v_count,p_actor_name) returning * into v_job;
  insert into public.lead_bulk_enrichment_items(company_id,job_id,lead_id,action,position)
  select p_company_id,v_job.id,id,p_action,ord::smallint from unnest(v_ids) with ordinality u(id,ord);
  return to_jsonb(v_job);
end $$;

create or replace function public.claim_lead_bulk_enrichment_item(p_company_id uuid, p_job_id uuid, p_daily_cap int)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_job public.lead_bulk_enrichment_jobs; v_item public.lead_bulk_enrichment_items; v_used int;
begin
  select * into v_job from public.lead_bulk_enrichment_jobs where company_id=p_company_id and id=p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if p_daily_cap not between 1 and 1000 then raise exception 'invalid_daily_cap'; end if;
  if v_job.cancel_requested_at is not null then
    update public.lead_bulk_enrichment_items set status='cancelled',finished_at=now() where company_id=p_company_id and job_id=p_job_id and status='pending';
    update public.lead_bulk_enrichment_jobs set status='cancelled',finished_at=now() where company_id=p_company_id and id=p_job_id returning * into v_job; return null;
  end if;
  if v_job.status in ('completed','cancelled','failed') then return null; end if;
  if exists (select 1 from public.lead_bulk_enrichment_items where company_id=p_company_id and job_id=p_job_id and status='running') then return null; end if;
  select coalesce(sum(attempts_today),0) into v_used from public.lead_bulk_enrichment_items where company_id=p_company_id and attempt_day=(now() at time zone 'Asia/Seoul')::date;
  if v_used >= greatest(1,p_daily_cap) then
    update public.lead_bulk_enrichment_jobs set status='queued',error_code='daily_limit_exceeded',finished_at=null where id=p_job_id;
    return null;
  end if;
  select * into v_item from public.lead_bulk_enrichment_items where company_id=p_company_id and job_id=p_job_id and status='pending' order by position limit 1 for update skip locked;
  if not found then return null; end if;
  update public.lead_bulk_enrichment_items set status='running',attempts_today=case when attempt_day=(now() at time zone 'Asia/Seoul')::date then attempts_today+1 else 1 end,
    attempt_day=(now() at time zone 'Asia/Seoul')::date,started_at=now(),finished_at=null where id=v_item.id returning * into v_item;
  update public.lead_bulk_enrichment_jobs set status='running',started_at=coalesce(started_at,now()),finished_at=null,error_code=null where id=p_job_id;
  return to_jsonb(v_item);
end $$;

create or replace function public.complete_lead_bulk_enrichment_item(p_company_id uuid,p_item_id uuid,p_ok boolean,p_result jsonb default '{}'::jsonb,p_error text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_job_id uuid; v_pending int;
begin
  update public.lead_bulk_enrichment_items set status=case when p_ok then 'succeeded' else 'failed' end,result=case when p_ok then p_result else null end,
    error_message=case when p_ok then null else left(coalesce(p_error,'processing_failed'),1000) end,finished_at=now()
    where company_id=p_company_id and id=p_item_id and status='running' returning job_id into v_job_id;
  if not found then raise exception 'item_not_running'; end if;
  select count(*) into v_pending from public.lead_bulk_enrichment_items where job_id=v_job_id and status in ('pending','running');
  update public.lead_bulk_enrichment_jobs j set succeeded_items=(select count(*) from public.lead_bulk_enrichment_items where job_id=v_job_id and status='succeeded'),
    failed_items=(select count(*) from public.lead_bulk_enrichment_items where job_id=v_job_id and status='failed'),
    status=case when v_pending=0 then 'completed' else j.status end,finished_at=case when v_pending=0 then now() else null end where id=v_job_id;
end $$;

create or replace function public.cancel_lead_bulk_enrichment_job(p_company_id uuid,p_job_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_job public.lead_bulk_enrichment_jobs; begin update public.lead_bulk_enrichment_jobs set cancel_requested_at=coalesce(cancel_requested_at,now()) where company_id=p_company_id and id=p_job_id returning * into v_job;
if not found then raise exception 'job_not_found'; end if; return to_jsonb(v_job); end $$;

create or replace function public.retry_lead_bulk_enrichment_failures(p_company_id uuid,p_job_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
 declare v_job public.lead_bulk_enrichment_jobs; begin
 select * into v_job from public.lead_bulk_enrichment_jobs where company_id=p_company_id and id=p_job_id for update;
 if not found then raise exception 'job_not_found'; end if;
 if v_job.status='cancelled' or v_job.cancel_requested_at is not null then raise exception 'job_cancelled'; end if;
update public.lead_bulk_enrichment_items set status='pending',result=null,error_message=null,started_at=null,finished_at=null where company_id=p_company_id and job_id=p_job_id and status='failed';
if not found then raise exception 'no_failed_items'; end if;
update public.lead_bulk_enrichment_jobs set status='queued',failed_items=0,finished_at=null,error_code=null,cancel_requested_at=null where company_id=p_company_id and id=p_job_id returning * into v_job;
 return to_jsonb(v_job); end $$;

revoke all on function public.create_lead_bulk_enrichment_job(uuid,text,uuid[],uuid,text), public.claim_lead_bulk_enrichment_item(uuid,uuid,int), public.complete_lead_bulk_enrichment_item(uuid,uuid,boolean,jsonb,text), public.cancel_lead_bulk_enrichment_job(uuid,uuid), public.retry_lead_bulk_enrichment_failures(uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_lead_bulk_enrichment_job(uuid,text,uuid[],uuid,text), public.claim_lead_bulk_enrichment_item(uuid,uuid,int), public.complete_lead_bulk_enrichment_item(uuid,uuid,boolean,jsonb,text), public.cancel_lead_bulk_enrichment_job(uuid,uuid), public.retry_lead_bulk_enrichment_failures(uuid,uuid) to service_role;
