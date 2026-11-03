-- 11/4 00:30 장애: 직원 초대 시 '권한 저장 실패'. update_staff_access_v2 가 담당 업무를 sales/delivery 만 허용(invalid_duties).
-- 11/3 승인(20261103_staff_duties_office)에서 테이블 제약만 넓히고 이 함수는 빠졌음. 운영 DB fcmdvveqmcgtioelzqun 승인 문구 필요.
-- 변경은 허용 목록 한 줄(office, other 추가)뿐, 나머지 본문은 운영 함수 그대로.
begin;
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.update_staff_access_v2(uuid,uuid,uuid,boolean,text,text[],timestamp with time zone,text)'::regprocedure) into v_def;
  if position($q$array['sales','delivery']::text[]$q$ in v_def) = 0 then raise exception 'unexpected function body'; end if;
  v_def := replace(v_def, $q$array['sales','delivery']::text[]$q$, $q$array['sales','delivery','office','other']::text[]$q$);
  execute v_def;
end $$;
commit;
