-- 검토 전용 SQL 초안. 운영 DB 적용 금지. migration 파일이 아니다.
-- PR #109의 앱 재시도 보완 뒤에도 남는 SELECT -> INSERT 경쟁과
-- lead 연결 -> action 기록 사이 실패 창을 한 DB transaction으로 줄이는 후보 계약이다.
-- 고객 검색/생성은 customer 모듈 소유이며 이 함수 범위에 포함하지 않는다.

begin;

create or replace function public.finalize_lead_customer_conversion_draft(
  p_company_id uuid,
  p_lead_id uuid,
  p_customer_id uuid,
  p_actor_name text default null
)
returns table (
  customer_id uuid,
  conversion_action_id uuid,
  action_created boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
set lock_timeout = '3s'
as $$
declare
  v_linked_customer_id uuid;
  v_action_id uuid;
  v_action_created boolean := false;
begin
  if p_company_id is null or p_lead_id is null or p_customer_id is null then
    raise exception 'company_lead_and_customer_required';
  end if;

  -- 모든 호출이 lead를 먼저 잠그고 customer를 두 번째로 확인한다.
  -- 같은 lead 전환은 직렬화되고 서로 다른 lead는 불필요하게 막지 않는다.
  select lead.matched_customer_id
    into v_linked_customer_id
  from public.business_permit_leads lead
  where lead.company_id = p_company_id
    and lead.id = p_lead_id
    and lead.merged_into_lead_id is null
  for update;

  if not found then
    raise exception 'company_scoped_lead_not_found';
  end if;

  perform 1
  from public.normalized_customers customer
  where customer.company_id = p_company_id
    and customer.id = p_customer_id
  for key share;

  if not found then
    raise exception 'company_scoped_customer_not_found';
  end if;

  if v_linked_customer_id is not null and v_linked_customer_id <> p_customer_id then
    raise exception 'lead_already_linked_to_another_customer';
  end if;

  update public.business_permit_leads lead
  set matched_customer_id = p_customer_id,
      matched_customer_at = coalesce(lead.matched_customer_at, clock_timestamp()),
      matched_customer_method = coalesce(lead.matched_customer_method, 'conversion'),
      matched_customer_confidence = coalesce(lead.matched_customer_confidence, 100),
      status = '거래처 전환',
      updated_at = clock_timestamp()
  where lead.company_id = p_company_id
    and lead.id = p_lead_id;

  select action.id
    into v_action_id
  from public.lead_actions action
  where action.company_id = p_company_id
    and action.lead_id = p_lead_id
    and action.action_type = 'convert'
  order by action.created_at, action.id
  limit 1;

  if v_action_id is null then
    insert into public.lead_actions (
      company_id, lead_id, action_type, result, actor_name
    ) values (
      p_company_id, p_lead_id, 'convert', '거래처 전환', nullif(btrim(p_actor_name), '')
    )
    returning id into v_action_id;
    v_action_created := true;
  end if;

  return query select p_customer_id, v_action_id, v_action_created;
end;
$$;

revoke all on function public.finalize_lead_customer_conversion_draft(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.finalize_lead_customer_conversion_draft(uuid, uuid, uuid, text)
  to service_role;

rollback;

-- 재현 시나리오 A: PR #109의 SELECT -> INSERT 경쟁
-- 1) 같은 company_id/lead_id로 두 앱 요청을 동시에 시작한다.
-- 2) 두 요청이 모두 action_type=convert 조회에서 0행을 읽을 수 있다.
-- 3) 현재 unique(company_id, lead_id, action_type) 제약이 없어 두 INSERT가 모두 성공한다.
-- 4) 이 함수 후보는 lead FOR UPDATE 뒤에 조회/INSERT하여 같은 lead를 직렬화한다.

-- 재현 시나리오 B: 부분 성공
-- 1) 앱의 lead PATCH가 성공한 직후 action POST를 실패시킨다.
-- 2) lead는 matched_customer_id/status가 바뀌었지만 convert action은 없다.
-- 3) PR #109 재시도는 이를 복구하지만 최초 요청 자체는 원자적이지 않다.
-- 4) 이 함수 후보에서는 lead UPDATE와 action INSERT가 함께 commit/rollback된다.

-- 남는 경계: 신규 normalized_customers 생성은 이 함수 밖이다. 신규 고객 중복까지 막으려면
-- customer 모듈이 회사 범위 자연키/멱등키 계약을 먼저 승인해야 한다.
