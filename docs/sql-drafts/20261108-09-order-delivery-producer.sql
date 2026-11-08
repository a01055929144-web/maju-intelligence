-- REVIEW ONLY: separate DB approval required. No migration or runtime activation.
-- Prerequisite: approved 02 snapshot DDL. Existing 7/10-argument RPCs remain unchanged.
begin;
do $$ declare column_name text; begin
  if to_regprocedure('public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)') is null
    or to_regprocedure('public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)') is null then
    raise exception 'store_order_delivery_order_rpc_prerequisite_required';
  end if;
  foreach column_name in array array['delivery_customer_name_snapshot','delivery_address_snapshot',
    'delivery_address_detail_snapshot','delivery_recipient_phone_snapshot','delivery_loading_position_snapshot'] loop
    if not exists(select from pg_attribute where attrelid='public.store_orders'::regclass
      and attname=column_name and atttypid='text'::regtype and not attisdropped) then
      raise exception 'store_order_delivery_snapshot_prerequisite_required';
    end if;
  end loop;
  if not exists(select from pg_trigger where tgrelid='public.store_orders'::regclass
    and tgname='store_orders_delivery_snapshot_immutable_02' and tgenabled in('O','A')) then
    raise exception 'store_order_delivery_snapshot_guard_required';
  end if;
end $$;

