-- DOWN: CX-144 U0b. 함수만 제거한다. 이미 연결된 구성원 행과 이벤트(감사 기록)는 그대로 둔다(데이터 변경 없음).
begin;
drop function if exists public.admin_link_store_member_v1(uuid,uuid,text,uuid,text,text,boolean);
commit;
