-- Claude 검토용 초안. 운영 적용 금지.
-- SECURITY INVOKER + service_role 전용 호출. 앱 기능 플래그는 기본 OFF를 유지한다.
-- 해제 활성화 전제: getCustomerSession이 서명과 활성 legacy credential/company를 매 요청 재검증하고,
-- 서버 DELETE route가 그 customer session의 company_id와 owner/manager 역할을 검증한다.
begin;

create or replace function public.register_lead_do_not_contact(
  p_company_id uuid,
  p_lead_id uuid,
  p_channel text,
  p_contact_value text,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_name text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_dnc_id uuid;
  v_normalized text;
  v_masked text;
begin
  if p_channel not in ('sms','instagram','talktalk','email','fax','visit') then
    raise exception 'invalid_channel';
  end if;
  v_normalized := case p_channel
    when 'sms' then regexp_replace(coalesce(p_contact_value, ''), '[^0-9]', '', 'g')
    when 'fax' then regexp_replace(coalesce(p_contact_value, ''), '[^0-9]', '', 'g')
    when 'email' then lower(regexp_replace(btrim(coalesce(p_contact_value, '')), '^mailto:', '', 'i'))
    when 'instagram' then lower(regexp_replace(regexp_replace(btrim(coalesce(p_contact_value, '')), '^https?://(www\.)?instagram\.com/', '', 'i'), '/$', ''))
    when 'talktalk' then lower(regexp_replace(btrim(coalesce(p_contact_value, '')), '/$', ''))
    else lower(btrim(coalesce(p_contact_value, '')))
  end;
  if v_normalized = '' then raise exception 'contact_value_required'; end if;
  if p_actor_user_id is not null and not exists (
    select 1 from public.company_members
    where company_id=p_company_id and user_id=p_actor_user_id and status='active'
  ) then raise exception 'actor_not_active_company_member'; end if;
  if not exists (
    select 1 from public.business_permit_leads
    where company_id = p_company_id and id = p_lead_id and merged_into_lead_id is null and (
      p_channel='visit'
      or (p_channel='sms' and regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v_normalized)
      or (p_channel='fax' and regexp_replace(coalesce(fax,''),'[^0-9]','','g')=v_normalized)
      or (p_channel='email' and lower(btrim(coalesce(email,'')))=v_normalized)
      or (p_channel='instagram' and lower(regexp_replace(regexp_replace(btrim(coalesce(instagram_url,'')),'^https?://(www\.)?instagram\.com/','','i'),'/$',''))=v_normalized)
      or (p_channel='talktalk' and lower(regexp_replace(btrim(coalesce(naver_talktalk_url,'')),'/$',''))=v_normalized)
    )
  ) then
    raise exception 'contact_value_not_on_lead';
  end if;

  insert into public.company_do_not_contact (
    company_id, channel, normalized_value, reason, source_lead_id, blocked_by
  ) values (
    p_company_id, p_channel, v_normalized, coalesce(nullif(btrim(p_reason), ''), '연락 거부'), p_lead_id, p_actor_user_id
  ) on conflict (company_id, channel, normalized_value) where released_at is null
    do nothing returning id into v_dnc_id;
  if v_dnc_id is null then
    select id into v_dnc_id from public.company_do_not_contact
    where company_id=p_company_id and channel=p_channel and normalized_value=v_normalized and released_at is null;
  end if;
  v_masked := case when p_channel in ('sms','fax') then left(v_normalized,3)||'-****-'||right(v_normalized,4)
    when p_channel='email' then left(v_normalized,1)||'***@'||split_part(v_normalized,'@',2)
    else '***'||right(v_normalized,4) end;

  with targets as (
    select id,status as before_status from public.business_permit_leads
    where company_id=p_company_id and merged_into_lead_id is null and (id=p_lead_id
      or (p_channel='sms' and regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v_normalized)
      or (p_channel='fax' and regexp_replace(coalesce(fax,''),'[^0-9]','','g')=v_normalized)
      or (p_channel='email' and lower(btrim(coalesce(email,'')))=v_normalized)
      or (p_channel='instagram' and lower(regexp_replace(regexp_replace(btrim(coalesce(instagram_url,'')),'^https?://(www\.)?instagram\.com/','','i'),'/$',''))=v_normalized)
      or (p_channel='talktalk' and lower(regexp_replace(btrim(coalesce(naver_talktalk_url,'')),'/$',''))=v_normalized))
  ), affected as (
    update public.business_permit_leads set status='제외',exclude_reason='연락 거부 등록',next_action='연락 금지',updated_at=now()
    where company_id=p_company_id and id in (select id from targets)
      and status not in ('거래처 전환','기존 거래처','제외')
    returning id
  )
  insert into public.lead_actions (company_id,lead_id,action_type,result,memo,actor_name,metadata)
  select p_company_id,targets.id,'exclude','제외',coalesce(nullif(btrim(p_reason),''),'연락 거부'),p_actor_name,
    jsonb_strip_nulls(jsonb_build_object('event_type','do_not_contact','actor_user_id',p_actor_user_id,
      'dnc_id',v_dnc_id,'channel',p_channel,'masked_value',v_masked,
      'changed_status',(affected.id is not null),
      'before_status',before_status))
  from targets left join affected on affected.id=targets.id;
  return true;
end;
$$;

create or replace function public.release_lead_do_not_contact(
  p_company_id uuid, p_dnc_id uuid, p_release_reason text, p_actor_kind text, p_actor_user_id uuid, p_actor_name text
) returns boolean
language plpgsql security invoker set search_path = public
as $$
declare v_channel text; v_masked text;
begin
  if nullif(btrim(p_release_reason),'') is null then raise exception 'release_reason_required'; end if;
  if p_actor_kind is null or p_actor_kind not in ('app_user','legacy_owner') then raise exception 'invalid_actor_kind'; end if;
  if not exists (
    select 1 from public.companies where id=p_company_id and status in ('active','fallback')
  ) then raise exception 'active_company_required'; end if;
  if p_actor_kind='legacy_owner' then
    -- service_role 호출 전 서버가 서명된 owner 세션과 그 세션의 company_id를 검증해야 한다.
    if p_actor_user_id is not null then raise exception 'legacy_owner_user_id_must_be_null'; end if;
  elsif p_actor_user_id is null or not exists (
    select 1 from public.company_members member
    join public.app_users app_user on app_user.id=member.user_id and app_user.status='active'
    where member.company_id=p_company_id and member.user_id=p_actor_user_id and member.status='active'
      and coalesce(member.permission_role,member.role) in ('owner','manager')
  ) then raise exception 'owner_or_manager_required'; end if;
  update public.company_do_not_contact
  set released_at=now(),released_by=p_actor_user_id,release_reason=btrim(p_release_reason)
  where id=p_dnc_id and company_id=p_company_id and released_at is null
  returning channel,case when channel in ('sms','fax') then left(normalized_value,3)||'-****-'||right(normalized_value,4)
    when channel='email' then left(normalized_value,1)||'***@'||split_part(normalized_value,'@',2)
    else '***'||right(normalized_value,4) end into v_channel,v_masked;
  if not found then raise exception 'active_dnc_not_found'; end if;
  with impacted as (
    select distinct lead_id from public.lead_actions
    where company_id=p_company_id and metadata->>'event_type'='do_not_contact'
      and metadata->>'dnc_id'=p_dnc_id::text
  ), cycle_start as (
    select impacted.lead_id,max(action.created_at) as last_restored_at
    from impacted left join public.lead_actions action on action.company_id=p_company_id
      and action.lead_id=impacted.lead_id
      and action.metadata->>'event_type'='do_not_contact_release'
      and action.metadata->>'restored_status'='true'
    group by impacted.lead_id
  ), original_change as (
    select distinct on (action.lead_id) action.lead_id,action.metadata
    from public.lead_actions action join cycle_start on cycle_start.lead_id=action.lead_id
    where action.company_id=p_company_id and action.metadata->>'event_type'='do_not_contact'
      and action.metadata->>'changed_status'='true'
      and (cycle_start.last_restored_at is null or action.created_at>cycle_start.last_restored_at)
    order by action.lead_id,action.created_at asc
  ), restored as (
    update public.business_permit_leads lead set
      status=coalesce(original_change.metadata->>'before_status','검토 필요'),
      next_action=null,exclude_reason=null,updated_at=now()
    from original_change where lead.company_id=p_company_id and lead.id=original_change.lead_id
      and lead.status='제외' and lead.exclude_reason='연락 거부 등록'
      and not exists (
        select 1 from public.lead_actions other_action
        join public.company_do_not_contact other_dnc on other_dnc.id::text=other_action.metadata->>'dnc_id'
        where other_action.company_id=p_company_id and other_action.lead_id=lead.id
          and other_action.metadata->>'event_type'='do_not_contact'
          and other_dnc.company_id=p_company_id and other_dnc.released_at is null
      )
    returning lead.id
  )
  insert into public.lead_actions (company_id,lead_id,action_type,result,memo,actor_name,metadata)
  select p_company_id,impacted.lead_id,'status','연락 거부 해제',btrim(p_release_reason),p_actor_name,
    jsonb_build_object('event_type','do_not_contact_release','actor_user_id',p_actor_user_id,
      'actor_kind',p_actor_kind,'dnc_id',p_dnc_id,'channel',v_channel,'masked_value',v_masked,
      'restored_status',(restored.id is not null))
  from impacted left join restored on restored.id=impacted.lead_id;
  return true;
end;
$$;

revoke all on function public.register_lead_do_not_contact(uuid,uuid,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.release_lead_do_not_contact(uuid,uuid,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.register_lead_do_not_contact(uuid,uuid,text,text,text,uuid,text) to service_role;
grant execute on function public.release_lead_do_not_contact(uuid,uuid,text,text,uuid,text) to service_role;

commit;
