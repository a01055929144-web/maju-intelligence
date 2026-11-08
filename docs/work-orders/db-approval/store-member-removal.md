# 매장 구성원 내보내기 RPC 승인표

상태: 운영 미적용, 기능 OFF. Owner: organization. Related: order.

기존 `store_accounts`, `store_account_members`, `store_account_member_events`만 재사용한다. 새 테이블·컬럼·백필은 없다.

- owner는 manager/staff를 내보낼 수 있다.
- manager는 staff만 내보낼 수 있다.
- owner 내보내기와 소유권 이전은 이 RPC에서 금지한다.
- actor/target은 같은 회사·같은 활성 매장에 속한 활성 구성원이어야 한다.
- 대상은 `removed`로 바꾸고 `removed_by_member_id`, `removed_at`, `remove` 이벤트를 같은 트랜잭션에 기록한다.
- 과거 주문의 `ordered_by_member_id`는 유지한다. 제거된 구성원은 다음 요청의 활성 회원 조회에서 즉시 거부된다.
- RPC는 service role 전용이다. 운영 적용과 기능 ON은 별도 대표 승인 전 금지한다.

PG17 확인: owner→manager/staff 성공, manager→staff 성공, manager→manager 및 owner 제거 실패, 교차 회사/매장 실패, 중복 제거 실패, 이벤트·감사값, 공개 role 실행권 없음.
