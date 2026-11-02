-- Review only. Removing role settings destroys custom permissions and audit linkage.
begin;
drop trigger if exists companies_seed_role_permissions_v1 on public.companies;
drop function if exists public.apply_role_settings_batch_v1(uuid, uuid, uuid[], text, jsonb);
drop function if exists public.seed_role_permissions_for_company_v1();
drop function if exists public.seed_role_permissions_v1(uuid);
drop table if exists public.role_permissions;
alter table public.company_members
  drop constraint if exists company_members_permission_group_key_check,
  drop constraint if exists company_members_permission_overrides_object_check,
  drop column if exists permission_group_key,
  drop column if exists permission_overrides;
commit;
