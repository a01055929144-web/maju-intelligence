-- 2026-08-28 피드백 대응: 신규 리드(공공데이터) 야간 자동 동기화가 실패해도 화면에 아무 표시가
-- 없어, "어제 진짜 신규 매물이 없었던 건지" "동기화 자체가 실패한 건지" 구분할 수 없던 문제를
-- 고칩니다. 각 데이터 소스(행정안전부/서울 열린데이터)의 마지막 동기화 시각·성공여부를 companies
-- 테이블에 기록해두고, 신규 리드 화면에서 확인할 수 있게 합니다.
alter table companies
  add column if not exists gov_restaurant_sync_last_at timestamptz,
  add column if not exists gov_restaurant_sync_last_status text,
  add column if not exists gov_restaurant_sync_last_message text,
  add column if not exists seoul_restaurant_sync_last_at timestamptz,
  add column if not exists seoul_restaurant_sync_last_status text,
  add column if not exists seoul_restaurant_sync_last_message text;
