-- S-2b DRAFT ONLY. Never run against production without the representative's explicit approval phrase.
-- Contract first: S-2a inserts new-order rows into public.company_notifications using these exact columns.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.store_profiles') is null
    or to_regclass('public.store_profile_members') is null
    or to_regclass('public.store_accounts') is null
    or to_regclass('public.normalized_customers') is null
    or to_regprocedure('public.confirm_store_customer_v1(uuid,uuid,uuid,text)') is null
    or to_regprocedure('public.link_store_account_to_customer_v1(uuid,uuid,uuid,uuid,text)') is null
    then raise exception 's2b_dependencies_required'; end if;
  if to_regclass('public.company_notifications') is not null
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='store_profiles'
      and column_name='representative_name')
    then raise exception 's2b_already_applied'; end if;
end $$;

-- Shared contract for new_order, new_store, store_review_required, price_request and store_profile_changed.
-- notification_type remains text so adding a producer does not require another enum migration.
create table public.company_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  notification_type text not null check (notification_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  store_account_id uuid,
  order_id uuid,
  customer_id uuid,
  before_values jsonb not null default '{}'::jsonb check (jsonb_typeof(before_values)='object'),
  after_values jsonb not null default '{}'::jsonb check (jsonb_typeof(after_values)='object'),
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  read_at timestamptz,
  read_by_user_id uuid,
  processed_at timestamptz,
  processed_by_user_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique(company_id, id),
  unique(company_id, idempotency_key),
  foreign key(company_id, store_account_id) references public.store_accounts(company_id,id) on delete cascade,
  foreign key(company_id, order_id) references public.store_orders(company_id,id) on delete cascade,
  foreign key(company_id, customer_id) references public.normalized_customers(company_id,id) on delete cascade,
  check (store_account_id is not null or order_id is not null or customer_id is not null),
  check (read_at is not null or read_by_user_id is null),
  check (processed_at is not null or processed_by_user_id is null)
);
create index company_notifications_inbox_idx
  on public.company_notifications(company_id, processed_at, read_at, created_at desc);
alter table public.company_notifications enable row level security;
revoke all on public.company_notifications from public, anon, authenticated;
grant select, insert, update on public.company_notifications to service_role;

alter table public.store_profiles add column representative_name text
  check (representative_name is null or length(representative_name) between 1 and 100);
alter table public.store_profiles add column access_note text
  check (access_note is null or length(access_note) between 1 and 500);
alter table public.store_profiles add column delivery_contact_phone text
  check (delivery_contact_phone is null or length(delivery_contact_phone) between 1 and 30);
alter table public.store_profiles add column preferred_delivery_time text
  check (preferred_delivery_time is null or length(preferred_delivery_time) between 1 and 100);

create table public.store_profile_change_events (
  id uuid primary key default gen_random_uuid(),
  store_profile_id uuid not null references public.store_profiles(id) on delete restrict,
  actor_member_id uuid not null,
  request_key text not null check (length(request_key) between 1 and 200),
  changed_fields text[] not null check (cardinality(changed_fields)>0),
  before_values jsonb not null check (jsonb_typeof(before_values)='object'),
  after_values jsonb not null check (jsonb_typeof(after_values)='object'),
  created_at timestamptz not null default clock_timestamp(),
  unique(store_profile_id, request_key),
  foreign key(store_profile_id, actor_member_id)
    references public.store_profile_members(store_profile_id,id) on delete restrict
);
alter table public.store_profile_change_events enable row level security;
revoke all on public.store_profile_change_events from public, anon, authenticated;
grant select, insert on public.store_profile_change_events to service_role;

