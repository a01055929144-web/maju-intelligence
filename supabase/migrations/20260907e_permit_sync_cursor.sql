-- 2026-09-07 피드백("전국 일주일 걸린다고 했잖아 -- 그런 리드 시간을 충분히 설정해서 진행하도록해"):
-- 매일 자동으로 도는 전국/서울 공공데이터 동기화(app/api/cron/business-status)가 지금까지는
-- lib/gov-restaurant.ts, lib/seoul-restaurant.ts의 rotateStartPage()로 "오늘 날짜" 기준 구간을
-- 매번 새로 계산해서 시작했습니다. 문제는 한 번의 실행(서버리스 함수 시간 제한 안)이 그 구간의
-- 극히 일부 페이지만 스캔하고 멈추는데, 다음날은 그 나머지를 이어가는 게 아니라 날짜가 바뀌며
-- 완전히 다른 구간으로 점프해버려서, 매일 그 날 배정된 구간의 대부분(약 97%)이 영영 스캔되지
-- 않고 버려졌습니다. 이 컬럼에 "다음에 이어서 스캔할 페이지"를 회사별로 저장해두면, 매일 자동
-- 실행이 어제 멈춘 지점부터 진짜로 이어서 진행할 수 있어 하루하루의 진행이 낭비되지 않습니다.
alter table public.companies
  add column if not exists gov_restaurant_sync_cursor integer,
  add column if not exists seoul_restaurant_sync_cursor integer;
