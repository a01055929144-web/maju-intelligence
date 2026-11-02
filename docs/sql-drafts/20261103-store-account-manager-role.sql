-- 별도 승인 범위: store_account_members.role CHECK에 manager만 추가한다.
-- 기존 행, RLS, 권한, 함수는 변경하지 않는다.
begin;

do $$
begin
  if exists (
    select 1 from public.store_account_members
    where role not in ('owner','staff')
  ) then
    raise exception 'unexpected_store_account_member_role';
  end if;
end $$;

alter table public.store_account_members
  drop constraint store_account_members_role_check;
alter table public.store_account_members
  add constraint store_account_members_role_check
  check (role in ('owner','manager','staff')) not valid;
alter table public.store_account_members
  validate constraint store_account_members_role_check;

commit;
