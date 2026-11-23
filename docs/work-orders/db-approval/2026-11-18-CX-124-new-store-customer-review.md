# CX-124 새 매장 매출처 확인 DB 승인표

상태: 2026-11-21 14:05 KST 승인 범위 운영 적용·읽기 검증 완료. 기능 ON·배포는 별도이다.

## 변경
- 쓰기 규칙은 기존 CX-13 `confirm_store_customer_v1`·`link_store_account_to_customer_v1`를 그대로 사용한다.
- `customer_review_status='needs_review'` 매장만 회사별로 읽는 service-role 전용 함수 1개를 추가한다.
- 매장 프로필·가격 공개 테이블과 함수는 변경하지 않는다.

## 검증·승인
| 항목 | 상태 |
|---|---|
| SQL/down/PG17 | 초안·복구안 준비, PG17 통과 |
| RLS·회사 경계 | 운영 정의에서 p_company·needs_review 필터 확인. service_role 실행 허용, anon/authenticated/PUBLIC 차단 |
| 운영 적용 승인 | 프로젝트·파일 명시 질문에 대한 대표의 후속 전체 승인. 원문 1회 적용, 가상 회사 ID 조회 0건·새 함수 보안 권고 0건 확인. 재실행 금지 |
| 기능 ON·배포 | 이번 적용에 포함되지 않음 |
