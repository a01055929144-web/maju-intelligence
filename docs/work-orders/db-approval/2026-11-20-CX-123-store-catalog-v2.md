# CX-123 전체 상품 진열 함수 v2 — DB 승인 대기

- 적용 SQL: `docs/sql-drafts/2026-11-20-CX-123-store-catalog-v2.sql`
- 안전 down: `docs/sql-drafts/2026-11-20-CX-123-store-catalog-v2.down.sql`
- 격리 시험: `docs/sql-drafts/2026-11-20-CX-123-store-catalog-v2.pg17.test.sql`
- 승인 상태: **미승인 · 미적용**
- 기능 상태: 기본 OFF, 회사 allowlist 미승인

이 문서는 운영 적용 권한을 부여하지 않는다. CX-120 가격 함수와 아래 선행 객체를 읽기 점검하고, 대표가 대상 프로젝트와 CX-123을 명시해 별도 승인한 뒤에만 up SQL을 한 번 적용한다. 기능 ON, 회사 allowlist, 화면 연결, 배포는 각각 별도 승인 대상이다.

## 범위

- `store_member_catalog_v2`는 같은 매장 프로필에 연결된 유통사별 전체 활성 상품을 반환한다.
- 유통사, 대·중·소 분류, 글자 검색, 50개 페이지를 지원한다.
- 규격·판매단위·사진·과세·행사·품목 마감과 CX-120의 `source`, `promise_until`을 반환한다.
- 가격은 `self_order_price_v2`만 사용한다. 화면이나 새 SQL에서 약속가·지정 카탈로그·기본가를 다시 계산하지 않는다.
- 보기의 가격 공개 판정과 `store_order_eligibility`의 주문 가능 판정을 분리한다. 주문 차단 상태에서도 상품 이름은 볼 수 있다.
- CX-122가 아직 없으면 기존처럼 주문 가능한 연결에만 가격을 공개한다. CX-122 적용 뒤에는 `store_price_visible_v1`의 수동 외식업 확인 결과만 가격 공개에 사용한다.
- 가격 비공개이면 일반 단가, 행사 단가, `source`, `promise_until`, 포함가 여부가 모두 `null`이다.

## 아직 운영에 없는 선행 스키마 (2026-11-22 읽기 확인)

- CX-120 `self_order_price_v2`는 적용·읽기 검증됐습니다.
- ① `docs/sql-drafts/20261102-WO-03-product-catalog-schema.sql`의 `product_categories`와 `product_catalog.category_id`는 운영에 없습니다.
- ② `docs/sql-drafts/2026-11-18-D4-S-3bc-order-cutoff-promotion-remaining.sql`의 `product_catalog.order_cutoff_days_before`·`order_cutoff_time`과 `promotion_remaining_v1`은 운영에 없습니다.
- 운영 적용 순서는 ① → ② → CX-123입니다. ①·②는 현행 운영 스키마·격리 PostgreSQL 17에서 다시 대조하고, 각 SQL에 대해 대상 프로젝트를 명시한 별도 승인을 받은 뒤에만 적용합니다. 지금은 CX-123 운영 적용 조건을 충족하지 않습니다.
- 이 PR의 CI 통과는 격리 시험 결과이며 운영 선행 스키마 존재 또는 적용 승인이 아닙니다. 기능은 기본 OFF, 회사 allowlist 미승인입니다.

## 적용 전 읽기 점검

1. `store_accounts`, `product_catalog`, `product_categories`, `pricing_promotions`가 존재한다.
2. `self_order_member`, `store_order_eligibility`, CX-120 `self_order_price_v2`가 존재한다.
3. `product_catalog.category_id`, `order_cutoff_days_before`, `order_cutoff_time`이 존재한다.
4. `store_member_catalog_v2`와 내부 공개 판정 함수가 아직 없다.
5. CX-123 소비 화면·API 기능은 OFF이고 회사 allowlist가 없다.
6. #1109 소유 화면·공유 CI와 운영 SQL을 이번 적용 범위에 포함하지 않는다.

## 적용 후 읽기 검증

- 같은 매장 프로필의 연결 회사만 조회되고 다른 매장 프로필과 다른 회사 상품은 나오지 않는다.
- 유통사·대중소 분류·글자 검색과 페이지당 최대 50개가 정확하다.
- CX-120의 가격·과세·`source`·`promise_until`이 그대로 전달된다.
- 주문 차단 사유와 `can_order`는 가격 공개와 독립적이다.
- CX-122 확인 전·취소 후에는 모든 일반/행사 가격이 `null`이고, 확인 후에만 가격이 보인다.
- anon/authenticated는 실행할 수 없고 공개 내부 함수는 service_role에도 직접 노출되지 않는다.
- 기능 OFF, 회사 allowlist 없음, 운영 데이터 변경 0건을 다시 확인한다.

## down 제한

down은 새 함수 두 개만 삭제하며 데이터 행을 변경하지 않는다. 다른 객체가 함수를 참조하면 중단한다. 소비 API·화면이 연결된 뒤에는 먼저 기능 OFF와 의존 객체 제거를 확인하고 별도 복구 승인을 받아야 한다.

## PG17 근거

- 51개+다른 유통사 상품의 50개 페이지와 다음 페이지 수.
- 유통사 탭, 대·중·소 분류, 글자 검색, 규격·사진·과세·품목 마감·행사 반환.
- CX-122 부재 시 기존 공개 동작, 적용 후 확인 결과와 주문 차단의 독립성.
- 비공개 일반/행사 가격 null, 타 매장 프로필 차단, 권한, down/re-up 확인.
