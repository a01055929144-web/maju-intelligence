-- 담당자별 생일을 남겨 추후 연락·관리(생일 축하 연락 등)에 참고할 수 있게 합니다.
-- role(직책)은 20260818b 마이그레이션에서부터 이미 자유 입력 텍스트였습니다(별도 변경 불필요).
alter table public.customer_contacts
  add column if not exists birth_date date;
