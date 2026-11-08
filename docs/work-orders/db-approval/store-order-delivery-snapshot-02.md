# store_orders 배송지 snapshot 승인 초안

상태: **미승인·미적용**. 이 문서는 SQL 설계 검토용이며 migration이나 운영 DB 변경을 포함하지 않는다.

- SQL 초안: [`20261108-stage-d-delivery-snapshot-02.sql`](../../sql-drafts/20261108-stage-d-delivery-snapshot-02.sql)
- Down 초안: [`20261108-stage-d-delivery-snapshot-02.down.sql`](../../sql-drafts/20261108-stage-d-delivery-snapshot-02.down.sql)
- PG17 검증: [`20261108-stage-d-delivery-snapshot-02.pg17.test.sql`](../../sql-drafts/20261108-stage-d-delivery-snapshot-02.pg17.test.sql)

현재 `store_orders`에는 아래 snapshot 컬럼이 하나도 없다. 따라서 승인된 컬럼 추가와 주문 생성 시 기록, 기존 주문의 확인·backfill이 끝나기 전까지 실제 `store_orders`에서 만들어지는 배차 후보는 **0건**이다. 활성 주문은 사라지지 않고 `missing_delivery_snapshot` 차단 목록에 남아 미배정·주소 확인 화면에서 사용할 수 있다.

## 필요한 컬럼

| 컬럼 | 형식 | 주문 생성 시 값 | 필수 여부 |
| --- | --- | --- | --- |
| `delivery_customer_name_snapshot` | `text` | 거래처명 | 필수 |
| `delivery_address_snapshot` | `text` | 기본 주소 | 필수 |
| `delivery_address_detail_snapshot` | `text` | 상세 주소 | 선택 |
| `delivery_recipient_phone_snapshot` | `text` | 배송 연락처 | 선택 |
| `delivery_loading_position_snapshot` | `text` | 적재 위치 | 선택 |

## 승인 조건

| 항목 | 상태 |
| --- | --- |
| 09 주문 생성 RPC가 snapshot을 같은 transaction에서 기록 | 승인 필요 |
| 기존 주문 backfill 기준과 주소 확인 담당자 | 승인 필요 |
| snapshot 없는 기존 주문은 자동 배차 금지 | 확정 |
| 거래처 마스터 변경 시 기존 주문 snapshot 불변 | 확정 |
| 운영 SQL 적용·자동 배차·플래그 ON | 이번 PR 제외 |

승인 전 02 adapter는 거래처 현재 주소를 대신 사용하지 않으며 필수 snapshot이 없는 주문을 배차 후보에서 제외한다.

## SQL 초안 동작

- 기존 주문은 snapshot이 모두 `null`인 상태로 보존하고 `missing_delivery_snapshot` 차단 대상으로 남긴다.
- 거래처명과 기본 주소는 둘 다 있어야 하며 부분 snapshot은 저장하지 않는다.
- 완성된 snapshot은 거래처 마스터가 바뀌어도 수정할 수 없다.
- 후보 조회 인덱스는 회사·배송일을 먼저 구분하고 `submitted`, `received`, `in_delivery`만 포함한다. `cancelled`, `delivered`는 제외한다.
- 운영 적용 전 기존 주문의 주소 확인·backfill 담당자와 감사 기록 방식을 별도 승인한다.
- 회사 삭제 시 기존 `store_orders`의 회사 FK `on delete cascade`를 따라 snapshot도 함께 삭제되며 다른 회사 주문은 유지한다.
- Down은 snapshot 칸·제약·불변 trigger·부분 인덱스만 제거하고 기존 주문 행은 삭제하지 않는다.
- 자동 스키마 목록은 기존 테이블 상태와 분리해 다섯 칸을 `초안 추가:`로 표시한다.

## 09 입력 계약

09 주문 생성 RPC는 새 주문을 저장하는 같은 transaction에서 아래 값을 `store_orders`에 기록해야 한다. 02는 09 RPC나 화면을 수정하지 않는다.

| 입력 | 원천 | 규칙 |
| --- | --- | --- |
| `deliveryCustomerNameSnapshot` | 주문 확인 시 거래처명 | 공백 불가 |
| `deliveryAddressSnapshot` | 주문 확인 시 기본 주소 | 공백 불가 |
| `deliveryAddressDetailSnapshot` | 주문자가 확인한 상세 주소 | 선택 |
| `deliveryRecipientPhoneSnapshot` | 주문자가 확인한 배송 연락처 | 선택 |
| `deliveryLoadingPositionSnapshot` | 주문자가 확인한 적재 위치 | 선택 |

- 주문 생성 후 거래처 마스터 변경값으로 snapshot을 덮어쓰지 않는다.
- 기존 주문은 현재 거래처 주소로 자동 backfill하지 않는다. 확인된 주문만 전체 snapshot을 한 번에 기록한다.
- 09는 주문 저장 실패 시 snapshot도 함께 rollback하고, snapshot 저장 실패 시 주문만 남기지 않는다.
