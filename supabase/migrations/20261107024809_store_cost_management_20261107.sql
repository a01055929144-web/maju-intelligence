-- 운영 적용 완료(2026-11-07). schema_migrations version=20261107024809, name=store_cost_management_20261107. 운영 DB 재실행 금지.
-- DRAFT ONLY. Do not apply without DB-APPROVED for fcmdvveqmcgtioelzqun.
begin;

do $$
begin
  if to_regclass('public.store_cost_items') is not null
    or to_regclass('public.store_cost_revisions') is not null then
    raise exception 'store_cost_objects_already_exist_review_schema_first';
  end if;
end $$;

create table public.store_cost_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_account_id uuid not null,
  product_key text not null check (length(product_key) between 3 and 500),
  product_name text not null check (length(product_name) between 1 and 200),
  specification text not null default '' check (length(specification) <= 200),
  unit text not null check (length(unit) between 1 and 40),
  effective_on date not null,
  cost_krw bigint not null check (cost_krw between 0 and 1000000000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, store_account_id, product_key),
  unique(company_id, store_account_id, id),
  foreign key(company_id, store_account_id)
    references public.store_accounts(company_id, id) on delete cascade
);

create table public.store_cost_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_account_id uuid not null,
  store_cost_item_id uuid not null,
  revision integer not null check (revision > 0),
  effective_on date not null,
  product_name text not null check (length(product_name) between 1 and 200),
  specification text not null default '' check (length(specification) <= 200),
  unit text not null check (length(unit) between 1 and 40),
  cost_krw bigint not null check (cost_krw between 0 and 1000000000),
  change_kind text not null check (change_kind in ('import','edit')),
  actor_member_id uuid not null,
  source_file_name text check (source_file_name is null or length(source_file_name) between 1 and 255),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  source_row_number integer check (source_row_number is null or source_row_number > 0),
  changed_at timestamptz not null default now(),
  unique(company_id, store_account_id, store_cost_item_id, revision),
  foreign key(company_id, store_account_id, store_cost_item_id)
    references public.store_cost_items(company_id, store_account_id, id) on delete cascade,
  foreign key(company_id, store_account_id, actor_member_id)
    references public.store_account_members(company_id, store_account_id, id)
    deferrable initially deferred,
  check ((change_kind = 'import') = (source_sha256 is not null and source_row_number is not null))
);

create unique index store_cost_revisions_import_row_uq
  on public.store_cost_revisions(company_id, store_account_id, source_sha256, source_row_number)
  where source_sha256 is not null;
create index store_cost_items_search_idx
  on public.store_cost_items(company_id, store_account_id, effective_on desc, product_name);
create index store_cost_revisions_history_idx
  on public.store_cost_revisions(company_id, store_account_id, store_cost_item_id, revision desc);

create function public.save_store_cost(
  p_company_id uuid, p_store_account_id uuid, p_actor_member_id uuid,
  p_product_key text, p_product_name text, p_specification text, p_unit text,
  p_effective_on date, p_cost_krw bigint, p_item_id uuid default null, p_expected_revision integer default null,
  p_source_file_name text default null, p_source_sha256 text default null,
  p_source_row_number integer default null
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_item public.store_cost_items%rowtype;
  v_item_found boolean;
  v_change_kind text := case when p_source_sha256 is null then 'edit' else 'import' end;
begin
  perform 1 from public.store_account_members m
    join public.store_accounts a on a.company_id=m.company_id and a.id=m.store_account_id
    where m.company_id=p_company_id and m.store_account_id=p_store_account_id
      and m.id=p_actor_member_id and m.status='active' and m.role in ('owner','manager')
      and a.status='active' and a.business_status='active'
    for update of a;
  if not found then raise exception 'store_cost_manager_required'; end if;
  if length(p_product_key) not between 3 and 500 or length(p_product_name) not between 1 and 200
    or length(coalesce(p_specification,'')) > 200 or length(p_unit) not between 1 and 40
    or p_effective_on is null or p_cost_krw not between 0 and 1000000000
    or ((p_source_sha256 is null) <> (p_source_row_number is null))
    or (p_source_sha256 is not null and p_source_sha256 !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid_store_cost';
  end if;
  -- ponytail: store-wide lock favors correctness; split by product only after measured write contention.
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':'||p_store_account_id::text,0));
  if p_source_sha256 is not null then
    select i.* into v_item
    from public.store_cost_revisions r
    join public.store_cost_items i on i.company_id=r.company_id and i.store_account_id=r.store_account_id and i.id=r.store_cost_item_id
    where r.company_id=p_company_id and r.store_account_id=p_store_account_id
      and r.source_sha256=p_source_sha256 and r.source_row_number=p_source_row_number;
    if found then return jsonb_build_object('id',v_item.id,'revision',v_item.revision,'replayed',true); end if;
  end if;
  select * into v_item from public.store_cost_items
    where company_id=p_company_id and store_account_id=p_store_account_id
      and case when p_item_id is null then product_key=p_product_key else id=p_item_id end
    for update;
  v_item_found := found;
  if not v_item_found then
    if p_item_id is not null then raise exception 'store_cost_item_not_found'; end if;
    if p_expected_revision is not null then raise exception 'store_cost_revision_conflict'; end if;
    insert into public.store_cost_items(company_id,store_account_id,product_key,product_name,specification,unit,effective_on,cost_krw)
      values(p_company_id,p_store_account_id,p_product_key,p_product_name,coalesce(p_specification,''),p_unit,p_effective_on,p_cost_krw)
      returning * into v_item;
  else
    if p_expected_revision is not null and v_item.revision <> p_expected_revision then raise exception 'store_cost_revision_conflict'; end if;
    update public.store_cost_items set
      product_key=case when v_change_kind='import' and p_effective_on < effective_on then product_key else p_product_key end,
      product_name=case when v_change_kind='import' and p_effective_on < effective_on then product_name else p_product_name end,
      specification=case when v_change_kind='import' and p_effective_on < effective_on then specification else coalesce(p_specification,'') end,
      unit=case when v_change_kind='import' and p_effective_on < effective_on then unit else p_unit end,
      effective_on=greatest(effective_on,p_effective_on),
      cost_krw=case when v_change_kind='import' and p_effective_on < effective_on then cost_krw else p_cost_krw end,
      revision=revision+1, updated_at=now()
      where company_id=p_company_id and store_account_id=p_store_account_id and id=v_item.id
      returning * into v_item;
  end if;
  insert into public.store_cost_revisions(company_id,store_account_id,store_cost_item_id,revision,
    effective_on,product_name,specification,unit,cost_krw,change_kind,actor_member_id,
    source_file_name,source_sha256,source_row_number)
  values(p_company_id,p_store_account_id,v_item.id,v_item.revision,p_effective_on,p_product_name,
    coalesce(p_specification,''),p_unit,p_cost_krw,v_change_kind,p_actor_member_id,
    p_source_file_name,p_source_sha256,p_source_row_number);
  return jsonb_build_object('id',v_item.id,'revision',v_item.revision,'replayed',false);
end $$;

alter table public.store_cost_items enable row level security;
alter table public.store_cost_revisions enable row level security;
revoke all on public.store_cost_items, public.store_cost_revisions from public, anon, authenticated, service_role;
grant select, insert, update on public.store_cost_items to service_role;
grant select, insert on public.store_cost_revisions to service_role;
revoke all on function public.save_store_cost(uuid,uuid,uuid,text,text,text,text,date,bigint,uuid,integer,text,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.save_store_cost(uuid,uuid,uuid,text,text,text,text,date,bigint,uuid,integer,text,text,integer)
  to service_role;

commit;
