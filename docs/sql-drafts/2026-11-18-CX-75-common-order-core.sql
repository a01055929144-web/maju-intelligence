-- CX-75 draft. No production execution before project-specific approval.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.store_order_settings
  add column unified_order_core_enabled boolean not null default false;

-- Shared boundary. Implementations retain their reviewed document/catalog/account
-- pricing and idempotency formats. Only this function can invoke the private copies.
create function public.place_store_order_core_v2(p_entry text, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_impl record;
  v_arguments text;
  v_result jsonb;
  v_company uuid;
  v_customer uuid;
  v_account uuid;
  v_member uuid;
  v_user uuid;
  v_lines jsonb;
  v_line jsonb;
  v_quantity numeric;
  v_enabled boolean;
  v_order public.store_orders%rowtype;
  v_total numeric;
  v_is_replay boolean := false;
  v_product jsonb;
  v_cutoff timestamp;
begin
  if p_entry not in ('place_store_order','place_store_member_order',
    'place_store_catalog_order_core_v1','place_store_catalog_order_v1',
    'place_store_catalog_member_order_v1','place_store_account_order',
    'place_store_account_orders','place_store_order_with_delivery_snapshot_09')
    or p_entry is null or jsonb_typeof(p_request) is distinct from 'object' then
    raise exception 'Invalid order request';
  end if;
  select p.oid,p.proargnames,p.proargtypes into v_impl
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='cx75_' || p_entry || '_impl';
  if not found then raise exception 'cx75_implementation_unavailable'; end if;

  if p_entry='place_store_account_orders' then
    v_account := (p_request->>'p_account')::uuid;
    select a.company_id,a.customer_id into v_company,v_customer
      from public.store_accounts a where a.id=v_account;
  elsif p_entry='place_store_account_order' then
    v_company := (p_request->>'p_company')::uuid;
    v_account := (p_request->>'p_store_account_id')::uuid;
    select a.customer_id into v_customer from public.store_accounts a
      where a.company_id=v_company and a.id=v_account;
  else
    select l.company_id,l.customer_id into v_company,v_customer
      from public.storefront_links l where l.token_hash=p_request->>'p_token_hash';
    v_account := (p_request->>'p_store_account_id')::uuid;
  end if;
  select coalesce(s.unified_order_core_enabled,false) into v_enabled
    from public.store_order_settings s where s.company_id=v_company;

  if coalesce(v_enabled,false) and p_entry<>'place_store_account_orders' then
    v_lines := p_request->'p_lines';
    if v_company is null or v_customer is null or p_request->>'p_delivery_date' is null
      or p_request->>'p_idempotency_key' is null
      or jsonb_typeof(v_lines) is distinct from 'array'
      or jsonb_array_length(v_lines) not between 1 and 100 then
      raise exception 'Invalid order request';
    end if;
    -- Keep lock order compatible with link engines: link, membership, order, promotions.
    if p_entry<>'place_store_account_order' then
      perform 1 from public.storefront_links l where l.token_hash=p_request->>'p_token_hash'
        and l.company_id=v_company and l.customer_id=v_customer for update;
    end if;
    v_user := (p_request->>'p_auth_user_id')::uuid;
    v_member := (p_request->>'p_member_id')::uuid;
    if p_entry='place_store_account_order' then
      perform 1 from public.store_accounts a where a.company_id=v_company and a.id=v_account for update;
      if public.self_order_member(v_company,v_account,v_user) is null then
        raise exception 'Store member unavailable';
      end if;
    elsif v_account is not null or v_member is not null or v_user is not null then
      perform 1 from public.store_accounts a
        join public.store_account_members m on m.company_id=a.company_id and m.store_account_id=a.id
        join public.app_users u on u.id=m.auth_user_id
        where a.company_id=v_company and a.customer_id=v_customer and a.id=v_account
          and a.status='active' and a.business_status='active'
          and m.id=v_member and m.auth_user_id=v_user and m.status='active'
          and m.role in ('owner','manager','staff') and u.status='active'
        for share of a,m,u;
      if not found then raise exception 'Store member unavailable'; end if;
    end if;
    -- Serialize before detecting replay. The original engine still verifies its
    -- exact payload fingerprint and actor rules; historical results may predate edits.
    if p_entry='place_store_account_order' then
      select exists(select 1 from public.store_account_order_requests r
        where r.company_id=v_company and r.idempotency_key=(p_request->>'p_idempotency_key')::uuid)
        into v_is_replay;
    else
      select exists(select 1 from public.store_order_requests r
        join public.storefront_links l on l.company_id=r.company_id and l.id=r.link_id
        where r.company_id=v_company and l.token_hash=p_request->>'p_token_hash'
          and r.idempotency_key=(p_request->>'p_idempotency_key')::uuid) into v_is_replay;
    end if;
    if not v_is_replay then
    for v_line in select value from jsonb_array_elements(v_lines) loop
      if jsonb_typeof(v_line) is distinct from 'object' then raise exception 'Invalid order line'; end if;
      v_quantity := (v_line->>'quantity')::numeric;
      if v_quantity is null or v_quantity<=0 or v_quantity>100000
        or v_quantity::text in ('NaN','Infinity','-Infinity') or v_quantity<>round(v_quantity,3) then
        raise exception 'Invalid order line';
      end if;
      select to_jsonb(p) into v_product from public.product_catalog p
        where p.company_id=v_company and p.id=(v_line->>'productId')::uuid and p.is_active for share;
      if not found then raise exception 'Product unavailable'; end if;
      -- D4 columns are optional until separately approved; absent/NULL means
      -- the existing company/territory/customer deadline remains authoritative.
      if v_product->>'order_cutoff_days_before' is not null then
        v_cutoff := (p_request->>'p_delivery_date')::date
          -(v_product->>'order_cutoff_days_before')::integer
          +(v_product->>'order_cutoff_time')::time;
        if v_cutoff is null or (clock_timestamp() at time zone 'Asia/Seoul')>=v_cutoff then
          raise exception 'Delivery date unavailable';
        end if;
      end if;
    end loop;
    end if;
  end if;

  -- Build a typed call exclusively from the inspected implementation signature.
  -- SQL literals are quoted by format(), not interpolated from browser strings.
  select string_agg(format('%L::%s',
    case when p_request->v_impl.proargnames[i+1]='null'::jsonb then null
      when v_impl.proargtypes[i]='jsonb'::regtype then (p_request->v_impl.proargnames[i+1])::text
      else p_request->>v_impl.proargnames[i+1] end,
    pg_catalog.format_type(v_impl.proargtypes[i],null)),',' order by i)
    into v_arguments
    from generate_series(0,array_length(v_impl.proargnames,1)-1) i;
  execute format('select public.%I(%s)','cx75_' || p_entry || '_impl',v_arguments) into v_result;

  if coalesce(v_enabled,false) and not v_is_replay and p_entry<>'place_store_account_orders' then
    select * into v_order from public.store_orders
      where company_id=v_company and id=(v_result->>'id')::uuid;
    if not found or v_order.customer_id is distinct from v_customer
      or (v_account is not null and v_order.store_account_id is distinct from v_account)
      or (v_result->>'revision')::integer is distinct from v_order.revision then
      raise exception 'cx75_order_scope_mismatch';
    end if;
    select coalesce(sum(l.supply_amount+l.tax_amount) filter(where not l.is_market_price),0)
      +v_order.delivery_fee into v_total from public.store_order_lines l
      where l.company_id=v_company and l.order_id=v_order.id;
    if v_total is distinct from v_order.known_total or v_total<0 or v_total>9007199254740991
      or (v_result->>'knownTotal')::numeric is distinct from v_order.known_total then
      raise exception 'cx75_order_amount_mismatch';
    end if;
  end if;
  return v_result;
end $$;
revoke all on function public.place_store_order_core_v2(text,jsonb) from public,anon,authenticated;
grant execute on function public.place_store_order_core_v2(text,jsonb) to service_role;

do $install$
declare
  v_name text;
  v_function record;
  v_pairs text;
  v_signature text;
begin
  foreach v_name in array array['place_store_order','place_store_member_order',
    'place_store_catalog_order_core_v1','place_store_catalog_order_v1',
    'place_store_catalog_member_order_v1','place_store_account_order',
    'place_store_account_orders','place_store_order_with_delivery_snapshot_09']
  loop
    select p.oid,p.proargnames,p.proargtypes,pg_get_function_arguments(p.oid) arguments,
      pg_get_function_identity_arguments(p.oid) identity_arguments,p.proowner
      into v_function from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_name;
    if not found then
      if v_name='place_store_order_with_delivery_snapshot_09' then continue; end if;
      raise exception 'cx75_prerequisite_missing: %',v_name;
    end if;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_name)<>1
      or exists(select 1 from pg_catalog.aclexplode(coalesce(
        (select proacl from pg_proc where oid=v_function.oid),acldefault('f',v_function.proowner))) acl
        where acl.grantee not in (v_function.proowner,(select oid from pg_roles where rolname='service_role')))
      or pg_get_function_result(v_function.oid)<>'jsonb'
      or has_function_privilege('anon',v_function.oid,'execute')
      or has_function_privilege('authenticated',v_function.oid,'execute')
      or not has_function_privilege('service_role',v_function.oid,'execute') then
      raise exception 'cx75_unreviewed_signature_or_acl: %',v_name;
    end if;
    select string_agg(format('%L,%I',name,name),',' order by position)
      into v_pairs from unnest(v_function.proargnames) with ordinality x(name,position);
    v_signature := format('public.%I(%s)',v_name,v_function.identity_arguments);
    -- Preserve public OIDs: existing cached callers must also enter the boundary.
    execute replace(pg_get_functiondef(v_function.oid),
      'FUNCTION public.' || v_name || '(',
      'FUNCTION public.cx75_' || v_name || '_impl(');
    execute format('alter function public.%I(%s) owner to %I',
      'cx75_' || v_name || '_impl',v_function.identity_arguments,pg_get_userbyid(v_function.proowner));
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',
      'cx75_' || v_name || '_impl',v_function.identity_arguments);
    execute format('create or replace function public.%I(%s) returns jsonb language sql security invoker set search_path='''' as %L',
      v_name,v_function.arguments,format('select public.place_store_order_core_v2(%L,jsonb_build_object(%s))',v_name,v_pairs));
    execute format('revoke all on function %s from public,anon,authenticated',v_signature);
    execute format('grant execute on function %s to service_role',v_signature);
    execute format('alter function %s owner to %I',v_signature,pg_get_userbyid(v_function.proowner));
  end loop;
end $install$;

notify pgrst,'reload schema';
commit;
