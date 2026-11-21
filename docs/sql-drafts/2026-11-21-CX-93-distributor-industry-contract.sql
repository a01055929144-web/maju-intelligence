-- DRAFT ONLY. Do not apply to production without explicit approval.
-- CX-93 follow-up: MAJU-managed distributor industry IDs and company assignments.

do $$
begin
  if current_setting('server_version_num')::integer < 150000 then raise exception 'PostgreSQL 15 or newer required'; end if;
  if to_regclass('public.companies') is null or to_regclass('public.store_profiles') is null
    or to_regclass('public.store_accounts') is null or to_regclass('public.admin_audit_logs') is null then
    raise exception 'companies, store_profiles, store_accounts, and admin_audit_logs are required';
  end if;
end $$;

create table public.distributor_industry_categories (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  status text not null default 'active',
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint distributor_industry_categories_name_check check (char_length(btrim(display_name)) between 1 and 80),
  constraint distributor_industry_categories_status_check check (status in ('active', 'retired'))
);

create unique index distributor_industry_categories_active_name_key
  on public.distributor_industry_categories (lower(btrim(display_name))) where status = 'active';

create table public.company_distributor_industries (
  company_id uuid not null references public.companies(id) on delete cascade,
  industry_category_id uuid not null references public.distributor_industry_categories(id) on delete restrict,
  assigned_by text not null,
  assigned_at timestamptz not null default now(),
  primary key (company_id, industry_category_id)
);

create index company_distributor_industries_category_idx
  on public.company_distributor_industries (industry_category_id, company_id);

