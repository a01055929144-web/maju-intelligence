# 09 → 02 주문 완료·배송지 snapshot 생산자 조사

Ponytail: 사용함

기준: B #400 병합 main 44c4213 이후 추적된 저장소 구현. 운영 DB는 직접 조회/변경하지 않았다. C fixture 완료와 Stage D 런타임 연결 완료를 구분한다.

| 계약 | 확인한 기존 구현/SQL | 현재 차단점 |
| --- | --- | --- |
| 주문 생성 | app/api/storefront/route.ts PUT → place_store_order(7인자) 또는 place_store_member_order(10인자) | 배송지 5개 snapshot 입력/전달 없음 |
| 멱등성 | P2 SQL의 deliveryDate/memo/lines/orderId, 회원 SQL의 account/member/auth 식별자 fingerprint | 5개 snapshot이 fingerprint에 없음 |
| 주문 저장 | supabase/migrations/20261102114602_pricing_p2_store_ordering.sql 및 20261108141800_store_member_order.sql | store_orders INSERT에 배송지 snapshot 칸 없음 |
| 배송지 DDL | docs/sql-drafts/20261108-stage-d-delivery-snapshot-02.sql, down.sql, pg17.test.sql | 02 소유 초안. 칸/무결성/불변 trigger/후보 index만 추가하며 09 생성 RPC는 변경하지 않음 |
| 완료 상태 | store_orders.status는 submitted/received/in_delivery/delivered/cancelled 허용 | enum/check 존재는 완료 생산자 구현이 아님 |
| 완료 RPC/API | 추적된 09 주문 API·SQL·migration에서 주문 delivered 전환과 완료 이벤트를 함께 확정하는 전용 RPC/API 초안은 찾지 못함 | 단순 미적용이 아니라 09 생산자 구현/승인 SQL 작업이 별도로 필요 |

02의 승인표는 [store-order-delivery-snapshot-02.md](db-approval/store-order-delivery-snapshot-02.md), 입력 인계는 [02 → 09 snapshot 계약](2026-11-08-02-stage-d-09-snapshot-input-handoff.md)을 그대로 재사용한다. 02 파일은 변경하지 않는다. 02 DDL만 적용해도 현재 09 신규 주문은 다섯 칸을 채우지 않으므로 연결이 완성되지 않는다. 기존 주문 자동 backfill도 하지 않는다.

## 09 생산자 후속에 필요한 계약

- 필수 customerName/address와 선택 addressDetail/recipientPhone/loadingPosition을 서버의 회사/거래처 경계로 검증하고 주문과 같은 transaction에서 저장한다. 빈 선택 값은 null, 생성 후 snapshot은 불변이다.
- 다섯 값을 idempotency fingerprint에 포함해 같은 키의 다른 배송지 입력을 충돌로 거부한다. 기존 7인자/회원 10인자 호출은 승인 없이 제거·교체하지 않는다.
- 완료는 상태 문자열이나 방문 메모에서 추정하지 않는다. 02의 명시적 completionEventId/completedAt/orderIds와 회사·주문 revision/취소 경계를 확정한 별도 생산자 계약이 필요하다. TMS에서 store_orders를 임의 PATCH하는 경로를 추가하지 않는다.
- 02 후보 소비는 기존 계약대로 submitted/received/in_delivery만 포함하고 cancelled/delivered는 제외한다. snapshot 없는 행은 missing_delivery_snapshot 확인 대상으로 유지한다.

필요한 09 생산자 up/down·권한·원자성/동시성/멱등 PG17 검증과 승인표는 별도 후속 PR 범위다. 이번 C fixture PR은 새 SQL을 작성하거나 운영에 적용하지 않으며 Stage D를 ON하지 않는다. C의 문서 수락/첫 주문 fixture 통과를 배송 완료나 실제 주문 성공으로 보고하지 않는다.
