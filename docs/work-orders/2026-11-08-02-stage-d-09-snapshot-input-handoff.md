# 02 → 09 Stage D 배송지 snapshot 입력 계약 인계

상태: **입력 계약 제안 · 기능 미연결 · 운영 SQL 미적용**

09는 주문 생성 RPC와 화면을 소유한다. 02는 아래 입력이 주문과 같은 transaction에서 `store_orders`에 저장된 뒤 읽기 DTO로만 사용한다.

## 새 주문 입력

| API 입력 | `store_orders` 칸 | 필수 | 규칙 |
| --- | --- | --- | --- |
| `deliveryCustomerNameSnapshot` | `delivery_customer_name_snapshot` | 예 | trim 후 빈 값 거부 |
| `deliveryAddressSnapshot` | `delivery_address_snapshot` | 예 | 주문자가 확인한 기본 주소, trim 후 빈 값 거부 |
| `deliveryAddressDetailSnapshot` | `delivery_address_detail_snapshot` | 아니요 | 빈 값은 `null` |
| `deliveryRecipientPhoneSnapshot` | `delivery_recipient_phone_snapshot` | 아니요 | 빈 값은 `null` |
| `deliveryLoadingPositionSnapshot` | `delivery_loading_position_snapshot` | 아니요 | 적재 위치/배송 완료 사진 위치, 빈 값은 `null` |

## 09 저장 조건

1. 서버가 인증된 회사와 주문의 `company_id`, `customer_id` 일치를 먼저 확인한다.
2. 주문 행과 다섯 snapshot 값은 같은 transaction에서 함께 저장하거나 모두 rollback한다.
3. idempotency fingerprint에 다섯 snapshot 값을 포함한다. 같은 키에 다른 주소·연락처·적재 위치가 오면 충돌로 거부한다.
4. 생성된 주문을 재조회할 때 거래처 마스터 현재 주소로 snapshot을 덮어쓰지 않는다.
5. 생성 후 주소를 고쳐야 하면 기존 주문을 조용히 수정하지 않는다. 주문 취소 후 재주문 또는 별도 승인된 정정 이력을 사용한다.
6. 02 배송 후보에는 `submitted`, `received`, `in_delivery`만 전달한다. `cancelled`, `delivered`는 전달하지 않는다.
7. 필수 snapshot이 없는 기존 주문은 삭제하지 않고 `missing_delivery_snapshot` 확인 필요 목록으로 전달한다.

권장 오류 계약은 `delivery_snapshot_required`와 `delivery_snapshot_idempotency_conflict`다. 이름은 09이 확정하되 필수값 누락과 멱등 충돌을 구분해야 한다.

## 09 인수 조건

- 주문 생성 성공/실패 원자성 테스트
- 같은 idempotency key의 동일 요청 재시도 테스트
- 같은 idempotency key의 다른 snapshot 충돌 테스트
- 다른 회사·거래처 snapshot 주입 차단 테스트
- 주문 후 거래처 마스터 주소 변경 시 기존 snapshot 불변 테스트
- 취소·완료 주문이 배송 후보에서 제외되는 테스트

## 아직 승인되지 않은 것

- SQL 초안의 운영 적용
- 기존 주문 자동 backfill
- 주소 확인·정정 화면 또는 RPC
- 실제 코스 자동 생성과 기사 배정
- 기능 플래그 ON

관련 승인 문서: [`store-order-delivery-snapshot-02.md`](db-approval/store-order-delivery-snapshot-02.md)
