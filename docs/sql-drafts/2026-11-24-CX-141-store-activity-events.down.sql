-- DOWN: CX-141 C 활동 기록 함수와 표 제거(기록 데이터도 함께 사라짐 — 매장 주문·문서 데이터는 건드리지 않음).
begin;
drop function if exists public.record_store_activity_v1(uuid, uuid, text, uuid);
drop table if exists public.store_activity_events;
commit;
