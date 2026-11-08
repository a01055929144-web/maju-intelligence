# Stage F 원천 ID 재계산 최소 검증 계획

작성일: 2026-11-09
소유: 06 지표
중앙 상태: **1/4 유지**
기능 플래그: **OFF**

## 적용 시점과 금지선

이 계획은 Stage D/E가 운영에 실제 연결된 뒤 실행한다. #410 배송 완료 관계와 #384 주문 매출 관계가 Draft이거나 운영 행이 없으면 실행 결과를 운영 지표로 해석하지 않는다. 현재 배송·매출 상태는 `unavailable`이며, fixture 결과로 운영 수치·전환율·매출을 만들지 않는다.

검증 입력은 아래 ID를 모두 보존해야 한다.

- `company_id`
- `order_id`
- `completion_event_id`
- `sales_document_id` (`business_documents.id`)
- `ledger_entry_id`와 `source_document_id`

모든 조회와 비교는 `company_id` 범위 안에서 수행한다. 주문 상태, 메모, 결과 JSON만으로 배송 완료나 매출을 추정하지 않는다.

## 공통 실행 절차

각 사례는 승인된 격리 환경에서 다음 순서로 검증한다.

1. 위 원천 ID와 원천 행을 기록한다.
2. 같은 원천 스냅샷으로 Stage F 재계산을 두 번 실행한다.
3. 두 결과의 집합, 상태, 원천 ID가 완전히 같은지 확인한다.
4. 결과 행에서 `order_id`를 시작점으로 완료 이벤트·전표·원장까지 왕복 추적한다.
5. 다른 회사의 동일 형태 행이 결과에 섞이지 않는지 확인한다.

## 최소 검증 사례

| 사례 | 필수 원천 관계 | 기대 판정 | 오류 큐 기대 |
| --- | --- | --- | --- |
| 정상 | 같은 회사의 `order_id ↔ completion_event_id`; `business_documents.source_type='order'`; `source_id=order_id`; `source_key='store_order:' || order_id`; 확정 전표의 `sales_document_id ↔ partner_ledger_entries.source_document_id` | 배송과 매출 원천을 모두 `available`로 읽고 모든 결과가 네 핵심 ID로 역추적됨 | 없음 |
| 취소 | 정상 관계에 더해 원매출 전표 취소와 같은 `source_document_id`의 reversal 원장 행 | 원매출과 취소를 모두 보존하고 원장 순액이 원천 행의 합과 일치함. 취소 전 수치를 잔존시키지 않음 | reversal 누락·중복 때만 `sales_document_without_ledger` 계열 |
| 반품 | 원매출 전표와 반품 전표가 같은 `order_id`를 `source_id`로 보존하고, 반품 전표의 `original_document_id=sales_document_id`; 각 전표의 원장 행 존재 | 원매출·반품을 별도 원천으로 보존하고 주문 기준 순액이 해당 원장 행 합과 일치함 | 원전표 연결 또는 반품 원장 누락 때 오류 |
| 미연결 | 주문은 있으나 완료 관계 또는 주문 원천 전표 중 하나가 없음 | 누락 구간을 수치 `0`으로 대체하지 않음. 적용 정책이 확정된 원천만 오류로 분류하고, 미적용 원천은 `unavailable` 유지 | `order_without_completion` 또는 `order_without_sales_document`; 정책 미확정·원천 미적용이면 큐 비활성 |

## 사례별 필수 단언

### 정상

- 완료 관계의 `completed_revision = pre_revision + 1`이다.
- 한 `order_id`가 둘 이상의 완료 이벤트에 연결되지 않는다.
- 원매출 전표는 회사·주문 `source_key`당 하나다.
- 확정 전표의 원장 행은 해당 `sales_document_id`를 `source_document_id`로 가진다.

### 취소

- 원전표와 기존 원장 행을 삭제하거나 덮어쓰지 않는다.
- 취소 reversal은 원전표의 `sales_document_id`로 추적된다.
- 동일 입력 재계산에서 취소 반영 전 값이 다시 나타나지 않는다.

### 반품

- 반품 전표는 `original_document_id`로 원매출 전표를 가리킨다.
- 원매출과 반품 모두 같은 `company_id`, `source_type='order'`, `source_id=order_id`를 보존한다.
- 반품 또는 반품 취소가 있으면 해당 원장 행까지 포함한 합으로만 주문 순액을 판정한다.

### 미연결

- D/E 원천 자체가 운영 미적용이면 오류 건수를 만들지 않고 `unavailable`로 반환한다.
- 원천 적용과 대상 정책이 확인된 뒤 관계가 누락된 경우에만 원천 ID와 함께 오류 큐에 넣는다.
- 다른 회사의 동명·동일 금액·동일 날짜 행을 후보로 연결하지 않는다.

## 완료 증거

Stage F 재계산 검증 항목은 다음 증거가 모두 있을 때만 완료 처리한다.

- D/E 운영 적용 버전과 기능 플래그 승인 기록
- 네 사례의 실제 원천 ID 목록과 회사 범위 조회 결과
- 동일 스냅샷 2회 재계산 결과가 같다는 자동 검증
- 취소·반품 후 원장 합과 Stage F 결과의 일치 검증
- 미연결 사례가 `0`이나 가짜 지표로 변환되지 않았다는 검증

이 증거가 없으면 중앙 Stage F는 **1/4**, 기능 플래그는 **OFF**, 배송·매출은 **`unavailable`**을 유지한다.
