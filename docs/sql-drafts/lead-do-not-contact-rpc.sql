-- Claude 검토용 초안. 운영 적용 금지.
-- SECURITY INVOKER + service_role 전용 호출. 앱 기능 플래그는 기본 OFF를 유지한다.
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
    select id,status as before_status,next_action as before_next_action,exclude_reason as before_exclude_reason from public.business_permit_leads
    where company_id=p_company_id and merged_into_lead_id is null and (id=p_lead_id
      or (p_channel='sms' and regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v_normalized)
      or (p_channel='fax' and regexp_replace(coalesce(fax,''),'[^0-9]','','g')=v_normalized)
      or (p_channel='email' and lower(btrim(coalesce(email,'')))=v_normalized)
      or (p_channel='instagram' and lower(regexp_replace(regexp_replace(btrim(coalesce(instagram_url,'')),'^https?://(www\.)?instagram\.com/','','i'),'/$',''))=v_normalized)
      or (p_channel='talktalk' and lower(regexp_replace(btrim(coalesce(naver_talktalk_url,'')),'/$',''))=v_normalized))
  ), affected as (
    update public.business_permit_leads set status='제외',exclude_reason='연락 거부 등록',next_action='연락 금지',updated_at=now()
    where company_id=p_company_id and id in (select id from targets)
      and status not in ('거래처 전환','기존 거래처')
    returning id
  )
  insert into public.lead_actions (company_id,lead_id,action_type,result,memo,actor_name,metadata)
  select p_company_id,id,'exclude','제외',coalesce(nullif(btrim(p_reason),''),'연락 거부'),p_actor_name,
    jsonb_strip_nulls(jsonb_build_object('event_type','do_not_contact','actor_user_id',p_actor_user_id,
      'dnc_id',v_dnc_id,'channel',p_channel,'masked_value',v_masked,
      'before_status',before_status,'before_next_action',before_next_action,
      'before_exclude_reason',before_exclude_reason)) from targets;
  return true;
end;
$$;

create or replace function public.release_lead_do_not_contact(
  p_company_id uuid, p_dnc_id uuid, p_release_reason text, p_actor_user_id uuid, p_actor_name text
) returns boolean
language plpgsql security invoker set search_path = public
as $$
declare v_channel text; v_masked text;
begin
  -- legacy_owner 세션은 app_users/company_members 행이 없어 이 RPC로 해제할 수 없다.
  -- C6 전환 전에는 서버가 해제를 제공하지 않고 MAJU 운영 절차로 별도 검토한다.
  if nullif(btrim(p_release_reason),'') is null then raise exception 'release_reason_required'; end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.company_members
    where company_id=p_company_id and user_id=p_actor_user_id and status='active'
      and coalesce(permission_role,role) in ('owner','manager')
  ) then raise exception 'owner_or_manager_required'; end if;
  update public.company_do_not_contact
  set released_at=now(),released_by=p_actor_user_id,release_reason=btrim(p_release_reason)
  where id=p_dnc_id and company_id=p_company_id and released_at is null
  returning channel,case when channel in ('sms','fax') then left(normalized_value,3)||'-****-'||right(normalized_value,4)
    when channel='email' then left(normalized_value,1)||'***@'||split_part(normalized_value,'@',2)
    else '***'||right(normalized_value,4) end into v_channel,v_masked;
  if not found then raise exception 'active_dnc_not_found'; end if;
  with latest as (
    select distinct on (lead_id) lead_id,metadata from public.lead_actions
    where company_id=p_company_id and metadata->>'dnc_id'=p_dnc_id::text
    order by lead_id,created_at desc
  ), restored as (
    update public.business_permit_leads lead set
      status=coalesce(latest.metadata->>'before_status','검토 필요'),
      next_action=latest.metadata->>'before_next_action',
      exclude_reason=latest.metadata->>'before_exclude_reason',updated_at=now()
    from latest where lead.company_id=p_company_id and lead.id=latest.lead_id
      and lead.status='제외' and lead.exclude_reason='연락 거부 등록'
    returning lead.id
  )
  insert into public.lead_actions (company_id,lead_id,action_type,result,memo,actor_name,metadata)
  select p_company_id,id,'status','연락 거부 해제',btrim(p_release_reason),p_actor_name,
    jsonb_build_object('event_type','do_not_contact_release','actor_user_id',p_actor_user_id,
      'dnc_id',p_dnc_id,'channel',v_channel,'masked_value',v_masked) from restored;
  return true;
end;
$$;

revoke all on function public.register_lead_do_not_contact(uuid,uuid,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.release_lead_do_not_contact(uuid,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.register_lead_do_not_contact(uuid,uuid,text,text,text,uuid,text) to service_role;
grant execute on function public.release_lead_do_not_contact(uuid,uuid,text,uuid,text) to service_role;

commit;
