# D4 S-3bc 품목 마감·행사 잔량 — 운영 DB 승인 대기

- 적용: `docs/sql-drafts/2026-11-18-D4-S-3bc-order-cutoff-promotion-remaining.sql`
- 복구: `docs/sql-drafts/2026-11-18-D4-S-3bc-order-cutoff-promotion-remaining.down.sql`
- 상태: **미승인 · 운영 미적용**. 이 문서는 적용 권한이 아닙니다.

## 범위와 순서

WO-03 적용·읽기 검증 뒤, CX-123 전에 실행합니다. `product_catalog`에 nullable 마감 일수·시각 두 열과 쌍 제약을 추가하고, `service_role` 전용 `promotion_remaining_v1` 읽기 함수를 만듭니다. 기존 상품·주문·행사행을 바꾸지 않습니다. 두 열이 NULL이면 품목 마감은 OFF이며 회사 기본 마감도 바꾸지 않습니다. up은 한 트랜잭션으로 실행됩니다.

## 적용 관문

- 대상 운영 프로젝트를 명시한 대표의 **D4 S-3bc 별도 승인**이 있어야 합니다. WO-03 또는 CX-123 승인과 별개입니다.
- 직전 읽기에서 마감 두 열·대상 제약·잔량 함수가 없고, `product_catalog`·`pricing_promotions`·`store_orders`·`store_order_lines`와 참조 열이 있음을 확인합니다. 하나라도 달라지면 중단합니다.
- 격리 PostgreSQL 17에서 현행 운영 스키마와 up → down, 기존 행 불변·회사 격리·권한을 재검증합니다.

## 적용 뒤 읽기 검증

- 기존 상품행의 두 마감 열 모두 NULL, 기존 상품·주문·행사행 수 및 가격·세금 불변.
- 한쪽 마감 열만 채우는 입력은 쌍 제약으로 거부, `anon`/`authenticated` 실행 금지·`service_role`만 허용.
- 기능 OFF. CX-123 적용 여부는 별도 승인과 확인을 거칩니다.

## 되돌리기 제한

두 마감 열에 값이 있거나 CX-123 소비 함수·잔량 함수 의존 객체가 있으면 복구 SQL은 중단합니다. 다른 의존 객체가 있어도 PostgreSQL의 RESTRICT 실패로 트랜잭션 전체가 취소됩니다. 실제 주문·상품 데이터를 자동 삭제하지 않습니다.

## PG17 근거

원본 D4 시험은 NULL 기본값·쌍 제약·취소 주문 제외·회사 격리·권한을 검증합니다. R17 폐기형 PG17 순차 시험은 WO-03 → D4 → CX-123 적용과 CX-123 → D4 역순 복구, 기존 상품행 불변을 확인합니다.
