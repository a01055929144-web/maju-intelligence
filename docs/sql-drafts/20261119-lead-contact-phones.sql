-- DRAFT ONLY. Separate operating DB approval required. No backfill or app activation.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if to_regclass('public.business_permit_leads') is null
    or to_regclass('public.company_members') is null then
    raise exception 'lead_contact_phones_prerequisites_required';
  end if;
end $$;

alter table public.business_permit_leads
  add column owner_mobile_phone text,
  add column store_phone text,
  add constraint business_permit_leads_owner_mobile_phone_check
    check (owner_mobile_phone is null or owner_mobile_phone ~ '^010[0-9]{8}$'),
  add constraint business_permit_leads_store_phone_check
    check (
      store_phone is null
      or store_phone ~ '^(02[0-9]{7,8}|070[0-9]{8}|0(3[1-3]|4[1-4]|5[1-5]|6[1-4])[0-9]{7,8})$'
    );

comment on column public.business_permit_leads.owner_mobile_phone is
  '점주 휴대폰. 숫자만 저장하며 010 11자리만 허용한다. 기존 phone에서 자동 백필하지 않는다.';
comment on column public.business_permit_leads.store_phone is
  '매장 전화. 숫자만 저장하며 02, 070 또는 국내 지역번호만 허용한다. 기존 phone을 덮어쓰지 않는다.';

create or replace function public.update_lead_contact_phones_v1(
  p_company_id uuid,
  p_lead_id uuid,
  p_actor_company_member_id uuid,
  p_changes jsonb
)
returns table(owner_mobile_phone text, store_phone text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_mobile_phone text;
  v_store_phone text;
begin
  if p_changes is null
    or jsonb_typeof(p_changes) <> 'object'
    or not (p_changes ?| array['ownerMobilePhone', 'storePhone'])
    or exists (
      select 1 from jsonb_object_keys(p_changes) as key
      where key not in ('ownerMobilePhone', 'storePhone')
    ) then
    raise exception 'lead_contact_phone_changes_invalid';
  end if;

  if not exists (
    select 1
    from public.company_members as member
    where member.company_id = p_company_id
      and member.id = p_actor_company_member_id
      and member.status = 'active'
      and (member.membership_expires_at is null or member.membership_expires_at > clock_timestamp())
  ) then
    raise exception 'lead_contact_phone_forbidden';
  end if;

  if p_changes ? 'ownerMobilePhone' then
    if jsonb_typeof(p_changes->'ownerMobilePhone') not in ('string', 'null') then
      raise exception 'lead_owner_mobile_phone_invalid';
    end if;
    v_owner_mobile_phone := nullif(regexp_replace(coalesce(p_changes->>'ownerMobilePhone', ''), '[ -]', '', 'g'), '');
    if v_owner_mobile_phone is not null and v_owner_mobile_phone !~ '^010[0-9]{8}$' then
      raise exception 'lead_owner_mobile_phone_invalid';
    end if;
  end if;

  if p_changes ? 'storePhone' then
    if jsonb_typeof(p_changes->'storePhone') not in ('string', 'null') then
      raise exception 'lead_store_phone_invalid';
    end if;
    v_store_phone := nullif(regexp_replace(coalesce(p_changes->>'storePhone', ''), '[ -]', '', 'g'), '');
    if v_store_phone is not null
      and v_store_phone !~ '^(02[0-9]{7,8}|070[0-9]{8}|0(3[1-3]|4[1-4]|5[1-5]|6[1-4])[0-9]{7,8})$' then
      raise exception 'lead_store_phone_invalid';
    end if;
  end if;

  return query
  update public.business_permit_leads as lead
  set owner_mobile_phone = case when p_changes ? 'ownerMobilePhone' then v_owner_mobile_phone else lead.owner_mobile_phone end,
      store_phone = case when p_changes ? 'storePhone' then v_store_phone else lead.store_phone end,
      updated_at = clock_timestamp()
  where lead.company_id = p_company_id
    and lead.id = p_lead_id
    and lead.merged_into_lead_id is null
  returning lead.owner_mobile_phone, lead.store_phone;

  if not found then
    raise exception 'lead_contact_phone_not_found';
  end if;
end;
$$;

revoke all on function public.update_lead_contact_phones_v1(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_lead_contact_phones_v1(uuid, uuid, uuid, jsonb)
  to service_role;

commit;
