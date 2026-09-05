-- 거래처가 폐업하지 않았더라도, 더 이상 거래하지 않기로 한 경우를 수동으로 표시할 수 있도록
-- relationship_status(거래중/거래종료) 컬럼을 추가합니다. 정부 API로 자동 조회하는
-- business_status(정상/휴업/폐업)와는 별개의, 사람이 직접 내리는 판단입니다.
alter table normalized_customers
  add column if not exists relationship_status text default '거래중',
  add column if not exists relationship_status_updated_at timestamptz,
  add column if not exists relationship_status_note text;

-- 기존 거래처는 전부 거래중으로 채워둡니다(신규 컬럼이라 기존 행은 NULL로 들어와 있을 수 있음).
update normalized_customers
set relationship_status = '거래중'
where relationship_status is null;
