# CX-144 긴급 수정 · 홍곱창 거래처 복구 (2026-11-25)

## 1. core 함수 권한 (P1, 대표 승인 "승인, 지금 적용")
- 증상: 거래처 화면 "점주 개통 링크를 만들지 못했습니다" (운영 DB 로그 `permission denied for function prepare_store_owner_activation_core_v1`).
- 원인: U0 SQL이 core 함수를 service_role에서도 revoke. 래퍼가 security invoker라 서버 호출이 실패. PG17 시험은 superuser로 돌아 못 잡음.
- 조치: `docs/sql-drafts/2026-11-25-CX-144-u0-grant-fix.sql` 적용. 검증: service_role 실행 가능, anon·authenticated 불가. service_role 역할로 롤백 트랜잭션 호출 시 권한 오류 없이 업무 규칙까지 도달.
- 재발 방지: PG17 시험에서 `set role service_role`로 래퍼 호출 시나리오 추가(클로드코드 후속).

## 2. 홍곱창 신촌점 거래처 복구 (대표 승인 "복구 승인")
- 원인(컨트롤타워 실수): 11/24 테스트 거래처를 `/api/customers` POST(사업자번호 8913… , confirmDuplicate)로 만들었는데, normalized_key(사업자번호) 일치로 기존 홍곱창 거래처(979b9c11…)를 덮어씀 → 이름 "[테스트] 대표 초대 매장", import_id 교체, 일부 칸 초기화.
- 복구: 이름을 매장 프로필의 상호 "홍곱창 신촌점"으로, 주소를 매장 프로필 주소로 되돌림. 전화·대표자명 등 원래 값 기록 없음 → 대표 확인 필요.
- 후속(P2 백로그): 거래처 등록 시 사업자번호가 같은 기존 거래처를 빈 값으로 덮어쓰는 동작 — 덮어쓰기 대신 기존 거래처 안내로 바꿀 것.
