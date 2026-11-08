# 04 Stage E 입고 → 매입전표·재고·매입처원장 읽기 조사

상태: **읽기 조사 완료 · 구현 증거 아님 · 03 생산자 계약 대기**
기준: `main` ebf61b1, 03 Draft PR #384와 09 Draft PR #410의 격리 SQL/승인 문서. 운영 DB 조회·쓰기와 SQL 실행은 하지 않았다.

## 결론

재고·원장 엔진은 새로 만들 필요가 없다. 기존 ERP에서 확정 매입전표 하나가 이미 아래 결과를 만든다.

1. `business_documents(document_type='purchase')`와 `business_document_lines`
2. `confirm_business_document`가 append-only `partner_ledger_entries(entry_type='purchase')` 생성
3. 같은 전표 상태 변경 trigger가 `apply_inventory_for_document` 실행
4. 확정 매입처 상품 매핑과 단위 환산을 통과한 행만 `inventory_movements(movement_type='purchase_in')` 및 `inventory_balances`에 반영
5. 전표 취소·revision은 `inventory_document_positions`의 목표 수량과 차이만 기록해 재고를 되돌리거나 보정

따라서 Stage E의 04 범위는 기존 엔진 앞에 **입고 정본을 확정 매입전표로 한 번만 변환하는 생산자 경계**를 제공하는 것이다. 판매관리의 매입가 업로드와 `purchase_receipt_lines`는 가격 관측 이력이며 입고·채무 정본이 아니므로 이 경계에 사용하지 않는다.

## 그대로 재사용할 운영 적용 구조

| 책임 | 기존 구조 | 04 연결 시 의미 |
| --- | --- | --- |
| 매입전표 헤더·행 | `business_documents`, `business_document_lines` | 입고 스냅샷을 `purchase` 전표 초안으로 복사 |
| 전표 저장 | `save_business_document` | 전표 행 합계·과세·회사/매입처 관계 검증 |
| 확정·매입처원장 | `confirm_business_document` | 확정과 `purchase` 원장 항목을 같은 함수에서 처리 |
| 상품 해석 | `inventory_resolve_document_lines` | `supplier_product_matches.match_status='confirmed'`인 상품만 재고 상품으로 해석 |
| 단위 환산 | `product_unit_conversions` | confirmed 환산 또는 환산표가 전혀 없을 때 판매 단위와 같은 단위의 1:1만 허용 |
| 재고 반영 | `apply_inventory_for_document`, `inventory_post_movement` | `purchase_in` 이동·현재고·평균원가·재고금액 반영 |
| 재시도 | `inventory_movements(company_id,idempotency_key)`와 `inventory_document_positions` | 같은 전표의 중복 이동 방지, revision은 차이만 반영 |
| 취소·반품 | 기존 전표 취소와 `purchase_return` | append-only 원장과 재고 역방향 이동 재사용 |

## #384에서 재사용할 패턴과 재사용하지 않을 것

03 PR #384의 `create_sales_document_from_store_order`는 매출 전용 후보라 입고에 직접 호출하거나 복사하지 않는다. 다만 다음 패턴은 입고 생산자 계약에도 필요하다.

- `(company_id, source_id)` 기준 advisory lock과 원천 행 잠금
- `business_documents(company_id,source_type,source_key)`로 같은 원천의 기존 전표 재조회
- 원천 스냅샷 합계와 전표 합계 일치 확인
- 전표 생성·행 저장·확정·원장 결과를 하나의 DB 트랜잭션으로 처리
- `public/anon/authenticated` 차단, 승인 회사의 service-role 서버 경로만 호출

#384의 주문 상태 후보, 고객 스냅샷, 매출전표 `sale`, 주문 가격 규칙은 입고 계약에 사용하지 않는다.

## #384·#410 이후에도 남은 소유 결정 2가지

#410은 배송 완료 정본을 `delivered` 단일 상태와 `(company_id, completion_event_id, order_id, completed_revision)` 관계로 좁히고, #384는 주문 ID source key로 매출전표·원장을 한 번 생성하는 후보를 제공한다. 그러나 둘 다 아직 Draft이고 런타임 미연결이며, 다음 두 결정은 확정하지 않았다.

