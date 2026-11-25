-- CX-144 U0 후속(운영 적용 완료 2026-11-25 17:2x, 대표 승인): 래퍼(security invoker)가 부르는 core 함수의 service_role 실행 권한 누락 수정.
-- 원인: U0 SQL이 core를 service_role에서도 revoke → prepare_store_owner_activation_v1 호출 시 permission denied.
begin;
grant execute on function public.prepare_store_owner_activation_core_v1(uuid,uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
