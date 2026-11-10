-- DRAFT ONLY (CX-10 down). Requires separate approval. Refuses to drop data that already exists.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
  if exists(select 1 from public.store_profiles) or exists(select 1 from public.company_store_invite_codes)
    or exists(select 1 from public.store_accounts where store_profile_id is not null or invite_code_id is not null)
    then raise exception 'cx10_down_refused_existing_profiles_or_codes'; end if;
end $$;
drop function public.resolve_company_store_invite_code_v1(text);
drop function public.revoke_company_store_invite_code_v1(uuid,uuid);
drop function public.issue_company_store_invite_code_v1(uuid,text,timestamptz,text);
drop function public.create_store_profile_v1(uuid,text,text,text,text,text,text);
alter table public.store_accounts drop constraint store_accounts_invite_code_fk;
alter table public.store_accounts drop constraint store_accounts_company_profile_uq;
drop index public.store_accounts_store_profile_idx;
alter table public.store_accounts drop column invite_code_id, drop column store_profile_id;
drop table public.company_store_invite_codes;
drop table public.store_profile_members;
drop table public.store_profiles;
commit;