1. **입고 → 매입전표 호출 주체**: 04에 입고 완료 정본 자체가 없다. 가격 관측 이력인 `purchase_receipt_lines`가 아니라, 어떤 운영 입고 생산자가 어떤 완료 상태·revision·입고 ID를 잠그고 03 소유 매입전표 RPC를 호출할지 먼저 정해야 한다. 이 주체와 정본이 정해지기 전에는 매입전표·`purchase_in`을 만들지 않는다.
2. **배송 완료 → 매출전표·`sale_out` 호출 주체와 원자 경계**: #410의 `complete_store_order_delivery_09`가 직접 #384의 매출전표 RPC를 같은 DB 트랜잭션에서 호출할지, 서버 조정자가 완료 결과를 받은 뒤 재시도 가능한 별도 호출을 할지 03/09가 결정해야 한다. 확정 매출전표의 기존 inventory trigger가 `sale_out`을 만드는 구조이므로 04가 별도 `sale_out` RPC나 직접 INSERT를 추가하지 않는다. 별도 호출을 택하면 배송 완료만 성공하고 전표·원장·재고가 빠진 상태를 탐지·재시도하는 계약이 함께 필요하다.

이 두 결정 전에는 가상 fixture, 상태 추정, 운영 주문·입고 데이터로 Stage E 완료를 주장하지 않는다. #404는 계속 조사 문서이며 Stage E 구현 수는 **0/4**다.

## 실제 입고 완료 ID·revision → 매입전표 확정 최소 경계

입고 정본 생산자가 확정되면 04가 요구할 최소 입력은 `company_id`, 불변 `receipt_id`, `expected_receipt_revision`, 서버가 검증한 행위자다. 별도 임의 UUID로 중복을 숨기지 않고 `source_type='purchase_receipt'`, `source_key='purchase_receipt:' || receipt_id`처럼 입고 ID에서 결정되는 키를 사용해야 한다. 정확한 문자열은 03 승인 계약에서 확정한다.

소유 RPC 하나가 같은 트랜잭션에서 다음 순서를 모두 수행해야 한다.

1. `(company_id, receipt_id)` 입고 행과 입고 줄을 잠그고 완료 상태·revision·취소/반품 아님을 검증한다.
2. 같은 source key의 기존 전표가 있으면 입력 revision과 전표 출처를 다시 검증한 뒤 같은 전표 결과를 반환한다. revision 불일치나 같은 키의 다른 입력은 충돌로 전체 거부한다.
3. 입고 줄의 매입처·상품·단위·수량·단가·공급가·세액 스냅샷만 `purchase` 전표와 줄로 복사한다. 현재 상품 원가로 재가격화하지 않는다.
4. 모든 줄이 확정 매입처 상품 매핑과 확정 환산(또는 허용된 동일 단위 1:1)을 통과하는지 먼저 확인한다. 한 줄이라도 `unmapped`, `no_conversion`, `no_product`이면 전표 확정 전에 전체 롤백한다.
5. 기존 전표 저장·확정을 실행한다. 확정 trigger가 `purchase_in`, 현재고·평균원가를 만들고 `confirm_business_document`가 매입처원장을 만든 결과까지 같은 트랜잭션에서 확인한다.
6. 응답에는 receipt ID·revision, 전표 ID·revision, 원장 항목 ID와 줄별 재고 반영 결과를 돌려 이후 재시도가 같은 결과인지 확인할 수 있게 한다.

입고 완료 정본·상태 전환 주체가 아직 없으므로 위 항목은 구현 계약이 아니라 최소 착수 경계다.

## #384의 기존 `sale_out` 재사용 조건

#384가 새 재고 함수를 만들지 않고 기존 확정 전표 trigger를 재사용하려면 아래 조건을 매출전표 확정 **전**에 모두 검증해야 한다.

