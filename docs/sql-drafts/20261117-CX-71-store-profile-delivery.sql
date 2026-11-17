-- S-3a / CX-71 DRAFT ONLY. Do not run in production without representative DB approval.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.store_profiles') is null or to_regclass('public.store_profile_members') is null
    or to_regclass('public.store_profile_change_events') is null
    or to_regprocedure('public.update_store_profile_v1(uuid,uuid,jsonb,text)') is null
  then raise exception 'cx71_dependencies_required'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='store_profiles' and column_name='tax_invoice_email')
  then raise exception 'cx71_already_applied'; end if;
end $$;

alter table public.store_profiles add column tax_invoice_email text
  check (tax_invoice_email is null or (length(tax_invoice_email) between 3 and 254 and tax_invoice_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
alter table public.store_profiles add column receive_method text
  check (receive_method is null or receive_method in ('door','inside','dawn'));
alter table public.store_profiles add column access_password text
  check (access_password is null or length(access_password) between 1 and 100);
alter table public.store_profiles add column access_password_updated_at timestamptz;

-- Metadata only. Files remain in the existing private customer-attachments bucket.
create table public.store_profile_attachments (
  id uuid primary key default gen_random_uuid(),
  store_profile_id uuid not null references public.store_profiles(id) on delete cascade,
  kind text not null check (kind in ('cold','frozen','room')),
  storage_path text not null check (length(storage_path) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(store_profile_id,kind),
  unique(storage_path)
);
alter table public.store_profile_attachments enable row level security;
revoke all on public.store_profile_attachments from public,anon,authenticated;
grant select,insert,update,delete on public.store_profile_attachments to service_role;

-- Safe idempotency ledger: it never stores the password or its before/after value.
create table public.store_profile_delivery_requests (
  store_profile_id uuid not null references public.store_profiles(id) on delete cascade,
  request_key text not null check (length(request_key) between 1 and 200),
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  primary key(store_profile_id,request_key)
);
alter table public.store_profile_delivery_requests enable row level security;
revoke all on public.store_profile_delivery_requests from public,anon,authenticated;
grant select,insert on public.store_profile_delivery_requests to service_role;

create function public.update_store_profile_delivery_v1(
  p_store_profile uuid, p_auth_user uuid, p_changes jsonb, p_request_key text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  profile public.store_profiles%rowtype; member_id uuid; before_safe jsonb; after_safe jsonb;
  safe_changed text[]; base_changes jsonb; account record;
begin
  if p_store_profile is null or p_auth_user is null or jsonb_typeof(p_changes)<>'object'
    or nullif(btrim(p_request_key),'') is null or length(p_request_key)>200
  then raise exception 'store_profile_update_invalid'; end if;
  if exists(select 1 from jsonb_object_keys(p_changes) x(key) where key<>all(array[
    'storeName','representativeName','baseAddress','addressDetail','accessNote','deliveryContactPhone','preferredDeliveryTime',
    'businessName','subBusinessNumber','businessEntityType','taxInvoiceEmail','receiveMethod','accessPassword']))
  then raise exception 'store_profile_field_not_editable'; end if;
  select id into member_id from public.store_profile_members
    where store_profile_id=p_store_profile and auth_user_id=p_auth_user and role='owner' and status='active';
  if not found then raise exception 'store_profile_owner_required'; end if;
  select * into profile from public.store_profiles where id=p_store_profile and status='active' for update;
  if not found then raise exception 'store_profile_not_found'; end if;
  if exists(select 1 from public.store_profile_delivery_requests where store_profile_id=p_store_profile and request_key=p_request_key)
  then return (select jsonb_build_object('storeProfileId',store_profile_id,'changedFields',to_jsonb(changed_fields),'alreadyApplied',true)
    from public.store_profile_delivery_requests where store_profile_id=p_store_profile and request_key=p_request_key); end if;
  if p_changes?'taxInvoiceEmail' and nullif(btrim(p_changes->>'taxInvoiceEmail'),'') is not null
    and btrim(p_changes->>'taxInvoiceEmail') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then raise exception 'store_profile_tax_invoice_email_invalid'; end if;
  if p_changes?'receiveMethod' and nullif(btrim(p_changes->>'receiveMethod'),'') is not null
    and btrim(p_changes->>'receiveMethod')<>all(array['door','inside','dawn'])
  then raise exception 'store_profile_receive_method_invalid'; end if;
  if p_changes?'accessPassword' and (nullif(p_changes->>'accessPassword','') is null or length(p_changes->>'accessPassword')>100)
  then raise exception 'store_profile_access_password_invalid'; end if;

  base_changes := p_changes - array['taxInvoiceEmail','receiveMethod','accessPassword'];
  perform public.update_store_profile_v1(p_store_profile,p_auth_user,base_changes,p_request_key||':base');
  select * into profile from public.store_profiles where id=p_store_profile for update;
  before_safe:=jsonb_build_object('taxInvoiceEmail',profile.tax_invoice_email,'receiveMethod',profile.receive_method);
  update public.store_profiles set
    tax_invoice_email=case when p_changes?'taxInvoiceEmail' then nullif(btrim(p_changes->>'taxInvoiceEmail'),'') else tax_invoice_email end,
    receive_method=case when p_changes?'receiveMethod' then nullif(btrim(p_changes->>'receiveMethod'),'') else receive_method end,
    access_password=case when p_changes?'accessPassword' then p_changes->>'accessPassword' else access_password end,
    access_password_updated_at=case when p_changes?'accessPassword' and access_password is distinct from p_changes->>'accessPassword' then clock_timestamp() else access_password_updated_at end,
    updated_at=clock_timestamp()
    where id=p_store_profile returning * into profile;
  after_safe:=jsonb_build_object('taxInvoiceEmail',profile.tax_invoice_email,'receiveMethod',profile.receive_method);
  select coalesce(array_agg(key order by key),'{}') into safe_changed
    from jsonb_each(before_safe) b(key,value) join jsonb_each(after_safe) a using(key) where b.value is distinct from a.value;
  insert into public.store_profile_delivery_requests(store_profile_id,request_key,changed_fields)
    values(p_store_profile,p_request_key,safe_changed);
  if cardinality(safe_changed)>0 then
    insert into public.store_profile_change_events(store_profile_id,actor_member_id,request_key,changed_fields,before_values,after_values)
      values(p_store_profile,member_id,p_request_key||':delivery',safe_changed,before_safe,after_safe);
    for account in select company_id,id,customer_id from public.store_accounts where store_profile_id=p_store_profile and status='active' loop
      insert into public.company_notifications(company_id,notification_type,store_account_id,customer_id,before_values,after_values,idempotency_key)
        values(account.company_id,'store_profile_changed',account.id,account.customer_id,before_safe,after_safe,'store-profile-delivery:'||p_request_key||':'||account.id);
    end loop;
  end if;
  return jsonb_build_object('storeProfileId',p_store_profile,'changedFields',to_jsonb(safe_changed),'alreadyApplied',false);
end $$;

revoke all on function public.update_store_profile_delivery_v1(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.update_store_profile_delivery_v1(uuid,uuid,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
