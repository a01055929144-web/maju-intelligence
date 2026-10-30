-- Claude 검토용 초안. 운영 적용 금지.
-- 2026-10-30 조회 RPC 추가: 연락처 원문이 GET URL·접근 로그에 남는 경로를 제거한다.
-- 이전 2개 함수 승인과 별개로 이 3개 함수 묶음을 다시 검토·승인받기 전에는 기능 플래그를 켜지 않는다.
-- SECURITY INVOKER + service_role 전용 호출. 앱 기능 플래그는 기본 OFF를 유지한다.
-- 해제 활성화 전제: 서버 DELETE route가 서명된 customer session의 company_id와 owner/manager 역할을 검증하고,
-- legacy owner는 활성 legacy credential/company 연결을 DNC 전용 helper로 매 요청 재검증한다.
-- 2026-10-29 Claude 보완(적용 전 필수):
--  1) 값 정규화를 앱(domains/lead/outreach-governance.ts normalizeDoNotContactValue)과 같은 SQL 함수 하나로 통일
--     (휴대폰 10xxxxxxxx → 010…, 인스타 @·주소·?igsh= 꼬리 제거 후 아이디만). 리드 쪽 값도 같은 함수로 비교.
--  2) 같은 값 동시 등록·해제를 회사+채널+값 단위 트랜잭션 잠금으로 직렬화.
--  3) 이미 막힌 값을 다시 등록해도 같은 dnc_id 기록이 있는 리드에는 영업 기록을 또 남기지 않음.
--  4) 등록도 해제와 같이 활성 회사(active/fallback)만 허용.
--  5) 가림 표시: 7자리 미만 값은 전부 가림(앞3+뒤4가 겹쳐 원래 값이 드러나는 문제).
begin;

