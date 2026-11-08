# 01 거래처 배송 후보 상태 DB 승인 경계

상태: **승인 전 · 운영 적용/백필 금지 · 기능 OFF**

- 설계: `docs/work-orders/2026-11-08-01-delivery-eligibility.md`
- SQL 초안: `docs/sql-drafts/20261108-01-delivery-eligibility.review.sql`
- 소유: 01 지도 홈

## 승인 대상

`normalized_customers.delivery_eligibility`에 `eligible | not_ready`만 저장한다. 기존 행은 현재 코스 보존을 위해 승인된 한 번의 백필에서만 `eligible`로 설정하고, 이후 신규 행의 기본값은 `not_ready`로 둔다.

## 금지

- 승인 전 운영 SQL 실행 또는 기존 행 백필
- `TEST_ONLY` 등 상호·메모 문자열 판정
- `relationship_status`나 `business_status` 재사용
- 주문 생성만으로 `eligible` 전환
- 02 `unassigned` 주문의 자동 배차
- 기능 플래그 ON 또는 운영 배포

## 승인 전 증거

- PostgreSQL 17 up/down 검증
- 기존 행 수 = 백필 뒤 `eligible` 행 수
- 신규 행 기본 `not_ready`, NULL·임의 문자열 거부
- 기능 OFF에서 기존 코스 결과 diff 0
- 기능 ON 합성 테스트에서 신규 `not_ready`의 지도·코스 제외
- 1440px·390px 지도 회귀와 02 `unassigned` 계약 회귀