create function public.preview_company_distributor_industries(p_company uuid, p_category_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare before_ids uuid[]; after_ids uuid[]; invalid_count integer; active_connections integer; affected_stores integer;
begin
  if p_company is null or not exists (select 1 from public.companies where id = p_company) then raise exception 'company_not_found'; end if;
  select coalesce(array_agg(distinct category_id order by category_id), '{}'::uuid[]) into after_ids
    from unnest(coalesce(p_category_ids, '{}'::uuid[])) category_id;
  select count(*) into invalid_count from unnest(after_ids) category_id
    left join public.distributor_industry_categories c on c.id = category_id and c.status = 'active' where c.id is null;
  if invalid_count > 0 then raise exception 'active_industry_category_required'; end if;
  select coalesce(array_agg(industry_category_id order by industry_category_id), '{}'::uuid[]) into before_ids
    from public.company_distributor_industries where company_id = p_company;
  select count(*), count(distinct store_profile_id) into active_connections, affected_stores
    from public.store_accounts where company_id = p_company and status = 'active' and store_profile_id is not null;
  return jsonb_build_object('companyId', p_company, 'beforeCategoryIds', to_jsonb(before_ids),
    'afterCategoryIds', to_jsonb(after_ids), 'changed', before_ids is distinct from after_ids,
    'activeConnectionCount', active_connections, 'affectedStoreCount', affected_stores);
end $$;

create function public.preview_distributor_industry_category_impact(p_category uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('categoryId', c.id, 'assignedCompanyCount', count(distinct x.company_id),
    'activeConnectionCount', count(a.id), 'affectedStoreCount', count(distinct a.store_profile_id))
  from public.distributor_industry_categories c
  left join public.company_distributor_industries x on x.industry_category_id = c.id
  left join public.store_accounts a on a.company_id = x.company_id and a.status = 'active' and a.store_profile_id is not null
  where c.id = p_category group by c.id
$$;

create function public.admin_save_distributor_industry_category(
  p_category_id uuid, p_display_name text, p_status text, p_actor_name text, p_request_key text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare category_id uuid := coalesce(p_category_id, gen_random_uuid()); existing public.distributor_industry_categories%rowtype;
  saved public.distributor_industry_categories%rowtype; prior_target uuid;
begin
  if nullif(btrim(p_actor_name), '') is null or nullif(btrim(p_request_key), '') is null or char_length(btrim(p_request_key)) > 120
    then raise exception 'actor_and_request_key_required'; end if;
  if nullif(btrim(p_display_name), '') is null or char_length(btrim(p_display_name)) > 80 or p_status not in ('active', 'retired')
    then raise exception 'invalid_industry_category'; end if;
  perform pg_advisory_xact_lock(hashtextextended('distributor-industry:' || p_request_key, 0));
  select target_id into prior_target from public.admin_audit_logs
    where action in ('distributor_industry_category_created', 'distributor_industry_category_updated')
      and metadata->>'requestKey' = p_request_key order by created_at desc limit 1;
  if prior_target is not null then return jsonb_build_object('categoryId', prior_target, 'alreadyApplied', true); end if;
  select * into existing from public.distributor_industry_categories where id = category_id for update;
  insert into public.distributor_industry_categories(id, display_name, status, created_by, updated_by)
  values(category_id, btrim(p_display_name), p_status, p_actor_name, p_actor_name)
  on conflict(id) do update set display_name = excluded.display_name, status = excluded.status,
    updated_by = excluded.updated_by, updated_at = now() returning * into saved;
  insert into public.admin_audit_logs(action, target_type, target_id, metadata)
  values(case when existing.id is null then 'distributor_industry_category_created' else 'distributor_industry_category_updated' end,
    'distributor_industry_category', saved.id,
    jsonb_build_object('requestKey', p_request_key, 'actorName', p_actor_name,
      'before', case when existing.id is null then null else jsonb_build_object('displayName', existing.display_name, 'status', existing.status) end,
      'after', jsonb_build_object('displayName', saved.display_name, 'status', saved.status),
      'impact', public.preview_distributor_industry_category_impact(saved.id)));
  return jsonb_build_object('categoryId', saved.id, 'alreadyApplied', false);
end $$;

create function public.admin_set_company_distributor_industries(
  p_company uuid, p_category_ids uuid[], p_actor_name text, p_request_key text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare preview jsonb; category_ids uuid[]; prior_target uuid;
begin
  if nullif(btrim(p_actor_name), '') is null or nullif(btrim(p_request_key), '') is null or char_length(btrim(p_request_key)) > 120
    then raise exception 'actor_and_request_key_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('distributor-industry:' || p_request_key, 0));
  select target_id into prior_target from public.admin_audit_logs
    where action = 'company_distributor_industries_changed' and metadata->>'requestKey' = p_request_key
    order by created_at desc limit 1;
  if prior_target is not null then return jsonb_build_object('companyId', prior_target, 'alreadyApplied', true); end if;
  perform 1 from public.companies where id = p_company for update;
  if not found then raise exception 'company_not_found'; end if;
  preview := public.preview_company_distributor_industries(p_company, p_category_ids);
  if not (preview->>'changed')::boolean then return preview || jsonb_build_object('alreadyApplied', false); end if;
  select coalesce(array_agg(value::uuid order by value::uuid), '{}'::uuid[]) into category_ids
    from jsonb_array_elements_text(preview->'afterCategoryIds') value;
  delete from public.company_distributor_industries where company_id = p_company;
  insert into public.company_distributor_industries(company_id, industry_category_id, assigned_by)
    select p_company, category_id, p_actor_name from unnest(category_ids) category_id;
  insert into public.admin_audit_logs(action, target_type, target_id, company_id, metadata)
  values('company_distributor_industries_changed', 'company', p_company, p_company,
    jsonb_build_object('requestKey', p_request_key, 'actorName', p_actor_name,
      'beforeCategoryIds', preview->'beforeCategoryIds', 'afterCategoryIds', preview->'afterCategoryIds',
      'activeConnectionCount', preview->'activeConnectionCount', 'affectedStoreCount', preview->'affectedStoreCount'));
  return preview || jsonb_build_object('alreadyApplied', false);
end $$;

alter table public.distributor_industry_categories enable row level security;
alter table public.company_distributor_industries enable row level security;
revoke all on table public.distributor_industry_categories, public.company_distributor_industries from public, anon, authenticated, service_role;
revoke all on function public.preview_company_distributor_industries(uuid, uuid[]),
  public.preview_distributor_industry_category_impact(uuid),
  public.admin_save_distributor_industry_category(uuid, text, text, text, text),
  public.admin_set_company_distributor_industries(uuid, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.preview_company_distributor_industries(uuid, uuid[]),
  public.preview_distributor_industry_category_impact(uuid),
  public.admin_save_distributor_industry_category(uuid, text, text, text, text),
  public.admin_set_company_distributor_industries(uuid, uuid[], text, text) to service_role;

comment on table public.distributor_industry_categories is 'MAJU-managed distributor industry identities. IDs are stable; display names may change.';
comment on table public.company_distributor_industries is 'Many-to-many distributor industry assignments. companies.business_type remains an unrelated legacy lead default.';
notify pgrst, 'reload schema';
