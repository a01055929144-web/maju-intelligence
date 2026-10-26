-- Claude 검토용 초안. 운영 적용 금지.
-- 적용 전 SECURITY INVOKER, 테넌트 경계, 권한, 기존 데이터 충돌을 재검토한다.
begin;

create or replace function public.register_lead_do_not_contact(
  p_company_id uuid,
  p_lead_id uuid,
  p_channel text,
  p_normalized_value text,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_name text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_channel not in ('sms','instagram','talktalk','email','fax','visit') then
    raise exception 'invalid_channel';
  end if;
  if nullif(btrim(p_normalized_value), '') is null then
    raise exception 'normalized_value_required';
  end if;
  if not exists (
    select 1 from public.business_permit_leads
    where company_id = p_company_id and id = p_lead_id and merged_into_lead_id is null
  ) then
    raise exception 'lead_not_found';
  end if;

  insert into public.company_do_not_contact (
    company_id, channel, normalized_value, reason, source_lead_id, blocked_by
  ) values (
    p_company_id, p_channel, p_normalized_value, coalesce(nullif(btrim(p_reason), ''), '연락 거부'), p_lead_id, p_actor_user_id
  ) on conflict (company_id, channel, normalized_value) where released_at is null
    do update set reason = excluded.reason, source_lead_id = excluded.source_lead_id,
      blocked_by = excluded.blocked_by, blocked_at = now();

  update public.business_permit_leads
  set status = '제외', exclude_reason = '연락 거부 등록', next_action = '연락 금지', updated_at = now()
  where company_id = p_company_id and id = p_lead_id and merged_into_lead_id is null;

  insert into public.lead_actions (company_id, lead_id, action_type, result, memo, actor_name, actor_user_id)
  values (p_company_id, p_lead_id, 'exclude', '연락 거부', p_reason, p_actor_name, p_actor_user_id);
  return true;
end;
$$;

revoke all on function public.register_lead_do_not_contact(uuid,uuid,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.register_lead_do_not_contact(uuid,uuid,text,text,text,uuid,text) to service_role;

commit;