- #410의 회사+주문+완료 이벤트 관계, `completed_revision`, 현재 `delivered` 상태가 모두 일치하고 잠겨 있어야 한다.
- 주문 줄의 `product_id`가 같은 회사의 `product_catalog_id`로 전표 줄에 보존되고, 시가·빈 단가·0줄·합계 불일치가 없어야 한다.
- 재고 추적 대상 줄마다 확정 단위 환산이 있거나, 환산표가 전혀 없고 주문 단위가 상품 판매 단위와 같은 1:1 조건이어야 한다.
- `inventory_resolve_document_lines` 결과가 모든 추적 대상 줄에서 `ok`인지 확인해야 한다. 기존 `apply_inventory_for_document`는 해석 실패 줄을 자동 거부하지 않고 제외하므로 이 사전 검증 없이는 부분 `sale_out`이 생길 수 있다.
- 매출전표 생성·행 저장·확정·거래처원장과 trigger의 `sale_out` 결과 확인이 한 트랜잭션이어야 한다. #410 완료와 별도 트랜잭션이면 완료 성공/전표 실패를 source key로 탐지·재시도하는 서버 계약이 필수다.
- 같은 주문 재시도는 `store_order:<order_id>`의 기존 전표와 기존 inventory position을 반환해야 하며, 04가 별도 `sale_out` RPC나 재고 직접 INSERT를 호출하지 않는다.

## 정확한 차단점

| 차단점 | 현재 상태 | 계약 확정 전 금지 |
| --- | --- | --- |
| 입고 정본 | 04에 발주/입고 완료를 나타내는 단일 운영 상태·revision·취소 상태가 확정되지 않음 | 매입가 업로드를 입고로 간주 |
| 원천 ID | 가격 이력 행 ID와 ERP 입고 ID의 의미가 다름 | `purchase_receipt_lines` ID를 전표 source ID로 자동 사용 |
| 원자 진입점 | 앱의 전표 저장과 확정 호출은 분리되어 있음 | 두 호출을 이어 붙여 부분 초안·부분 원장 허용 |
| 상품 연결 | 매입전표 재고 해석은 확정 `supplier_product_id` 매핑이 필요 | 품목명 추측이나 auto/후보 매핑으로 재고 이동 |
| 환산 | 확정 환산이 없으면 일부 단위만 1:1 인정 | BOX→EA 같은 미확정 환산을 수량 1로 처리 |
| 금액 원천 | 재고 금액은 전표 `supply_amount`, 매입처 채무는 전표 합계 사용 | 최신 상품 원가로 입고 스냅샷 재가격화 |
| 멱등 | 입고 source key 형식과 revision 충돌 규칙 미확정 | 새 UUID로 재시도해 중복 전표 생성 |
| 취소·반품 | 기존 ERP 엔진은 있으나 입고 상태와 전표 취소/반품 전환 주체 미확정 | 원장·재고 행 직접 삭제·수정 |
| 기능 제어 | 입고 Stage E 회사별 플래그·서버 호출 위치 미확정 | 대표 승인 없이 운영 호출·기능 ON |

## 03에 필요한 확정 계약

03이 다음을 확정하기 전에는 04 런타임·SQL·fixture 구현을 시작하지 않는다.

1. 입고 완료/취소/반품의 단일 상태와 상태 전환 소유자
2. 입고 원천 ID·revision과 `source_type/source_key` 형식
3. 같은 입고 재시도와 수정 revision의 반환/409 규칙
4. 매입전표 생성·저장·확정·매입처원장·재고 trigger를 한 트랜잭션으로 묶는 소유 RPC
5. 미연결 상품·미확정 환산·0수량·합계 불일치가 하나라도 있을 때 전체 거부 규칙
6. service-role 권한, 회사별 기능 플래그 기본 OFF, 취소·반품·실패 복구 절차

계약이 병합되면 폐기 가능한 PostgreSQL 17에서 회사 격리, 동시 재시도, 중간 실패 롤백, 매입처원장·재고 합계, 취소·반품을 실제 기존 함수로 검증한다. 합성 객체 값만 확인하는 테스트는 구현 증거로 세지 않는다.

## 운영 체크

- Stage A 대표 파일 확정값은 변경하지 않았고 운영 실파일 저장을 실행하지 않았다.
- 운영 DB·SQL·플래그·배포 변경 없음.
- 03 전표/원장/재고 파일과 09 문서/주문 파일 수정 없음.
- PR #404의 이전 가상 타입·fixture·테스트는 구현 증거가 아니므로 제거했다.
