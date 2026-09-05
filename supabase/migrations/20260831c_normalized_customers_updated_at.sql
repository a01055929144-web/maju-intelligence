-- 2026-08-31 에러 처리/복원력 감사 후속: 거래처 마스터(normalized_customers) 동시 편집 시
-- 나중에 저장한 사람이 앞서 저장된 내용을 조용히 덮어쓰는 문제(낙관적 동시성 제어 부재)를 막기
-- 위해 updated_at 컬럼을 추가합니다. 이 컬럼은 upsertCustomerMaster가 매 저장마다 직접
-- now()로 갱신하며(다른 테이블들과 동일한 앱 레벨 패턴, DB 트리거 없음), 클라이언트가 마지막으로
-- 읽은 updated_at 값을 저장 요청에 함께 보내면 서버가 현재 값과 비교해 그 사이 다른 사람이 먼저
-- 저장했는지 확인할 수 있게 됩니다.
alter table public.normalized_customers
  add column if not exists updated_at timestamptz not null default now();

-- 기존 행은 created_at 값으로 백필합니다(정확한 마지막 수정 시각은 알 수 없지만, 이후부터는
-- 모든 저장이 이 컬럼을 갱신하므로 문제되지 않습니다).
update public.normalized_customers
set updated_at = created_at
where updated_at is null;
