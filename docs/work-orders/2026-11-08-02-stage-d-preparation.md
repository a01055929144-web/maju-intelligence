# 02 단계 D 주문 → 배송 준비 점검표

> 2026-11-08 · 최신 main c30ac7d 기준. 단계 C 주문 계약이 최종 병합되기 전에는 설계·테스트 준비만 한다. 운영 연결, 플래그 ON, 배포, 운영 DB 쓰기는 금지한다.

## 완료 목표

store_orders.id가 주문 확인 → 오늘 코스 → 기사 완료 → 배송 이력까지 같은 값으로 이어져야 한다. 기존 수동 코스, 기사·차량 배정, 지도, 사진·메시지 공유는 유지한다.

## 읽기 점검표

| 구간 | 현재 키 | 주문 ID 상태 | 판정 |
| --- | --- | --- | --- |
| 매장 주문 확인 app/api/storefront/route.ts | store_orders.id, customer_id, delivery_date | 주문 내역 응답에 존재 | 시작점 있음 |
| 오늘 코스 getTodayRoutePlan | normalized_customers.id | 읽지 않음 | 단절 |
| 코스 확정 route_plan_confirmations | 날짜·기사명·customer_ids | 저장하지 않음 | 단절 |
| 기사 화면 app/mobile/today/page.tsx | 선택 customerId | 전달하지 않음 | 단절 |
| 완료 저장 MobileDeliveryProofPanel | customerId, note/attachment/message | 주문 ID·revision 없음 | 단절 |
| 완료 조회 getDeliveryCompletionEvents | customer_notes.customer_id | 주문별 판별 불가 | 단절 |
| 배송 이력 DeliveryCompletionEvent | customerId | 복수 주문 추적 불가 | 단절 |

현재 D 완료 기준은 충족하지 않는다. 거래처 기준 완료는 가능하지만 어느 주문이 완료됐는지 증명할 수 없다.

## 09 생산자 선행 계약

02는 주문 상태 문자열을 해석하거나 store_orders를 직접 조회하지 않는다. 09가 배송 대상만 반환하는 아래 읽기 계약을 생산해야 한다.

~~~ts
type OrderDeliveryCandidate = {
  companyId: string;
  orderId: string;
  customerId: string;
  deliveryDate: string;
  orderRevision: number;
  destination: {
    customerName: string;
    address: string;
    addressDetail?: string;
    recipientPhone?: string;
    loadingPosition?: string;
  };
};
~~~

09가 함께 확정할 항목:

- 배송 대상으로 읽을 주문 상태
- 배송일의 KST 업무일 의미와 변경 규칙
- 주문 시점 배송지 스냅샷의 정본
- orderRevision 증가 조건
- 완료 요청의 멱등 키, 증빙 참조와 delivered 전환 결과

## 02 최소 소비자 설계

Ponytail 원칙에 따라 새 코스 엔진이나 주문별 정류장 테이블을 만들지 않는다.

1. 순수 Application 함수가 09 후보를 companyId + deliveryDate + customerId로 묶는다.
2. 기존 거래처 코스에 orderIds와 orderRevisions를 별도 읽기 모델로 붙인다.
3. 주문 없는 수동 정류장은 orderIds 빈 배열로 유지한다.
4. 같은 묶음의 배송지 스냅샷이 다르면 자동 병합하지 않고 확인 필요로 반환한다.
5. 완료 UI는 사진·메시지 저장 뒤 09 완료 Use Case에 정확한 orderIds와 멱등 키를 전달한다.
6. 이력은 완료 당시 주문 ID를 읽어 표시하되 기존 거래처·기사·차량 기준 화면을 유지한다.

권장 응답 추가 형태:

~~~ts
type RouteStopOrderRead = {
  customerId: string;
  deliveryDate: string;
  orderIds: string[];
  orderRevisions: Record<string, number>;
  destination: OrderDeliveryCandidate["destination"];
  conflict?: "destination_mismatch" | "order_changed" | "order_cancelled";
};
~~~

기존 RoutePlanStop과 lib/store.ts를 먼저 확장하지 않고 orderRefsByCustomerId 같은 병렬 읽기 결과로 시작한다.

## 소유 파일과 예상 최소 변경

09 생산자 PR 병합 전에는 아래 파일을 만들거나 수정하지 않는다.

### 02 소유

- 신규 application/delivery/order-route-consumer.ts
- 신규 tests/order-route-consumer.test.ts
- 후속 연결: app/api/routes/today/route.ts
- 후속 연결: app/mobile/today/page.tsx
- 후속 연결: components/mobile-delivery-proof-panel.tsx
- 후속 연결: components/delivery-history-view.tsx

### 수정 금지

- 09: app/api/storefront/route.ts, 주문 DTO·상태·RPC
- 01: 지도 워크스페이스와 지도 마커
- 공용 잠금: lib/store.ts, 백엔드 계약, 중앙 DB 승인표
- 기존 route_plan_confirmations 스키마

## 최소 소비자 테스트

1. 같은 매장·날짜 주문 2건 → 정류장 1개, 주문 ID 2개.
2. 입력 순서가 달라도 주문 ID 정렬과 결과가 동일.
3. 주문 1건 취소 → 해당 ID만 제외하고 정류장 유지.
4. 자동 주문이 모두 없어져도 기존 수동 정류장은 유지.
5. 다른 배송일은 별도 묶음.
6. 같은 묶음에서 배송지 불일치 → 자동 병합 차단.
7. 다른 회사 주문 후보 → 소비 전 거부.
8. 완료 재시도 → 같은 멱등 키로 같은 주문 ID 집합 한 번만 요청.
9. 코스 → 완료 → 이력까지 주문 ID 집합 보존.

## 진행 게이트

| 게이트 | 상태 |
| --- | --- |
| #283 최소 읽기 계약 | main 병합 완료 |
| 단절 점검·소비자 설계 | 이 문서로 완료 |
| 09 주문 DTO 생산자 PR | 없음 · 차단 |
| 09 완료 멱등 Use Case/SQL 승인 | 없음 · 차단 |
| 02 순수 소비자 함수·테스트 | 생산자 병합 후 시작 |
| 코스·기사·이력 연결 | A/B/C 완료 판정 후 |
| 운영 플래그·배포 | 금지 |

