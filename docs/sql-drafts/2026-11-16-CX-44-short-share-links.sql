-- CX-44 DRAFT ONLY. Representative approval required before operating DB use.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.pricing_document_share_links
  add column short_code text,
  add column short_channel text,
  add column short_sent_by_member_id uuid,
  add column first_viewed_at timestamptz,
  add column last_viewed_at timestamptz,
  add column view_count bigint not null default 0,
  add constraint pricing_document_share_links_short_code_check
    check (short_code is null or short_code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{10}$'),
  add constraint pricing_document_share_links_short_channel_check
    check ((short_code is null and short_channel is null)
      or (short_code is not null and short_channel in ('kakao', 'sms', 'other'))),
  add constraint pricing_document_share_links_view_count_check check (view_count >= 0),
  add constraint pricing_document_share_links_short_sender_fk
    foreign key (company_id, short_sent_by_member_id)
    references public.company_members(company_id, id) on delete set null (short_sent_by_member_id);

create unique index pricing_document_share_links_short_code_uq
  on public.pricing_document_share_links(short_code) where short_code is not null;

alter table public.storefront_links
  add column short_code text,
  add column short_channel text,
  add constraint storefront_links_short_code_check
    check (short_code is null or short_code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{10}$'),
  add constraint storefront_links_short_channel_check
    check ((short_code is null and short_channel is null)
      or (short_code is not null and short_channel in ('kakao', 'sms', 'other')));

create unique index storefront_links_short_code_uq
  on public.storefront_links(short_code) where short_code is not null;

create table public.pricing_document_share_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  share_link_id uuid not null,
  event_type text not null check (event_type in ('view', 'order_start', 'signup', 'first_order')),
  device_class text check (device_class in ('mobile', 'desktop', 'tablet', 'unknown')),
  requester_hash text check (requester_hash is null or requester_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text,
  occurred_at timestamptz not null default clock_timestamp(),
  constraint pricing_document_share_events_link_fk
    foreign key (company_id, share_link_id)
    references public.pricing_document_share_links(company_id, id) on delete cascade,
  constraint pricing_document_share_events_idempotency_uq
    unique (company_id, share_link_id, event_type, idempotency_key)
);

create index pricing_document_share_events_link_idx
  on public.pricing_document_share_events(company_id, share_link_id, occurred_at desc);
alter table public.pricing_document_share_events enable row level security;
revoke all on public.pricing_document_share_events from public, anon, authenticated, service_role;
grant select, insert on public.pricing_document_share_events to service_role;

alter table public.storefront_link_events
  drop constraint storefront_link_events_event_type_check;
alter table public.storefront_link_events
  add constraint storefront_link_events_event_type_check
  check (event_type in ('view','cart','order','sent','reminder','order_start','signup','first_order'));

create function public.guard_short_share_code_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.short_code is not null and (
    new.short_code is distinct from old.short_code
    or new.short_channel is distinct from old.short_channel
  ) then raise exception 'short_link_code_immutable'; end if;
  return new;
end;
$$;
create trigger pricing_document_share_short_code_guard
before update on public.pricing_document_share_links
for each row execute function public.guard_short_share_code_v1();
create trigger storefront_short_code_guard
before update on public.storefront_links
for each row execute function public.guard_short_share_code_v1();

create function public.short_share_code_v1()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  v_bytes bytea := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
  v_code text := '';
  i integer;
begin
  for i in 0..9 loop
    v_code := v_code || substr(v_alphabet,
      (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  end loop;
  return v_code;
end;
$$;

create function public.assign_pricing_document_short_code_v1(
  p_company_id uuid,
  p_share_link_id uuid,
  p_channel text,
  p_actor_member_id uuid
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.pricing_document_share_links%rowtype;
  v_code text;
begin
  if p_channel not in ('kakao', 'sms', 'other') then raise exception 'short_link_channel_invalid'; end if;
  select * into v_link from public.pricing_document_share_links
  where company_id = p_company_id and id = p_share_link_id for update;
  if not found or v_link.revoked_at is not null or v_link.expires_at <= clock_timestamp() then
    raise exception 'share_link_unavailable';
  end if;
  if v_link.short_code is not null then return v_link.short_code; end if;
  if p_actor_member_id is not null and not exists (
    select 1 from public.company_members
    where company_id = p_company_id and id = p_actor_member_id
  ) then raise exception 'short_link_actor_not_found'; end if;
  loop
    v_code := public.short_share_code_v1();
    begin
      update public.pricing_document_share_links
      set short_code = v_code, short_channel = p_channel, short_sent_by_member_id = p_actor_member_id
      where company_id = p_company_id and id = p_share_link_id;
      return v_code;
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$$;

create function public.assign_storefront_short_code_v1(
  p_company_id uuid,
  p_storefront_link_id uuid,
  p_channel text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.storefront_links%rowtype;
  v_code text;
begin
  if p_channel not in ('kakao', 'sms', 'other') then raise exception 'short_link_channel_invalid'; end if;
  select * into v_link from public.storefront_links
  where company_id = p_company_id and id = p_storefront_link_id for update;
  if not found or v_link.revoked_at is not null or v_link.expires_at <= clock_timestamp() then
    raise exception 'storefront_link_unavailable';
  end if;
  if v_link.short_code is not null then return v_link.short_code; end if;
  loop
    v_code := public.short_share_code_v1();
    begin
      update public.storefront_links set short_code = v_code, short_channel = p_channel
      where company_id = p_company_id and id = p_storefront_link_id;
      return v_code;
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$$;

create function public.resolve_pricing_document_short_link_v1(
  p_short_code text,
  p_requester_hash text,
  p_device_class text default 'unknown',
  p_is_preview_bot boolean default false,
  p_expected_company_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.pricing_document_share_links%rowtype;
  v_guard text;
begin
  if coalesce(p_short_code, '') !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{10}$'
    or coalesce(p_requester_hash, '') !~ '^[0-9a-f]{64}$'
    or p_device_class not in ('mobile', 'desktop', 'tablet', 'unknown') then
    return jsonb_build_object('status', 'unavailable');
  end if;
  select * into v_link from public.pricing_document_share_links
  where short_code = p_short_code;
  if not found or (p_expected_company_id is not null and v_link.company_id <> p_expected_company_id)
    or v_link.revoked_at is not null or v_link.expires_at <= clock_timestamp() then
    return jsonb_build_object('status', 'unavailable');
  end if;
  v_guard := public.pricing_s2_public_request_guard(
    v_link.company_id, 'short-document', p_requester_hash,
    jsonb_build_object('prefix', left(p_short_code, 3)), 30);
  if v_guard <> 'allowed' then return jsonb_build_object('status', 'unavailable'); end if;
  if not p_is_preview_bot then
    update public.pricing_document_share_links set
      first_viewed_at = coalesce(first_viewed_at, clock_timestamp()),
      last_viewed_at = clock_timestamp(), view_count = view_count + 1
    where company_id = v_link.company_id and id = v_link.id;
    insert into public.pricing_document_share_events(
      company_id, share_link_id, event_type, device_class, requester_hash
    ) values (v_link.company_id, v_link.id, 'view', p_device_class, p_requester_hash);
  end if;
  return jsonb_build_object('status', 'available', 'companyId', v_link.company_id,
    'shareLinkId', v_link.id, 'documentId', v_link.document_id,
    'documentVersionId', v_link.document_version_id);
end;
$$;

create function public.resolve_storefront_short_link_v1(
  p_short_code text,
  p_requester_hash text,
  p_device_class text default 'unknown',
  p_is_preview_bot boolean default false,
  p_expected_company_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.storefront_links%rowtype;
  v_guard text;
begin
  if coalesce(p_short_code, '') !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{10}$'
    or coalesce(p_requester_hash, '') !~ '^[0-9a-f]{64}$'
    or p_device_class not in ('mobile', 'desktop', 'tablet', 'unknown') then
    return jsonb_build_object('status', 'unavailable');
  end if;
  select * into v_link from public.storefront_links where short_code = p_short_code;
  if not found or (p_expected_company_id is not null and v_link.company_id <> p_expected_company_id)
    or v_link.revoked_at is not null or v_link.expires_at <= clock_timestamp() then
    return jsonb_build_object('status', 'unavailable');
  end if;
  v_guard := public.pricing_s2_public_request_guard(
    v_link.company_id, 'short-storefront', p_requester_hash,
    jsonb_build_object('prefix', left(p_short_code, 3)), 30);
  if v_guard <> 'allowed' then return jsonb_build_object('status', 'unavailable'); end if;
  if not p_is_preview_bot then
    update public.storefront_links set
      first_viewed_at = coalesce(first_viewed_at, clock_timestamp()),
      last_viewed_at = clock_timestamp(), view_count = view_count + 1
    where company_id = v_link.company_id and id = v_link.id;
    insert into public.storefront_link_events(company_id, link_id, event_type, device_class)
    values(v_link.company_id, v_link.id, 'view', p_device_class);
  end if;
  return jsonb_build_object('status', 'available', 'companyId', v_link.company_id,
    'storefrontLinkId', v_link.id, 'customerId', v_link.customer_id,
    'documentVersionId', v_link.document_version_id);
end;
$$;

create function public.record_pricing_document_short_event_v1(
  p_company_id uuid,
  p_share_link_id uuid,
  p_event_type text,
  p_idempotency_key text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_event_type not in ('order_start', 'signup', 'first_order')
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 120 then
    raise exception 'short_link_event_invalid';
  end if;
  insert into public.pricing_document_share_events(
    company_id, share_link_id, event_type, idempotency_key
  ) values (p_company_id, p_share_link_id, p_event_type, btrim(p_idempotency_key))
  on conflict (company_id, share_link_id, event_type, idempotency_key) do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function public.short_share_code_v1() from public, anon, authenticated, service_role;
revoke all on function public.guard_short_share_code_v1() from public, anon, authenticated, service_role;
revoke all on function public.assign_pricing_document_short_code_v1(uuid,uuid,text,uuid) from public, anon, authenticated, service_role;
revoke all on function public.assign_storefront_short_code_v1(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.resolve_pricing_document_short_link_v1(text,text,text,boolean,uuid) from public, anon, authenticated, service_role;
revoke all on function public.resolve_storefront_short_link_v1(text,text,text,boolean,uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_pricing_document_short_event_v1(uuid,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.assign_pricing_document_short_code_v1(uuid,uuid,text,uuid) to service_role;
grant execute on function public.assign_storefront_short_code_v1(uuid,uuid,text) to service_role;
grant execute on function public.resolve_pricing_document_short_link_v1(text,text,text,boolean,uuid) to service_role;
grant execute on function public.resolve_storefront_short_link_v1(text,text,text,boolean,uuid) to service_role;
grant execute on function public.record_pricing_document_short_event_v1(uuid,uuid,text,text) to service_role;
commit;
