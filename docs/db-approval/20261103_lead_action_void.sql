-- 11/3 컨택 기록 취소(0033 §4). 운영 DB fcmdvveqmcgtioelzqun 승인 문구 필요.
-- 기록은 지우지 않고 '취소됨'으로 표시(감사 추적 유지). 리드의 최근 연락 요약은 취소 안 된 최신 기록으로 다시 계산.
begin;
alter table public.lead_actions
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by text,
  add column if not exists void_reason text;

create or replace function public.void_lead_action_v1(p_company_id uuid, p_action_id uuid, p_actor text, p_reason text)
returns table (lead_id uuid, voided boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare v_lead uuid;
begin
  update public.lead_actions a
     set voided_at = now(), voided_by = left(coalesce(p_actor, ''), 80), void_reason = left(coalesce(p_reason, ''), 200)
   where a.company_id = p_company_id and a.id = p_action_id and a.voided_at is null
  returning a.lead_id into v_lead;
  if v_lead is null then
    return query select null::uuid, false;
    return;
  end if;

  update public.business_permit_leads lead
     set last_contact_at = latest.created_at,
         last_contact_channel = latest.action_type,
         last_contact_summary = latest.summary
    from (select null::int as k) dummy
    left join lateral (
      select x.created_at, x.action_type, left(coalesce(nullif(x.result, ''), nullif(x.memo, ''), x.action_type), 240) as summary
        from public.lead_actions x
       where x.company_id = p_company_id and x.lead_id = v_lead and x.voided_at is null
         and x.action_type in ('call','dm','visit','quote','sms','talktalk','email','fax')
       order by x.created_at desc limit 1
    ) latest on true
   where lead.company_id = p_company_id and lead.id = v_lead;

  return query select v_lead, true;
end;
$$;
revoke all on function public.void_lead_action_v1(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.void_lead_action_v1(uuid, uuid, text, text) to service_role;
commit;
