-- DRAFT ONLY. CX-78 rollback.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

drop function if exists public.admin_set_store_profile_status_v1(uuid,uuid,text,text,uuid,text);

-- 상태와 감사 기록은 운영 사실이므로 되돌리거나 삭제하지 않는다.
commit;
