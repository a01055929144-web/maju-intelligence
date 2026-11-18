# CX-124 새 매장 매출처 확인 DB 승인표

상태: 검토용 초안. 운영 DB 적용·기능 ON·배포 승인이 아니다.

## 변경
- 쓰기 규칙은 기존 CX-13 `confirm_store_customer_v1`·`link_store_account_to_customer_v1`를 그대로 사용한다.
- `customer_review_status='needs_review'` 매장만 회사별로 읽는 service-role 전용 함수 1개를 추가한다.
- 매장 프로필·가격 공개 테이블과 함수는 변경하지 않는다.

## 검증·승인
| 항목 | 상태 |
|---|---|
| SQL/down/PG17 | 준비 |
| RLS·회사 경계 | service_role 전용, p_company 필터 |
| 운영 적용 승인 | 미승인 |
| 기능 ON·배포 | 금지 |
