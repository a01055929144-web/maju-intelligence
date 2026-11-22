# CX-123 전체 상품 진열 함수 v2 — 운영 적용 기록

- 적용 SQL: `docs/sql-drafts/2026-11-20-CX-123-store-catalog-v2.sql`
- 안전 down: `docs/sql-drafts/2026-11-20-CX-123-store-catalog-v2.down.sql`
- 격리 시험: `docs/sql-drafts/2026-11-20-CX-123-store-catalog-v2.pg17.test.sql`
- 승인 상태: **대표 조건부 승인 · 적용 중** (운영 프로젝트 `fcmdvveqmcgtioelzqun`, 2026-11-22)
- 기능 상태: 기본 OFF, 회사 allowlist 미승인

대표가 운영 프로젝트와 CX-123을 명시해 조건부 적용을 승인했다. CX-120·WO-03·D4 선행 객체를 읽기 검증했고 #1222 전체 CI 초록·병합을 확인했다. 기능 ON, 회사 allowlist, 화면 연결, 배포는 이번 적용 범위에 포함하지 않는다.

## 범위

- `store_member_catalog_v2`는 같은 매장 프로필에 연결된 유통사별 전체 활성 상품을 반환한다.
- 유통사, 대·중·소 분류, 글자 검색, 50개 페이지를 지원한다.
- 규격·판매단위·사진·과세·행사·품목 마감과 CX-120의 `source`, `promise_until`을 반환한다.
- 가격은 `self_order_price_v2`만 사용한다. 화면이나 새 SQL에서 약속가·지정 카탈로그·기본가를 다시 계산하지 않는다.
- 보기의 가격 공개 판정과 `store_order_eligibility`의 주문 가능 판정을 분리한다. 주문 차단 상태에서도 상품 이름은 볼 수 있다.
- CX-122가 아직 없으면 기존처럼 주문 가능한 연결에만 가격을 공개한다. CX-122 적용 뒤에는 `store_price_visible_v1`의 수동 외식업 확인 결과만 가격 공개에 사용한다.
- 가격 비공개이면 일반 단가, 행사 단가, `source`, `promise_until`, 포함가 여부가 모두 `null`이다.

## 선행 조건 완료

- CX-120 `self_order_price_v2`는 적용·읽기 검증 완료.
- WO-03 상품 분류 스키마는 승인·1회 적용·읽기 검증 완료(#1256).
- D4 품목 마감·행사 잔량 스키마는 승인·1회 적용·읽기 검증 완료(#1257).
- #1222 최신 CI 초록·main 병합 완료. CX-123 함수는 적용 직전 조회에서 없음.
- 이번 운영 변경은 잠금→1회 적용→결과를 한 PR에 기록한다. 기존 상품·가격·세금·주문은 바꾸지 않는다.

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
