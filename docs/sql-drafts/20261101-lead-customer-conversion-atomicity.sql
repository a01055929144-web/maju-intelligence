-- REVIEW-ONLY DRAFT. 운영 migration이 아니며 승인 없이 실행하지 않는다.
-- 고객 모듈이 customer를 생성/조회한 뒤, 영업 모듈 소유 lead 연결과 convert 이력만 원자화한다.
-- LEAD_CUSTOMER_CONVERSION_ATOMIC_ENABLED=false 동안 호출자는 기존 코드 경로를 유지한다.

begin;

do $$
begin
  if exists (
    select 1
    from public.lead_actions
    where action_type = 'convert'
    group by company_id, lead_id
    having count(*) > 1
  ) then
    raise exception using message = 'duplicate_lead_conversion_actions_require_reconciliation';
  end if;
end;
$$;

create unique index if not exists lead_actions_one_conversion_per_lead_draft
  on public.lead_actions (company_id, lead_id)
  where action_type = 'convert';

create or replace function public.finalize_lead_customer_conversion_draft(
  p_company_id uuid,
  p_lead_id uuid,
  p_customer_id uuid,
  p_actor_name text,
  p_rollout_enabled boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  lead public.business_permit_leads%rowtype;
  customer_row public.normalized_customers%rowtype;
  action_customer_id text;
begin
  if not p_rollout_enabled then
    raise exception using message = 'LEAD_CUSTOMER_CONVERSION_ATOMIC_ENABLED=false';
  end if;

  select * into lead
  from public.business_permit_leads
  where company_id = p_company_id and id = p_lead_id and merged_into_lead_id is null
  for update;
  if not found then raise exception using message = 'lead_not_found'; end if;

  select * into customer_row
  from public.normalized_customers customer
  where customer.company_id = p_company_id and customer.id = p_customer_id;
  if not found then raise exception using message = 'customer_not_found'; end if;

  if lead.matched_customer_id is not null and lead.matched_customer_id <> p_customer_id then
    raise exception using message = 'lead_customer_conversion_customer_mismatch';
  end if;

  select action.metadata ->> 'customer_id' into action_customer_id
  from public.lead_actions action
  where action.company_id = p_company_id
    and action.lead_id = p_lead_id
    and action.action_type = 'convert'
  for update;
  if action_customer_id is not null and action_customer_id <> p_customer_id::text then
    raise exception using message = 'lead_customer_conversion_customer_mismatch';
  end if;

  update public.business_permit_leads
  set matched_customer_id = p_customer_id,
      matched_customer_at = coalesce(matched_customer_at, clock_timestamp()),
      matched_customer_method = coalesce(matched_customer_method, 'conversion'),
      matched_customer_confidence = coalesce(matched_customer_confidence, 100),
      status = '거래처 전환',
      updated_at = clock_timestamp()
  where company_id = p_company_id and id = p_lead_id;

  insert into public.lead_actions (company_id, lead_id, action_type, result, actor_name, metadata)
  values (
    p_company_id,
    p_lead_id,
    'convert',
    '거래처 전환',
    nullif(btrim(p_actor_name), ''),
    jsonb_build_object('event_type', 'lead_customer_conversion', 'customer_id', p_customer_id)
  )
  on conflict (company_id, lead_id) where action_type = 'convert' do nothing;
end;
$$;

revoke all on function public.finalize_lead_customer_conversion_draft(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.finalize_lead_customer_conversion_draft(uuid, uuid, uuid, text, boolean)
  to service_role;

rollback;