-- Only an active profile owner can change the shared store source. The business number is intentionally absent.
create function public.update_store_profile_v1(
  p_store_profile uuid, p_auth_user uuid, p_changes jsonb, p_request_key text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_profile public.store_profiles%rowtype; v_member uuid; v_event uuid; v_before jsonb; v_after jsonb;
  v_allowed constant text[] := array['storeName','representativeName','baseAddress','addressDetail','accessNote','deliveryContactPhone','preferredDeliveryTime'];
  v_changed text[];
begin
  if p_store_profile is null or p_auth_user is null or jsonb_typeof(p_changes)<>'object'
    or nullif(btrim(p_request_key),'') is null or length(p_request_key)>200
    then raise exception 'store_profile_update_invalid'; end if;
  if exists(select 1 from jsonb_object_keys(p_changes) as x(key) where not (key=any(v_allowed)))
    then raise exception 'store_profile_field_not_editable'; end if;
  if p_changes?'storeName' and nullif(btrim(p_changes->>'storeName'),'') is null
    then raise exception 'store_profile_name_required'; end if;
  select id into v_member from public.store_profile_members
    where store_profile_id=p_store_profile and auth_user_id=p_auth_user and role='owner' and status='active';
  if not found then raise exception 'store_profile_owner_required'; end if;
  select * into v_profile from public.store_profiles where id=p_store_profile and status='active' for update;
  if not found then raise exception 'store_profile_not_found'; end if;
  select id into v_event from public.store_profile_change_events
    where store_profile_id=p_store_profile and request_key=p_request_key;
  if found then
    return (select jsonb_build_object('storeProfileId',store_profile_id,'eventId',id,'changedFields',changed_fields,'alreadyApplied',true)
      from public.store_profile_change_events where id=v_event);
  end if;
  v_before := jsonb_build_object('storeName',v_profile.store_name,'representativeName',v_profile.representative_name,
    'baseAddress',v_profile.base_address,'addressDetail',v_profile.address_detail,'accessNote',v_profile.access_note,
    'deliveryContactPhone',v_profile.delivery_contact_phone,'preferredDeliveryTime',v_profile.preferred_delivery_time);
  update public.store_profiles set
    store_name=case when p_changes?'storeName' then nullif(btrim(p_changes->>'storeName'),'') else store_name end,
    representative_name=case when p_changes?'representativeName' then nullif(btrim(p_changes->>'representativeName'),'') else representative_name end,
    base_address=case when p_changes?'baseAddress' then nullif(btrim(p_changes->>'baseAddress'),'') else base_address end,
    address_detail=case when p_changes?'addressDetail' then nullif(btrim(p_changes->>'addressDetail'),'') else address_detail end,
    access_note=case when p_changes?'accessNote' then nullif(btrim(p_changes->>'accessNote'),'') else access_note end,
    delivery_contact_phone=case when p_changes?'deliveryContactPhone' then nullif(btrim(p_changes->>'deliveryContactPhone'),'') else delivery_contact_phone end,
    preferred_delivery_time=case when p_changes?'preferredDeliveryTime' then nullif(btrim(p_changes->>'preferredDeliveryTime'),'') else preferred_delivery_time end,
    updated_at=clock_timestamp()
    where id=p_store_profile returning * into v_profile;
  v_after := jsonb_build_object('storeName',v_profile.store_name,'representativeName',v_profile.representative_name,
    'baseAddress',v_profile.base_address,'addressDetail',v_profile.address_detail,'accessNote',v_profile.access_note,
    'deliveryContactPhone',v_profile.delivery_contact_phone,'preferredDeliveryTime',v_profile.preferred_delivery_time);
  select coalesce(array_agg(key order by key),'{}') into v_changed
    from jsonb_each(v_before) b(key,value) join jsonb_each(v_after) a using(key) where b.value is distinct from a.value;
  if cardinality(v_changed)=0 then
    return jsonb_build_object('storeProfileId',p_store_profile,'changedFields','[]'::jsonb,'alreadyApplied',false);
  end if;
  insert into public.store_profile_change_events(store_profile_id,actor_member_id,request_key,changed_fields,before_values,after_values)
    values(p_store_profile,v_member,p_request_key,v_changed,v_before,v_after) returning id into v_event;
  insert into public.company_notifications(company_id,notification_type,store_account_id,customer_id,before_values,after_values,idempotency_key)
    select a.company_id,'store_profile_changed',a.id,a.customer_id,v_before,v_after,'store-profile-change:'||v_event||':'||a.id
    from public.store_accounts a where a.store_profile_id=p_store_profile and a.status='active';
  return jsonb_build_object('storeProfileId',p_store_profile,'eventId',v_event,'changedFields',to_jsonb(v_changed),'alreadyApplied',false);
end $$;

-- Customer confirmation/linking plus the one-time blank-field copy. Existing distributor values are never overwritten.
create function public.confirm_new_store_account_v1(
  p_company uuid, p_store_account uuid, p_target_customer uuid, p_actor uuid, p_actor_name text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.store_accounts%rowtype; p public.store_profiles%rowtype; result jsonb;
begin
  select * into a from public.store_accounts where company_id=p_company and id=p_store_account for update;
  if not found then raise exception 'store_account_not_found'; end if;
  if a.store_profile_id is null then raise exception 'store_profile_not_connected'; end if;
  if a.customer_review_status='needs_review' then
    if p_target_customer is null or p_target_customer=a.customer_id then
      result := public.confirm_store_customer_v1(p_company,p_store_account,p_actor,p_actor_name);
    else
      result := public.link_store_account_to_customer_v1(p_company,p_store_account,p_target_customer,p_actor,p_actor_name);
    end if;
    select * into a from public.store_accounts where company_id=p_company and id=p_store_account;
  elsif p_target_customer is not null and p_target_customer<>a.customer_id then
    raise exception 'store_account_already_confirmed';
  else
    result := jsonb_build_object('storeAccountId',a.id,'customerId',a.customer_id,'alreadyConfirmed',true);
  end if;
  select * into p from public.store_profiles where id=a.store_profile_id;
  update public.normalized_customers set
    customer_name=coalesce(nullif(btrim(customer_name),''),p.store_name),
    representative_name=coalesce(nullif(btrim(representative_name),''),p.representative_name),
    delivery_base_address=coalesce(nullif(btrim(delivery_base_address),''),p.base_address),
    delivery_address_detail=coalesce(nullif(btrim(delivery_address_detail),''),p.address_detail),
    access_note=coalesce(nullif(btrim(access_note),''),p.access_note),
    delivery_contact_phone=coalesce(nullif(btrim(delivery_contact_phone),''),p.delivery_contact_phone),
    preferred_delivery_time=coalesce(nullif(btrim(preferred_delivery_time),''),p.preferred_delivery_time)
    where company_id=p_company and id=a.customer_id;
  update public.company_notifications set processed_at=coalesce(processed_at,clock_timestamp()),processed_by_user_id=coalesce(processed_by_user_id,p_actor)
    where company_id=p_company and store_account_id=p_store_account and notification_type in ('new_store','store_review_required') and processed_at is null;
  return result || jsonb_build_object('customerId',a.customer_id);
end $$;

-- Explicit [거래처에 반영]. Store name is separate because it changes the distributor's management name.
create function public.apply_store_profile_notification_v1(
  p_company uuid, p_notification uuid, p_actor uuid, p_apply_store_name boolean default false
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare n public.company_notifications%rowtype; a public.store_accounts%rowtype; changed text[];
begin
  select * into n from public.company_notifications where company_id=p_company and id=p_notification for update;
  if not found or n.notification_type<>'store_profile_changed' then raise exception 'store_profile_notification_not_found'; end if;
  if n.processed_at is not null then return jsonb_build_object('notificationId',n.id,'alreadyApplied',true); end if;
  select * into a from public.store_accounts where company_id=p_company and id=n.store_account_id;
  if not found or a.customer_id<>n.customer_id then raise exception 'store_profile_notification_scope_changed'; end if;
  update public.normalized_customers set
    customer_name=case when p_apply_store_name and n.before_values->'storeName' is distinct from n.after_values->'storeName' then nullif(btrim(n.after_values->>'storeName'),'') else customer_name end,
    representative_name=case when n.before_values->'representativeName' is distinct from n.after_values->'representativeName' then nullif(btrim(n.after_values->>'representativeName'),'') else representative_name end,
    delivery_base_address=case when n.before_values->'baseAddress' is distinct from n.after_values->'baseAddress' then nullif(btrim(n.after_values->>'baseAddress'),'') else delivery_base_address end,
    delivery_address_detail=case when n.before_values->'addressDetail' is distinct from n.after_values->'addressDetail' then nullif(btrim(n.after_values->>'addressDetail'),'') else delivery_address_detail end,
    access_note=case when n.before_values->'accessNote' is distinct from n.after_values->'accessNote' then nullif(btrim(n.after_values->>'accessNote'),'') else access_note end,
    delivery_contact_phone=case when n.before_values->'deliveryContactPhone' is distinct from n.after_values->'deliveryContactPhone' then nullif(btrim(n.after_values->>'deliveryContactPhone'),'') else delivery_contact_phone end,
    preferred_delivery_time=case when n.before_values->'preferredDeliveryTime' is distinct from n.after_values->'preferredDeliveryTime' then nullif(btrim(n.after_values->>'preferredDeliveryTime'),'') else preferred_delivery_time end
    where company_id=p_company and id=n.customer_id;
  select coalesce(array_agg(key order by key),'{}') into changed
    from jsonb_each(n.before_values) b(key,value) join jsonb_each(n.after_values) aft using(key)
    where b.value is distinct from aft.value and (key<>'storeName' or p_apply_store_name);
  update public.company_notifications set processed_at=clock_timestamp(),processed_by_user_id=p_actor,
    read_at=coalesce(read_at,clock_timestamp()),read_by_user_id=coalesce(read_by_user_id,p_actor) where id=n.id;
  return jsonb_build_object('notificationId',n.id,'customerId',n.customer_id,'appliedFields',to_jsonb(changed),'alreadyApplied',false);
end $$;

revoke all on function public.update_store_profile_v1(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.confirm_new_store_account_v1(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.apply_store_profile_notification_v1(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.update_store_profile_v1(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.confirm_new_store_account_v1(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.apply_store_profile_notification_v1(uuid,uuid,uuid,boolean) to service_role;
commit;
