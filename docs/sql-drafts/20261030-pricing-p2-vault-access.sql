-- REVIEW ONLY. Fresh local PG16 after P2 vault draft + existing C6 membership schema.
-- No route-name mapping, upload endpoint, bucket, or runtime activation.
begin;
create table public.store_onboarding_delivery_grants (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
 customer_id uuid not null, staff_member_id uuid not null, delivery_date date not null,
 source_confirmation_id uuid not null, valid_until timestamptz not null, revoked_at timestamptz,
 foreign key(company_id,customer_id) references normalized_customers(company_id,id) on delete cascade,
 foreign key(company_id,staff_member_id) references company_members(company_id,id) on delete cascade,
 check(valid_until>(delivery_date::timestamp at time zone 'Asia/Seoul') and
 valid_until<=((delivery_date+1)::timestamp at time zone 'Asia/Seoul'))
);
create unique index store_onboarding_current_grant on store_onboarding_delivery_grants(company_id,customer_id,staff_member_id,delivery_date) where revoked_at is null;
alter table store_onboarding_delivery_grants enable row level security;
revoke all on store_onboarding_delivery_grants from public,anon,authenticated,service_role;
grant select,insert,update,delete on store_onboarding_delivery_grants to service_role;
-- Preserve the stable assignment evidence even after a grant is revoked/deleted.
alter table store_onboarding_audit add column staff_member_id uuid,
 add column delivery_grant_id uuid, add column source_confirmation_id uuid,
 add column permission_snapshot text check(permission_snapshot in ('owner','manager','staff'));
create function public.authorize_store_onboarding_read(p_company uuid,p_user uuid,p_record uuid,p_purpose text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare m company_members; r store_onboarding_vault; g store_onboarding_delivery_grants;
 role_name text; expected text; t timestamptz; until_time timestamptz; audit_id uuid:=gen_random_uuid();
begin
 begin
  select * into strict m from company_members where company_id=p_company and user_id=p_user for share;
 exception when no_data_found or too_many_rows then raise exception 'Protected record unavailable';end;
 if m.status<>'active' then raise exception 'Protected record unavailable';end if;
 role_name:=coalesce(m.permission_role,case when m.role in ('owner','manager') then m.role when m.role='driver' then 'staff' end);
 if role_name is null or role_name not in ('owner','manager','staff') or
 (role_name='staff' and not ('delivery'=any(m.duties) or (m.permission_role is null and m.role='driver'))) then
 raise exception 'Protected record unavailable';end if;
 select * into r from store_onboarding_vault where company_id=p_company and id=p_record for share;
 if not found then raise exception 'Protected record unavailable';end if;
 if role_name='staff' then
  if r.kind='registration' then raise exception 'Protected record unavailable';end if;
  select * into g from store_onboarding_delivery_grants
   where company_id=p_company and customer_id=r.customer_id and staff_member_id=m.id
   and delivery_date=(clock_timestamp() at time zone 'Asia/Seoul')::date and revoked_at is null for share;
  if not found then raise exception 'Protected record unavailable';end if;
 end if;
 t:=clock_timestamp();
 expected:=case r.kind when 'registration' then 'verify-registration' when 'entrance' then 'delivery-access' else 'delivery-location' end;
 if p_purpose is distinct from expected or r.state<>'available' or r.collected_at>t or r.expires_at<=t
  or (m.membership_expires_at is not null and m.membership_expires_at<=t)
  or (role_name='staff' and (g.revoked_at is not null or g.valid_until<=t or g.delivery_date<>(t at time zone 'Asia/Seoul')::date)) then
  raise exception 'Protected record unavailable';end if;
 until_time:=least(t+interval '5 seconds',r.expires_at,coalesce(m.membership_expires_at,r.expires_at),
   case when role_name='staff' then g.valid_until else r.expires_at end);
 insert into store_onboarding_audit(id,company_id,customer_id,record_id,actor_id,purpose,occurred_at,
  staff_member_id,delivery_grant_id,source_confirmation_id,permission_snapshot)
 values(audit_id,p_company,r.customer_id,r.id,p_user,expected,t,m.id,
  case when role_name='staff' then g.id end,case when role_name='staff' then g.source_confirmation_id end,role_name);
 return jsonb_build_object('auditId',audit_id,'actorId',p_user,'readUntil',until_time,'authorizedAt',t,
  'record',jsonb_build_object('id',r.id,'companyId',r.company_id,'customerId',r.customer_id,'kind',r.kind,'state',r.state,
   'collectedAt',r.collected_at,'expiresAt',r.expires_at,'objectKey',r.object_key,'envelope',r.envelope));
end $$;
revoke all on function authorize_store_onboarding_read(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function authorize_store_onboarding_read(uuid,uuid,uuid,text) to service_role;
commit;
