-- 운영 적용 완료(2026-11-07). schema_migrations version=20261107024837, name=store_cost_batch_import_20261107. 운영 DB 재실행 금지.
-- DRAFT ONLY. Do not apply without DB-APPROVED for fcmdvveqmcgtioelzqun.
begin;

create table public.store_cost_imports (
  company_id uuid not null,
  store_account_id uuid not null,
  import_id uuid not null,
  import_digest text not null check (import_digest ~ '^[0-9a-f]{64}$'),
  source_file_name text not null check (length(source_file_name) between 1 and 255),
  actor_member_id uuid not null,
  row_count integer not null check (row_count between 1 and 2000),
  applied_at timestamptz not null default now(),
  primary key(company_id, store_account_id, import_id),
  foreign key(company_id, store_account_id)
    references public.store_accounts(company_id, id) on delete cascade,
  foreign key(company_id, store_account_id, actor_member_id)
    references public.store_account_members(company_id, store_account_id, id)
    deferrable initially deferred
);

create function public.import_store_cost_batch(
  p_company_id uuid, p_store_account_id uuid, p_actor_member_id uuid,
  p_import_id uuid, p_file_name text, p_rows jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_digest text;
  v_existing_digest text;
  v_imported integer := 0;
  v_replayed integer := 0;
  v_result jsonb;
  v_row jsonb;
  v_total integer;
begin
  perform 1 from public.store_account_members m
    join public.store_accounts a on a.company_id=m.company_id and a.id=m.store_account_id
    where m.company_id=p_company_id and m.store_account_id=p_store_account_id
      and m.id=p_actor_member_id and m.status='active' and m.role in ('owner','manager')
      and a.status='active' and a.business_status='active'
    for update of a;
  if not found then raise exception 'store_cost_manager_required'; end if;
  if p_import_id is null or length(trim(p_file_name)) not between 1 and 255
    or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_store_cost_import'; end if;
  v_total := jsonb_array_length(p_rows);
  if v_total not between 1 and 2000
    or (select count(distinct value->>'sourceRowNumber') from jsonb_array_elements(p_rows)) <> v_total
    or exists(select 1 from jsonb_array_elements(p_rows) where (value->>'sourceRowNumber')::integer < 1)
  then raise exception 'invalid_store_cost_import'; end if;

  v_digest := encode(digest(p_company_id::text || E'\n' || p_store_account_id::text || E'\n' ||
    p_import_id::text || E'\n' || p_rows::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':'||p_store_account_id::text,0));
  select import_digest into v_existing_digest from public.store_cost_imports
    where company_id=p_company_id and store_account_id=p_store_account_id and import_id=p_import_id;
  if found and v_existing_digest <> v_digest then raise exception 'store_cost_import_conflict'; end if;
  if not found then
    insert into public.store_cost_imports(company_id,store_account_id,import_id,import_digest,
      source_file_name,actor_member_id,row_count)
    values(p_company_id,p_store_account_id,p_import_id,v_digest,trim(p_file_name),p_actor_member_id,v_total);
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_result := public.save_store_cost(
      p_company_id, p_store_account_id, p_actor_member_id,
      v_row->>'productKey', v_row->>'productName', coalesce(v_row->>'specification',''), v_row->>'unit',
      (v_row->>'effectiveOn')::date, (v_row->>'costKrw')::bigint, null, null,
      trim(p_file_name), v_digest, (v_row->>'sourceRowNumber')::integer
    );
    if (v_result->>'replayed')::boolean then v_replayed := v_replayed + 1;
    else v_imported := v_imported + 1; end if;
  end loop;
  return jsonb_build_object('imported',v_imported,'replayed',v_replayed,'total',v_total,'importDigest',v_digest);
end $$;

alter table public.store_cost_imports enable row level security;
revoke all on public.store_cost_imports from public, anon, authenticated, service_role;
grant select, insert on public.store_cost_imports to service_role;
revoke all on function public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb) to service_role;

commit;
