# Stage F 퍼널·오류 큐 원천 ID 연결표

작성일: 2026-11-09
소유: 06 지표
중앙 상태: **1/4 유지**
기능 플래그: **OFF**

## 결론

문서 발송·열람·수락과 첫 주문·재주문까지는 원천 ID 연결 경로가 존재하지만, 운영 발송과 실제 첫 주문 행으로 재계산을 검증하지 않았다. 배송 완료 원천인 #410과 주문 매출 원천인 #384는 모두 Draft이며 운영 DB 미적용·호출 미연결 상태다. 따라서 현재 Stage F 운영 지표를 생성하지 않으며, 배송 완료율과 주문 매출은 `0`으로 집계하지 않고 `unavailable`로 반환한다.

운영 행이 없는 상태에서 fixture, 주문 상태 추정, 메모, 결과 JSON으로 수치를 만들지 않는다. Stage D와 E가 아래 관계를 실제 운영에 기록하고 검증하기 전까지 퍼널 확장과 오류 큐 플래그를 켜지 않는다.

## 원천 ID 연결표

| 구간 | 기준 원천 | 다음 원천과의 명시적 연결 | 현재 판정 |
| --- | --- | --- | --- |
| 문서 발송·열람 | `pricing_document_sends.id` (`send_id`) | 같은 회사의 `pricing_document_acceptance_requests.send_id` | 원천 ID 경로 존재, 실제 운영 재계산 미검증 |
| 문서 수락 | `pricing_document_acceptance_requests.id` (`acceptance_request_id`) | 같은 회사·고객·문서 버전의 `storefront_links.acceptance_request_id` | 원천 ID 경로 존재, 실제 운영 재계산 미검증 |
| 첫 주문·재주문 | `storefront_links.id` (`link_id`) → `store_orders.id` (`order_id`) | 같은 회사·고객·문서 버전의 명시적 `link_id` | 원천 ID 경로 존재, 실제 첫 주문 0건·운영 재계산 미검증 |
| 배송 완료 (#410) | `store_order_delivery_completions_09.(company_id, completion_event_id)` | `store_order_delivery_completion_orders_09`의 `(company_id, completion_event_id, order_id)`, `pre_revision`, `completed_revision` | Draft, 운영 미적용. `unavailable` |
| 매출 전표 (#384) | `business_documents.id` (`sales_document_id`) | `source_type='order'`, `source_id=order_id`, `source_key='store_order:' || order_id` | Draft, 운영 미적용. `unavailable` |
| 매출 원장 (#384) | `partner_ledger_entries.source_document_id` | 같은 회사의 `business_documents.id`; 주문은 전표의 `source_id`로 역연결 | Draft, 운영 미적용. `unavailable` |

모든 조인은 `company_id`를 포함한다. 고객·문서 버전이 있는 앞 구간에서는 두 값도 일치해야 한다. 배송 완료는 `store_orders.status='delivered'`만으로 인정하지 않고 완료 관계 행을 요구한다. 매출은 주문 합계나 전표 Draft를 매출로 간주하지 않고, 주문 원천 전표와 그 전표의 확정·취소·반품 원장 관계로 재계산한다.

## 오류 큐 원천

| 오류 코드 | 원천 ID와 판정 조건 | 활성화 전제 |
| --- | --- | --- |
| `acceptance_without_send` | 수락의 `send_id`가 같은 회사 발송 ID와 연결되지 않음 | 기존 운영 원천 |
| `link_without_acceptance` | 링크의 `acceptance_request_id`가 없거나 회사·고객·문서 버전 불일치 | 기존 운영 원천 |
| `order_without_link` | 주문의 `link_id`가 없거나 회사·고객·문서 버전 불일치 | 기존 운영 원천 |
| `completion_without_order` | 완료 관계의 `order_id`가 같은 회사 주문과 연결되지 않음 | #410 운영 적용 및 실제 행 검증 |
| `order_without_completion` | 배송 대상 주문에 완료 관계가 없음 | D의 대상 범위·지연 정책 확정 후에만 사용 |
| `completion_revision_mismatch` | `completed_revision != pre_revision + 1` 또는 주문 revision과 불일치 | #410 운영 적용 및 실제 행 검증 |
| `order_without_sales_document` | 매출 대상 완료 주문에 `source_type='order'` 전표가 없음 | E 생성 시점 정책 확정 후에만 사용 |
| `duplicate_order_sales_document` | 같은 회사·주문 `source_key`의 원매출 전표가 둘 이상 | #384 운영 적용 및 실제 행 검증 |
| `sales_document_without_ledger` | 확정 전표에 원장 행이 없거나 취소·반품 reversal이 수렴하지 않음 | #384 운영 적용 및 실제 행 검증 |

Draft 미적용이나 운영 표본 부재 자체는 오류 큐 행으로 만들지 않는다. 이 경우 큐 전체를 비활성화하고 원천 상태를 `unavailable`로 표시한다.

## 플래그 ON 조건

다음을 모두 충족해야 한다.

1. Stage D: #410의 세 테이블과 완료 RPC가 승인·운영 적용되고, API가 실제 `completion_event_id ↔ order_id` 관계와 revision을 같은 트랜잭션으로 기록한다.
2. Stage E: #384의 주문→매출 전표 함수가 승인·운영 적용되고, 실제 주문 ID로 전표 생성·확정 및 원장 게시가 연결된다.
3. 06 읽기 모델이 위 원천을 회사 범위로 읽고, 원천 미적용과 실제 0건을 구분한다.
4. 동일 원천 스냅샷을 반복 재계산했을 때 퍼널·오류 큐 결과가 같다는 검증이 통과한다.
5. 운영에서 D/E 실제 행을 각각 확인하고, 원천 ID로 주문까지 역추적할 수 있다.

## 중앙 F 완료 조건

- [x] 기초 리포트 화면
- [ ] 퍼널 원천 ID 연결: D/E 운영 원천까지 읽기 모델에 연결
- [ ] 관리자 오류 큐: 위 오류 코드를 원천 ID와 함께 회사별로 제공
- [ ] 지표 재계산 검증: 동일 원천의 반복 계산·취소·반품까지 결정적으로 검증

즉, 이 문서는 연결 계약만 고정한다. #410과 #384의 운영 적용 및 실제 행 검증 전에는 중앙 Stage F를 **1/4에서 올리지 않는다**.