create table public.store_order_delivery_requests_09 (
  company_id uuid not null references public.companies(id) on delete cascade,
  link_id uuid not null, idempotency_key uuid not null, order_id uuid not null,
  request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default clock_timestamp(),
  primary key(company_id,link_id,idempotency_key),
  foreign key(company_id,link_id) references public.storefront_links(company_id,id) on delete cascade,
  foreign key(company_id,order_id) references public.store_orders(company_id,id) on delete cascade
);
create table public.store_order_delivery_completions_09 (
  company_id uuid not null references public.companies(id) on delete cascade,
  completion_event_id uuid not null, actor_key text not null check(length(actor_key) between 1 and 200),
  completed_at timestamptz not null,
  request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{32}$'),
  result jsonb not null check(jsonb_typeof(result)='object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key(company_id,completion_event_id)
);
create table public.store_order_delivery_completion_orders_09 (
  company_id uuid not null references public.companies(id) on delete cascade,
  completion_event_id uuid not null, order_id uuid not null,
  pre_revision integer not null check(pre_revision between 1 and 2147483646),
  completed_revision integer not null check(completed_revision=pre_revision+1),
  primary key(company_id,completion_event_id,order_id),
  unique(company_id,order_id),
  foreign key(company_id,completion_event_id) references public.store_order_delivery_completions_09(company_id,completion_event_id) on delete no action deferrable initially deferred,
  foreign key(company_id,order_id) references public.store_orders(company_id,id) on delete no action deferrable initially deferred
);
alter table public.store_order_delivery_completion_orders_09 enable row level security;
alter table public.store_order_delivery_requests_09 enable row level security;
alter table public.store_order_delivery_completions_09 enable row level security;
revoke all on public.store_order_delivery_requests_09,public.store_order_delivery_completions_09,public.store_order_delivery_completion_orders_09 from public,anon,authenticated,service_role;
grant select,insert on public.store_order_delivery_requests_09,public.store_order_delivery_completions_09,public.store_order_delivery_completion_orders_09 to service_role;

create function public.place_store_order_with_delivery_snapshot_09(
  p_token_hash text,p_delivery_date date,p_lines jsonb,p_idempotency_key uuid,p_snapshot jsonb,
  p_order_id uuid default null,p_expected_revision integer default null,p_memo text default '',
  p_store_account_id uuid default null,p_member_id uuid default null,p_auth_user_id uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_link public.storefront_links%rowtype; v_order public.store_orders%rowtype;
  v_cached public.store_order_delivery_requests_09%rowtype;
  v_member boolean; v_replay boolean; v_key text; v_value jsonb;
  v_snapshot jsonb; v_fingerprint text; v_result jsonb;
  v_name text; v_address text; v_detail text; v_phone text; v_loading text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_idempotency_key is null then
    raise exception 'Invalid order request';
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' then raise exception 'delivery_snapshot_required'; end if;
  for v_key,v_value in select key,value from jsonb_each(p_snapshot) loop
    if v_key not in('deliveryCustomerNameSnapshot','deliveryAddressSnapshot','deliveryAddressDetailSnapshot',
      'deliveryRecipientPhoneSnapshot','deliveryLoadingPositionSnapshot') or jsonb_typeof(v_value) not in('string','null') then
      raise exception 'delivery_snapshot_invalid';
    end if;
  end loop;
  v_name:=nullif(btrim(p_snapshot->>'deliveryCustomerNameSnapshot',E' \t\r\n'),'');
  v_address:=nullif(btrim(p_snapshot->>'deliveryAddressSnapshot',E' \t\r\n'),'');
  v_detail:=nullif(btrim(p_snapshot->>'deliveryAddressDetailSnapshot',E' \t\r\n'),'');
  v_phone:=nullif(btrim(p_snapshot->>'deliveryRecipientPhoneSnapshot',E' \t\r\n'),'');
  v_loading:=nullif(btrim(p_snapshot->>'deliveryLoadingPositionSnapshot',E' \t\r\n'),'');
  if v_name is null or v_address is null then raise exception 'delivery_snapshot_required'; end if;
  if length(v_name)>200 or length(v_address)>500 or length(v_detail)>500 or length(v_phone)>40 or length(v_loading)>500 then
    raise exception 'delivery_snapshot_invalid';
  end if;
  v_snapshot:=jsonb_build_object('deliveryCustomerNameSnapshot',v_name,'deliveryAddressSnapshot',v_address,
    'deliveryAddressDetailSnapshot',v_detail,'deliveryRecipientPhoneSnapshot',v_phone,'deliveryLoadingPositionSnapshot',v_loading);
  v_member:=p_store_account_id is not null or p_member_id is not null or p_auth_user_id is not null;
  if v_member and (p_store_account_id is null or p_member_id is null or p_auth_user_id is null) then
    raise exception 'Store member unavailable';
  end if;
  -- Same link lock as both original RPCs: concurrent retry and differing snapshots serialize.
  select * into v_link from public.storefront_links where token_hash=p_token_hash for update;
  if not found then raise exception 'Link unavailable'; end if;
  v_fingerprint:=md5(jsonb_build_object('deliveryDate',p_delivery_date,'lines',p_lines,'memo',p_memo,
    'orderId',p_order_id,'expectedRevision',p_expected_revision,'snapshot',v_snapshot,
    'accountId',p_store_account_id,'memberId',p_member_id,'authUserId',p_auth_user_id)::text);
  select * into v_cached from public.store_order_delivery_requests_09
    where company_id=v_link.company_id and link_id=v_link.id and idempotency_key=p_idempotency_key;
  v_replay:=found;
  if v_replay then
    if v_cached.request_fingerprint<>v_fingerprint then
      raise exception 'delivery_snapshot_idempotency_conflict';
    end if;
    select * into v_order from public.store_orders where company_id=v_link.company_id
      and customer_id=v_link.customer_id and id=v_cached.order_id;
    if not found then raise exception 'delivery_snapshot_result_unconfirmed'; end if;
    if jsonb_build_object('deliveryCustomerNameSnapshot',v_order.delivery_customer_name_snapshot,
      'deliveryAddressSnapshot',v_order.delivery_address_snapshot,'deliveryAddressDetailSnapshot',v_order.delivery_address_detail_snapshot,
      'deliveryRecipientPhoneSnapshot',v_order.delivery_recipient_phone_snapshot,'deliveryLoadingPositionSnapshot',v_order.delivery_loading_position_snapshot) is distinct from v_snapshot then
      raise exception 'delivery_snapshot_idempotency_conflict';
    end if;
  else
    if exists(select from public.store_order_requests where company_id=v_link.company_id and link_id=v_link.id and idempotency_key=p_idempotency_key) then
      raise exception 'delivery_snapshot_existing_request';
    end if;
    if p_order_id is null then
      -- Initial base address/name are server-registered values; alternative destinations need a separate contract.
      if not exists(select from public.normalized_customers where company_id=v_link.company_id and id=v_link.customer_id
        and btrim(customer_name,E' \t\r\n')=v_name and btrim(address,E' \t\r\n')=v_address) then
        raise exception 'delivery_snapshot_customer_mismatch';
      end if;
    else
      select * into v_order from public.store_orders where company_id=v_link.company_id and customer_id=v_link.customer_id and id=p_order_id for update;
      if not found or v_order.delivery_customer_name_snapshot is null or v_order.delivery_address_snapshot is null then
        raise exception 'delivery_snapshot_required';
      end if;
      if jsonb_build_object('deliveryCustomerNameSnapshot',v_order.delivery_customer_name_snapshot,
        'deliveryAddressSnapshot',v_order.delivery_address_snapshot,'deliveryAddressDetailSnapshot',v_order.delivery_address_detail_snapshot,
        'deliveryRecipientPhoneSnapshot',v_order.delivery_recipient_phone_snapshot,'deliveryLoadingPositionSnapshot',v_order.delivery_loading_position_snapshot) is distinct from v_snapshot then
        raise exception 'delivery_snapshot_immutable';
      end if;
    end if;
  end if;
  -- Retain the original member/account/role checks on every retry, including revoked membership.
  if v_member then
    v_result:=public.place_store_member_order(p_token_hash,p_delivery_date,p_lines,p_idempotency_key,
      p_order_id,p_expected_revision,p_memo,p_store_account_id,p_member_id,p_auth_user_id);
  else
    v_result:=public.place_store_order(p_token_hash,p_delivery_date,p_lines,p_idempotency_key,p_order_id,p_expected_revision,p_memo);
  end if;
  if v_replay then
    if (v_result->>'id')::uuid is distinct from v_cached.order_id then raise exception 'delivery_snapshot_result_unconfirmed'; end if;
    return v_result;
  end if;
  if p_order_id is null then
    update public.store_orders set delivery_customer_name_snapshot=v_name,delivery_address_snapshot=v_address,
      delivery_address_detail_snapshot=v_detail,delivery_recipient_phone_snapshot=v_phone,delivery_loading_position_snapshot=v_loading
      where company_id=v_link.company_id and customer_id=v_link.customer_id and id=(v_result->>'id')::uuid
        and delivery_customer_name_snapshot is null and delivery_address_snapshot is null;
    if not found then raise exception 'delivery_snapshot_result_unconfirmed'; end if;
  end if;
  insert into public.store_order_delivery_requests_09(company_id,link_id,idempotency_key,order_id,request_fingerprint)
    values(v_link.company_id,v_link.id,p_idempotency_key,(v_result->>'id')::uuid,v_fingerprint);
  return v_result;
end $$;

create function public.complete_store_order_delivery_09(
  p_company uuid,p_completion_event_id uuid,p_delivery_date date,p_order_ids uuid[],
  p_expected_revisions jsonb,p_completed_at timestamptz,p_actor_key text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp set timezone='UTC' as $$
declare
  v_ids uuid[]; v_id uuid; v_revision integer; v_count integer;
  v_expected jsonb:='{}'; v_after jsonb:='{}'; v_result jsonb; v_fingerprint text;
  v_existing public.store_order_delivery_completions_09%rowtype; v_order public.store_orders%rowtype;
begin
  if p_company is null or p_completion_event_id is null or p_delivery_date is null
    or p_order_ids is null or cardinality(p_order_ids) not between 1 and 100 or array_position(p_order_ids,null) is not null
    or p_completed_at is null or not isfinite(p_completed_at) or p_completed_at>clock_timestamp()+interval '5 minutes'
    or p_actor_key is null or length(btrim(p_actor_key)) not between 1 and 200
    or jsonb_typeof(p_expected_revisions) is distinct from 'object' then raise exception 'store_order_completion_invalid'; end if;
  select array_agg(id order by id),count(distinct id) into v_ids,v_count from unnest(p_order_ids) as supplied(id);
  if v_count<>cardinality(p_order_ids) or (select count(*) from jsonb_object_keys(p_expected_revisions))<>v_count then
    raise exception 'store_order_completion_invalid';
  end if;
  foreach v_id in array v_ids loop
    if jsonb_typeof(p_expected_revisions->v_id::text) is distinct from 'number'
      or (p_expected_revisions->>v_id::text) !~ '^[1-9][0-9]*$' then raise exception 'store_order_completion_invalid'; end if;
    if (p_expected_revisions->>v_id::text)::numeric>2147483646 then raise exception 'store_order_completion_invalid'; end if;
    v_revision:=(p_expected_revisions->>v_id::text)::integer;
    v_expected:=v_expected||jsonb_build_object(v_id::text,v_revision);
    v_after:=v_after||jsonb_build_object(v_id::text,v_revision+1);
  end loop;
  v_fingerprint:=md5(jsonb_build_object('orderIds',v_ids,'expectedRevisions',v_expected,'deliveryDate',p_delivery_date,
    'completedAt',p_completed_at,'actorKey',btrim(p_actor_key))::text);
  v_result:=jsonb_build_object('companyId',p_company,'deliveryDate',p_delivery_date,'completionEventId',p_completion_event_id,
    'completedAt',p_completed_at,'orderIds',v_ids,'orderRevisions',v_after);
  -- Unique event claim waits for a concurrent identical transaction; failed validation rolls it back.
  insert into public.store_order_delivery_completions_09(company_id,completion_event_id,actor_key,completed_at,request_fingerprint,result)
    values(p_company,p_completion_event_id,btrim(p_actor_key),p_completed_at,v_fingerprint,v_result) on conflict do nothing;
  if not found then
    select * into v_existing from public.store_order_delivery_completions_09
      where company_id=p_company and completion_event_id=p_completion_event_id;
    if v_existing.request_fingerprint is distinct from v_fingerprint then raise exception 'store_order_completion_idempotency_conflict'; end if;
    return v_existing.result;
  end if;
  perform 1 from public.store_orders where company_id=p_company and id=any(v_ids) order by id for update;
  get diagnostics v_count=row_count;
  if v_count<>cardinality(v_ids) then raise exception 'store_order_completion_unavailable'; end if;
  if (select count(distinct customer_id) from public.store_orders where company_id=p_company and id=any(v_ids))<>1 then
    raise exception 'store_order_completion_customer_mismatch';
  end if;
  for v_order in select * from public.store_orders where company_id=p_company and id=any(v_ids) order by id loop
    if v_order.status not in('submitted','received','in_delivery') or v_order.delivery_date<>p_delivery_date
      or p_completed_at<v_order.submitted_at then raise exception 'store_order_completion_unavailable'; end if;
    if v_order.revision<>(v_expected->>v_order.id::text)::integer then raise exception 'store_order_completion_revision_conflict'; end if;
    if v_order.delivery_customer_name_snapshot is null or v_order.delivery_address_snapshot is null then
      raise exception 'store_order_completion_snapshot_required';
    end if;
  end loop;
  insert into public.store_order_delivery_completion_orders_09(company_id,completion_event_id,order_id,pre_revision,completed_revision)
    select p_company,p_completion_event_id,id,(v_expected->>id::text)::integer,(v_after->>id::text)::integer from unnest(v_ids) as completed(id);
  update public.store_orders set status='delivered',revision=revision+1,updated_at=clock_timestamp()
    where company_id=p_company and id=any(v_ids);
  return v_result;
end $$;
revoke all on function public.place_store_order_with_delivery_snapshot_09(text,date,jsonb,uuid,jsonb,uuid,integer,text,uuid,uuid,uuid),
  public.complete_store_order_delivery_09(uuid,uuid,date,uuid[],jsonb,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.place_store_order_with_delivery_snapshot_09(text,date,jsonb,uuid,jsonb,uuid,integer,text,uuid,uuid,uuid),
  public.complete_store_order_delivery_09(uuid,uuid,date,uuid[],jsonb,timestamptz,text) to service_role;
commit;
