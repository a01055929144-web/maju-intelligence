-- 2026-09-07: 직원이 카카오 가입을 완료해도 거래처의 배송담당자/배송차량 이름 표기가
-- 실제 카카오 로그인 이름과 다르면(예: 등록된 담당자명 "정두영" vs 카카오 닉네임) 자동
-- 매칭(lib/auth.ts getCustomerAssignmentKeys)이 실패해 그 직원에게 거래처가 하나도 보이지
-- 않는 문제가 있었습니다. 관리자가 화면에서 수동으로 "이 직원 = 이 담당자명/이 차량" 을
-- 지정할 수 있도록 초대 건에 수동 연결 값을 저장합니다.
alter table public.staff_invitations
  add column if not exists assigned_manager_name text,
  add column if not exists assigned_vehicle text;
