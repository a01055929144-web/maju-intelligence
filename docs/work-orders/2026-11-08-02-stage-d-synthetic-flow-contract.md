# 02 Stage D 주문→배송 합성 흐름 계약

상태: **순수 합성 로직만 · 실제 자동 배차 OFF · 운영 DB 쓰기 없음**

## 흐름

1. 09 주문 DTO의 `customerId`, `deliveryDate`, `orderIds`, `orderRevisions`, 배송지 snapshot을 읽는다.
   `buildOrderRouteConsumer`가 검증한 `companyId`와 `deliveryDate` 범위도 함께 전달하며 합성 흐름에서 다시 일치 확인한다.
2. 기존 정류장에 없는 주문은 코스에 자동 추가하지 않고 `unassigned`로 분리한다.
3. 기존 정류장만 주문 묶음과 연결하며 수동 순서·기사·차량을 그대로 유지한다.
4. 배송지 snapshot이 다르면 `destination_mismatch`로 차단한다.
5. 명시적 완료 이벤트 ID, `completedAt`, 정확히 일치하는 `orderIds`가 있을 때만 완료 이력을 만든다.

완료 이벤트의 빈 주문 ID나 중복 주문 ID는 입력 오류로 거부하며 조용히 제거하지 않는다.

주문 상태 문자열이나 거래처 메모로 완료를 추정하지 않는다. 취소로 주문 후보가 0건이 되어도 기존 수동 정류장을 삭제하지 않는다.

새 Stage D 주문 adapter만 보면 `store_orders` 행이 0건일 때 후보·미배정·신규 정류장·완료 이력은 모두 0건이며, 이미 입력된 수동 정류장만 그대로 유지한다.

이 보장은 기존 TMS 전체에는 아직 적용되지 않는다. 현재 `getTodayRoutePlan()`은 `normalized_customers`를 원장 순서대로 정류장 후보로 만들기 때문에 거래처 생성만으로 기존 코스·기사 화면에 후보가 나타날 수 있다. 주문 0건 거래처를 기존 TMS에서도 제외하는 조건은 **미해결 위험**이며, 이번 문서 변경은 해당 런타임을 수정하거나 자동 배차를 연결하지 않는다.

## 01 지도 소비 계약

지도 소비자는 정류장별로 다음 값을 받는다.

- `customerId`, `deliveryDate`
- 안정 정렬된 `orderIds`, 주문별 `orderRevisions`
- 배송지 `conflict` (`destination_mismatch`)
- 기존 `driverId`, `vehicleId`
- 완료된 경우 `completionEventId`, `completedAt`, 완료 이벤트의 `orderIds`

01 지도 코드는 이번 범위에서 변경하지 않는다.

## 합성 검증

- 주문 후보 없음·취소 후에도 수동 정류장 유지
- 새 Stage D 주문 adapter에 주문 행이 0건이면 adapter 기반 배송 작업 0건
- 기존 `getTodayRoutePlan()`의 거래처 원장 기반 후보 생성은 별도 회귀·승인 필요
- 신규 주문 거래처는 미배정으로 남고 자동 코스 생성 금지
- 복수 주문을 기존 정류장 하나에 안정적으로 연결
- 배송지 충돌 표시와 완료 차단
- 다른 회사, 미배정, 주문 ID 불일치 완료 이벤트 거부
- 명시적 완료 이벤트만 기사·차량과 함께 이력으로 변환

배송지 snapshot SQL 운영 적용과 실제 주문 자동 배차는 별도 승인 전까지 금지한다.
