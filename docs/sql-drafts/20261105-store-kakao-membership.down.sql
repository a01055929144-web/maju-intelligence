-- 폐기 가능한 합성 DB용 down 초안. 운영 데이터 생성 후 파괴적 down 금지.
begin;
drop function if exists public.accept_store_member_invitation_v1(uuid,uuid,uuid,text);
drop function if exists public.create_store_member_invitation_v1(uuid,uuid,uuid,text,text);
drop function if exists public.provision_store_owner_v1(uuid,uuid,uuid,uuid);
drop index if exists public.store_account_member_invite_hash_uq;
drop index if exists public.store_account_member_active_auth_uq;
alter table public.store_account_members drop constraint if exists store_account_members_auth_user_fk;
commit;
