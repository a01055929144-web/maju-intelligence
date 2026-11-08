# 02 Stage D 주문→배송 합성 흐름 계약

상태: **순수 합성 로직만 · 실제 자동 배차 OFF · 운영 DB 쓰기 없음**

## 흐름

1. 09 주문 DTO의 `customerId`, `deliveryDate`, `orderIds`, `orderRevisions`, 배송지 snapshot을 읽는다.
2. 기존 정류장에 없는 주문은 코스에 자동 추가하지 않고 `unassigned`로 분리한다.
3. 기존 정류장만 주문 묶음과 연결하며 수동 순서·기사·차량을 그대로 유지한다.
4. 배송지 snapshot이 다르면 `destination_mismatch`로 차단한다.
5. 명시적 완료 이벤트 ID, `completedAt`, 정확히 일치하는 `orderIds`가 있을 때만 완료 이력을 만든다.

주문 상태 문자열이나 거래처 메모로 완료를 추정하지 않는다. 취소로 주문 후보가 0건이 되어도 기존 수동 정류장을 삭제하지 않는다.

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
- 신규 주문 거래처는 미배정으로 남고 자동 코스 생성 금지
- 복수 주문을 기존 정류장 하나에 안정적으로 연결
- 배송지 충돌 표시와 완료 차단
- 다른 회사, 미배정, 주문 ID 불일치 완료 이벤트 거부
- 명시적 완료 이벤트만 기사·차량과 함께 이력으로 변환

배송지 snapshot SQL 운영 적용과 실제 주문 자동 배차는 별도 승인 전까지 금지한다.
