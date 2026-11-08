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

## D 생산자 후속 초안

B #400(main 44c4213), C #406(main a386667)의 fixture 구현 이후 별도 Draft에서 09 생산자 SQL을 준비했다. 기존 조사 표는 현재 HTTP 런타임 기준이며 여전히 snapshot/완료 호출은 연결되지 않았다.

- [별도 승인표·입출력 계약](db-approval/store-order-delivery-producer-09.md)
- up: docs/sql-drafts/20261108-09-order-delivery-producer.sql
- down: docs/sql-drafts/20261108-09-order-delivery-producer.down.sql
- PG17 fixture: tests/sql/store-order-delivery-producer-09.pg17.fixture.sql
- 원자성·동시성 실행: scripts/test-store-order-delivery-producer-09.mjs

새 wrapper는 기존 7/10인자 함수를 한 트랜잭션에서 호출한다. 새 완료 함수는 명시적 이벤트와 주문 revision으로 상태를 확정하는 제안이다. 완료 허용 상태와 검증된 기사/코스 입력 경계는 02/03 검토 후 확정해야 한다. 02 소유 SQL/소비자 파일은 수정하지 않았다.

02/03 검토 보완: 서로 다른 거래처 주문의 혼합 완료를 SQL에서 거부한다. 완료 이벤트↔주문 관계는 회사 복합 FK·주문당 UNIQUE·pre/completed revision으로 영속 저장하고, completed_at은 이벤트의 고정 칸에서 조회한다. completionEventId가 유일한 완료 멱등 키다. Stage E는 delivered와 동일 완료 관계를 검증하고 주문 ID source key로 전표 중복을 막는 후속 계약이다. 반품/완료 무효화는 이 SQL에 넣지 않는다. 기사·코스·차량·정류장·증빙의 서버 검증과 이력 projection 등 연결 전 미완료 조건은 승인표에 남겼다.

이 Draft의 격리 PG17 통과와 운영 승인은 별개다. 운영 미적용·API 미연결·Stage D OFF이며, C의 수락/첫 주문 fixture 통과를 실제 주문·배송 완료로 보고하지 않는다.

#414 증빙 검토 후 완료 RPC Draft에 필수 p_customer_id / p_note_id / p_attachment_ids를 추가했다. 회사·거래처·delivery 메모/delivery_proof 첨부를 SQL 안에서 잠금 재검증하고 이벤트·주문 상태·증빙 관계를 한 트랜잭션으로 저장한다. 02 전달용 상세 인자·결과·같은 이벤트 재시도 규칙은 위 승인표에 기록했다. #414 연결과 API→PG17 검증 전에는 호출 차단을 유지한다. 다른 채팅에 직접 전송한 것은 아니다.
