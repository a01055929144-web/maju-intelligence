-- 거래처 출입방법/비밀번호 저장 (2026-08-24 피드백: "거래처의 출입방법과 비밀번호를 저장해야해.
-- 놓친 것 같아 ... 열쇠인지, 카드인지, 비밀번호인지, 어디 숨겨놓은 건지 등 넣어야해").
-- access_method_type: 열쇠 / 카드 / 비밀번호 / 숨김위치 / 기타 중 하나(자유 텍스트로도 허용).
-- access_note: 위 타입에 대한 구체적인 설명(예: "화단 옆 돌 밑에 열쇠", "경비실에 카드 맡김").
-- access_password: 도어락 등 비밀번호 값 자체. 평문 저장이라 화면에서는 기본적으로 마스킹해서 보여주고
-- 눌렀을 때만 노출하는 방식으로 취급합니다(별도 암호화 컬럼을 추가할 정도로 민감한 결제 정보는 아니라고
-- 판단했습니다 — 필요해지면 이후 라운드에서 암호화를 추가할 수 있습니다).
alter table public.normalized_customers
  add column if not exists access_method_type text,
  add column if not exists access_note text,
  add column if not exists access_password text;
