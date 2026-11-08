# store_orders 배송지 snapshot 승인 초안

상태: **미승인·미적용**. 이 문서는 SQL 설계 검토용이며 migration이나 운영 DB 변경을 포함하지 않는다.

현재 `store_orders`에는 아래 snapshot 컬럼이 하나도 없다. 따라서 승인된 컬럼 추가와 주문 생성 시 기록, 기존 주문의 확인·backfill이 끝나기 전까지 실제 `store_orders`에서 만들어지는 배차 후보는 **0건**이다.

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
