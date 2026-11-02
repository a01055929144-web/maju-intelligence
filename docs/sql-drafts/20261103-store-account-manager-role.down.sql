-- manager 행이 생긴 뒤에는 역할 손실을 막기 위해 down을 거부한다.
begin;

do $$
begin
  if exists (select 1 from public.store_account_members where role='manager') then
    raise exception 'manager_role_down_refused_data_exists';
  end if;
end $$;

alter table public.store_account_members
  drop constraint store_account_members_role_check;
alter table public.store_account_members
  add constraint store_account_members_role_check
  check (role in ('owner','staff')) not valid;
alter table public.store_account_members
  validate constraint store_account_members_role_check;

commit;
