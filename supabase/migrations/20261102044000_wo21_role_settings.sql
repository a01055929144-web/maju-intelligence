-- WO-21 2차 RoleSettings 초안. 대표 승인 전 운영 DB에 적용하지 않는다.
begin;

alter table public.company_members
  add column if not exists permission_group_key text,
  add column if not exists permission_overrides jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.company_members add constraint company_members_permission_group_key_check
    check (permission_group_key is null or permission_group_key in ('owner','manager','sales','delivery','field_sales','accounting'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.company_members add constraint company_members_permission_overrides_object_check
    check (jsonb_typeof(permission_overrides) = 'object');
exception when duplicate_object then null; end $$;

create table if not exists public.role_permissions (
  company_id uuid not null references public.companies(id) on delete cascade,
  role_key text not null check (role_key in ('owner','manager','sales','delivery','field_sales','accounting')),
  permission_key text not null check (permission_key in ('pc_access','sales_leads_map','quotes_prices','cost_prices','orders_fulfillment','delivery_app','vouchers_money','customer_contacts','manage_staff_permissions','export_data')),
  allowed boolean not null,
  updated_at timestamptz not null default now(),
  primary key (company_id, role_key, permission_key)
);
alter table public.role_permissions enable row level security;
revoke all on public.role_permissions from public, anon, authenticated;
grant all on public.role_permissions to service_role;

create or replace function public.seed_role_permissions_v1(p_company_id uuid)
returns void language sql security invoker set search_path = public as $$
  insert into public.role_permissions(company_id, role_key, permission_key, allowed)
  select p_company_id, role_key, permission_key, permission_key = any(allowed_keys)
    from (values
      ('owner', array['pc_access','sales_leads_map','quotes_prices','cost_prices','orders_fulfillment','delivery_app','vouchers_money','customer_contacts','manage_staff_permissions','export_data']::text[]),
      ('manager', array['pc_access','sales_leads_map','quotes_prices','cost_prices','orders_fulfillment','delivery_app','vouchers_money','customer_contacts','manage_staff_permissions','export_data']::text[]),
      ('sales', array['pc_access','sales_leads_map','quotes_prices','cost_prices','customer_contacts','export_data']::text[]),
      ('delivery', array['orders_fulfillment','delivery_app','customer_contacts']::text[]),
      ('field_sales', array['sales_leads_map','quotes_prices','cost_prices','customer_contacts']::text[]),
      ('accounting', array['pc_access','cost_prices','vouchers_money','export_data']::text[])
    ) groups(role_key, allowed_keys)
    cross join unnest(array['pc_access','sales_leads_map','quotes_prices','cost_prices','orders_fulfillment','delivery_app','vouchers_money','customer_contacts','manage_staff_permissions','export_data']) permission_key
  on conflict (company_id, role_key, permission_key) do nothing;
$$;
revoke all on function public.seed_role_permissions_v1(uuid) from public, anon, authenticated;
grant execute on function public.seed_role_permissions_v1(uuid) to service_role;

select public.seed_role_permissions_v1(id) from public.companies;

create or replace function public.seed_role_permissions_for_company_v1()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  perform public.seed_role_permissions_v1(new.id);
  return new;
end;
$$;
drop trigger if exists companies_seed_role_permissions_v1 on public.companies;
create trigger companies_seed_role_permissions_v1 after insert on public.companies
for each row execute function public.seed_role_permissions_for_company_v1();
revoke all on function public.seed_role_permissions_for_company_v1() from public, anon, authenticated;

create or replace function public.apply_role_settings_batch_v1(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_target_user_ids uuid[],
  p_role_key text,
  p_overrides jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_role text;
  v_target_count integer;
  v_target_owner_count integer;
begin
  if p_role_key not in ('owner','manager','sales','delivery','field_sales','accounting') then raise exception 'invalid_role_group'; end if;
  if coalesce(cardinality(p_target_user_ids), 0) = 0 or cardinality(p_target_user_ids) > 100 then raise exception 'invalid_target_count'; end if;
  if (select count(distinct id) from unnest(p_target_user_ids) id) <> cardinality(p_target_user_ids) then raise exception 'duplicate_targets'; end if;
  if jsonb_typeof(coalesce(p_overrides, '{}'::jsonb)) <> 'object' then raise exception 'invalid_overrides'; end if;
  if exists (
    select 1 from jsonb_each(coalesce(p_overrides, '{}'::jsonb)) item
     where item.key not in ('pc_access','sales_leads_map','quotes_prices','cost_prices','orders_fulfillment','delivery_app','vouchers_money','customer_contacts','manage_staff_permissions','export_data')
        or jsonb_typeof(item.value) <> 'boolean'
  ) then raise exception 'invalid_overrides'; end if;

  select coalesce(permission_role, case when role = 'owner' then 'owner' when role = 'manager' then 'manager' else 'staff' end)
    into v_actor_role
    from public.company_members
   where company_id = p_company_id and user_id = p_actor_user_id and status = 'active'
   for update;
  if v_actor_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_role_key = 'owner' and v_actor_role <> 'owner' then raise exception 'owner_grant_forbidden'; end if;
  if v_actor_role = 'owner' and p_actor_user_id = any(p_target_user_ids) and cardinality(p_target_user_ids) > 1 then raise exception 'owner_self_mixed_batch_forbidden'; end if;

  perform 1 from public.company_members
   where company_id = p_company_id and user_id = any(p_target_user_ids) and status = 'active'
   for update;
  select count(*), count(*) filter (where coalesce(permission_role, role) = 'owner')
    into v_target_count, v_target_owner_count
    from public.company_members
   where company_id = p_company_id and user_id = any(p_target_user_ids) and status = 'active';
  if v_target_count <> cardinality(p_target_user_ids) then raise exception 'target_not_found'; end if;
  if v_target_owner_count > 0 and v_actor_role <> 'owner' then raise exception 'owner_target_forbidden'; end if;
  if v_target_owner_count > 0 and p_role_key <> 'owner' and
     (select count(*) from public.company_members where company_id = p_company_id and status = 'active' and coalesce(permission_role, role) = 'owner') <= v_target_owner_count
  then raise exception 'minimum_owner_required'; end if;

  insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
  select p_actor_user_id, p_company_id, 'role_settings_batch_applied', 'app_user', member.user_id,
         jsonb_build_object('beforeGroup', member.permission_group_key, 'beforeOverrides', member.permission_overrides, 'afterGroup', p_role_key, 'afterOverrides', coalesce(p_overrides, '{}'::jsonb))
    from public.company_members member
   where member.company_id = p_company_id and member.user_id = any(p_target_user_ids);

  update public.company_members set
    permission_group_key = p_role_key,
    permission_overrides = coalesce(p_overrides, '{}'::jsonb),
    permission_role = case p_role_key when 'owner' then 'owner' when 'manager' then 'manager' else 'staff' end,
    role = case p_role_key when 'owner' then 'owner' when 'manager' then 'manager' when 'sales' then 'sales' when 'delivery' then 'driver' when 'field_sales' then 'sales' else 'member' end,
    duties = case p_role_key when 'owner' then array['sales','delivery'] when 'manager' then array['sales','delivery'] when 'sales' then array['sales'] when 'delivery' then array['delivery'] when 'field_sales' then array['sales'] else '{}'::text[] end,
    updated_at = now()
  where company_id = p_company_id and user_id = any(p_target_user_ids) and status = 'active';

  update public.staff_invitations invitation set
    permission_role = member.permission_role,
    role = member.role,
    duties = member.duties
  from public.company_members member
  where invitation.company_id = p_company_id and invitation.accepted_by = member.user_id
    and member.company_id = p_company_id and member.user_id = any(p_target_user_ids);
end;
$$;
revoke all on function public.apply_role_settings_batch_v1(uuid,uuid,uuid[],text,jsonb) from public, anon, authenticated;
grant execute on function public.apply_role_settings_batch_v1(uuid,uuid,uuid[],text,jsonb) to service_role;

commit;

-- Down (승인·적용 시 별도 검토): trigger/functions → role_permissions → company_members 추가 컬럼 순으로 제거.
