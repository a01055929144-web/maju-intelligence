# 02 주문 → TMS 최소 읽기 계약 초안

> 2026-11-06 · 설계 전용. 코드·SQL·운영 DB·기능 플래그를 변경하지 않는다. 09가 주문 상태·주문 ID·배송일 계약을 확정하기 전에는 구현하지 않는다.

## 목적과 경계

- 기존 권역, 오늘 코스, 기사 모바일, 배송 완료·히스토리를 그대로 쓴다.
- 주문 도메인(09)이 배송 대상 주문을 판정하고, TMS(02)는 결과를 읽어 기존 코스 정류장에 연결한다.
- 02는 `store_orders`를 직접 수정하거나 주문 상태를 바꾸지 않는다.
- 수동으로 만든 기존 코스는 주문이 없어도 유지한다.

## 09가 제공할 최소 읽기 DTO

상태 문자열을 02가 해석하지 않는다. 09가 배송 대상으로 판정한 주문만 반환한다.

```ts
type OrderDeliveryCandidate = {
  companyId: string;
  orderId: string;
  customerId: string;
  deliveryDate: string; // YYYY-MM-DD, KST 업무일
  orderRevision: number;
  destination: {
    customerName: string;
    address: string;
    addressDetail?: string;
    recipientPhone?: string;
    loadingPosition?: string;
  };
};
```

필수 조건:

1. `companyId`는 인증 범위와 같아야 한다.
2. `orderId`는 주문 정본의 안정된 ID다.
3. `deliveryDate`와 `destination`은 주문 확정 시점의 스냅샷이다. 이후 거래처 원장이 바뀌어도 과거 주문에는 소급하지 않는다.
4. 같은 주문을 반복 조회해도 값이 같아야 한다. 수정되면 `orderRevision`이 증가한다.
5. 취소되었거나 아직 배송 대상이 아닌 주문은 목록에서 제외한다. 어떤 주문 상태가 배송 대상인지는 09가 확정한다.

## 기존 코스에 붙이는 최소 형태

기본값은 **매장 1정류장 + 주문 ID 여러 개**다. 새 코스 엔진이나 주문별 정류장 테이블은 만들지 않는다.

```ts
type RouteStopOrderRead = {
  customerId: string;
  deliveryDate: string;
  orderIds: string[];
  orderRevisions: Record<string, number>;
  destination: OrderDeliveryCandidate["destination"];
};
```

- 묶음 키: `companyId + deliveryDate + customerId`.
- `orderIds`는 중복을 제거하고 안정적으로 정렬한다.
- 기존 `route_plan_confirmations.customer_ids`와 기사 배정은 그대로 쓴다.
- 코스 화면과 모바일 화면에는 주문 수만 보조 정보로 붙이고, 기존 지도·전화·적재 확인·완료 흐름은 바꾸지 않는다.
- 완료 저장이 어떤 주문을 `delivered`로 바꾸는지는 09의 멱등 Use Case가 담당한다. 02는 `orderIds`가 포함된 완료 요청만 전달한다.

## 사례별 처리

| 상황 | 처리 원칙 |
| --- | --- |
| 같은 매장·같은 배송일에 주문 여러 건 | 한 정류장으로 합치고 모든 `orderIds`를 연결한다. |
| 같은 매장이라도 배송일이 다름 | 날짜별 코스에 따로 포함한다. |
| 한 주문이 코스 확정 전에 취소됨 | 읽기 목록에서 빠진다. 같은 매장의 남은 주문이 없으면 자동 주문 정류장만 제외한다. 수동 정류장은 유지한다. |
| 한 주문만 취소되고 같은 매장의 다른 주문은 유효 | 정류장은 유지하고 취소 주문 ID만 제거한다. |
| 코스 확정 뒤 주문이 취소됨 | 조용히 완료 처리하지 않는다. `확인 필요`로 표시하고 관리자가 코스를 다시 확정할 때 반영한다. |
| 코스 확정 뒤 주문 수량·내용이 수정됨 | `orderRevision` 불일치를 `확인 필요`로 표시한다. 순서는 유지하고 재확정 전 자동 완료하지 않는다. |
| 같은 매장·같은 날인데 배송지 스냅샷이 다름 | 자동 병합하지 않고 09에 주소 정합성 확인을 요청한다. 잘못된 장소로 보내는 것보다 차단을 우선한다. |
| 주문 없이 관리자가 추가한 정류장 | 기존 수동 코스로 계속 노출한다. `orderIds`는 빈 배열이다. |
| 배송 일부만 완료 | 이번 최소 계약에서 처리하지 않는다. 09가 부분배송 상태와 주문 줄 단위 규칙을 확정한 뒤 확장한다. |
| 배송 완료 요청이 재시도됨 | 같은 완료 멱등 키와 `orderIds` 조합은 한 번만 반영한다. 주문 상태 변경 결과도 09가 멱등 보장한다. |

## 재사용 대상

- `getTodayRoutePlan`과 `route_plan_confirmations`의 거래처 순서
- 기존 권역·기사·차량 배정
- `MobileRouteList`, `MobileRouteActionPanel`, `MobileDeliveryProofPanel`
- `DeliveryCompletionEvent`와 배송 히스토리 달력

## 구현 전 09 확정 필요

1. 배송 대상 주문 상태와 상태 전이 주체
2. 배송지 스냅샷 저장 위치와 필수 필드
3. 주문 수정 시 `orderRevision` 증가 규칙
4. 완료 요청 입력값, 멱등 키와 `delivered` 전환 결과
5. 부분배송·반품·재배송의 주문 단위 규칙

위 다섯 항목이 확정되기 전에는 TMS 코드, 주문 테이블, 기존 코스 UI·DB, 운영 DB를 변경하지 않는다.