create or replace function public.normalize_dnc_value(p_channel text, p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(case p_channel
    when 'sms' then (select case when d ~ '^10[0-9]{8}$' then '0' || d else d end
                     from (select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g') as d) x)
    when 'fax' then (select case when d ~ '^10[0-9]{8}$' then '0' || d else d end
                     from (select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g') as d) x)
    when 'email' then lower(regexp_replace(btrim(coalesce(p_value, '')), '^mailto:', '', 'i'))
    when 'instagram' then (select lower(candidate)
      from (select coalesce(
        substring(btrim(coalesce(p_value, '')) from '(?i)instagram\.com/([A-Za-z0-9._]{1,30})'),
        regexp_replace(regexp_replace(btrim(coalesce(p_value, '')), '^@', ''), '/$', '')
      ) as candidate) normalized
      where candidate ~ '^[A-Za-z0-9._]{1,30}$'
        and lower(candidate) not in ('p','reel','explore','accounts','stories'))
    when 'talktalk' then lower(regexp_replace(btrim(coalesce(p_value, '')), '/$', ''))
    else lower(btrim(coalesce(p_value, '')))
  end, '');
$$;

create or replace function public.mask_dnc_value(p_channel text, p_value text)
returns text
language sql
immutable
as $$
  select case
    when length(coalesce(p_value, '')) < 7 then '***'
    when p_channel in ('sms','fax') then left(p_value, 3) || '-****-' || right(p_value, 4)
    when p_channel = 'email' then left(p_value, 1) || '***@' || split_part(p_value, '@', 2)
    else '***' || right(p_value, 4)
  end;
$$;

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
  v_normalized := public.normalize_dnc_value(p_channel, p_contact_value);
  if v_normalized is null then raise exception 'contact_value_required'; end if;
  if not exists (select 1 from public.companies where id = p_company_id and status in ('active','fallback')) then
    raise exception 'active_company_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':dnc:' || p_channel || ':' || v_normalized, 0));
  if p_actor_user_id is not null and not exists (
    select 1 from public.company_members
    where company_id=p_company_id and user_id=p_actor_user_id and status='active'
  ) then raise exception 'actor_not_active_company_member'; end if;
  if not exists (
    select 1 from public.business_permit_leads
    where company_id = p_company_id and id = p_lead_id and merged_into_lead_id is null and (
      p_channel='visit'
      or public.normalize_dnc_value(p_channel, case p_channel
           when 'sms' then phone when 'fax' then fax when 'email' then email
           when 'instagram' then instagram_url when 'talktalk' then naver_talktalk_url end) = v_normalized
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
  v_masked := public.mask_dnc_value(p_channel, v_normalized);

  with targets as (
    select id,status as before_status from public.business_permit_leads
    where company_id=p_company_id and merged_into_lead_id is null and (id=p_lead_id
      or (p_channel<>'visit' and public.normalize_dnc_value(p_channel, case p_channel
           when 'sms' then phone when 'fax' then fax when 'email' then email
           when 'instagram' then instagram_url when 'talktalk' then naver_talktalk_url end) = v_normalized))
      and not exists (
        select 1 from public.lead_actions logged
        where logged.company_id=p_company_id and logged.lead_id=business_permit_leads.id
          and logged.metadata->>'event_type'='do_not_contact'
          and logged.metadata->>'dnc_id'=v_dnc_id::text
      )
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
  -- 같은 값의 동시 등록과 겹치지 않도록 등록과 같은 잠금 키를 잡습니다.
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':dnc:' || channel || ':' || normalized_value, 0))
    from public.company_do_not_contact where id=p_dnc_id and company_id=p_company_id;
  update public.company_do_not_contact
  set released_at=now(),released_by=p_actor_user_id,release_reason=btrim(p_release_reason)
  where id=p_dnc_id and company_id=p_company_id and released_at is null
  returning channel,public.mask_dnc_value(channel,normalized_value) into v_channel,v_masked;
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

-- 조회도 POST RPC로 처리한다. 연락처 원문을 PostgREST GET URL에 넣지 않고,
-- 서버에는 이미 가린 값만 반환한다.
create or replace function public.list_active_lead_do_not_contacts(
  p_company_id uuid, p_lead_id uuid
) returns table(id uuid, channel text, masked_value text, blocked_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select dnc.id, dnc.channel,
    public.mask_dnc_value(dnc.channel, dnc.normalized_value), dnc.blocked_at
  from public.business_permit_leads lead
  join public.company_do_not_contact dnc
    on dnc.company_id = lead.company_id and dnc.released_at is null
   and (
     (dnc.channel = 'visit' and dnc.source_lead_id = lead.id)
     or (
       dnc.channel in ('sms', 'fax', 'email', 'instagram', 'talktalk')
       and dnc.normalized_value = public.normalize_dnc_value(dnc.channel,
         case dnc.channel
           when 'sms' then lead.phone
           when 'fax' then lead.fax
           when 'email' then lead.email
           when 'instagram' then lead.instagram_url
           when 'talktalk' then lead.naver_talktalk_url
         end)
     )
   )
  where lead.company_id = p_company_id and lead.id = p_lead_id
    and lead.merged_into_lead_id is null;
$$;

revoke all on function public.normalize_dnc_value(text,text) from public, anon, authenticated;
revoke all on function public.mask_dnc_value(text,text) from public, anon, authenticated;
grant execute on function public.normalize_dnc_value(text,text) to service_role;
grant execute on function public.mask_dnc_value(text,text) to service_role;
revoke all on function public.register_lead_do_not_contact(uuid,uuid,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.release_lead_do_not_contact(uuid,uuid,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.list_active_lead_do_not_contacts(uuid,uuid) from public, anon, authenticated;
grant execute on function public.register_lead_do_not_contact(uuid,uuid,text,text,text,uuid,text) to service_role;
grant execute on function public.release_lead_do_not_contact(uuid,uuid,text,text,uuid,text) to service_role;
grant execute on function public.list_active_lead_do_not_contacts(uuid,uuid) to service_role;

commit;
