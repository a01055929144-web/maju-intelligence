# [02] 휴대폰 배송·영업 기록 구조화 초안

상태: **SQL 검토 대기**. 운영 DB 적용과 새 테이블에 쓰는 앱 코드는 별도 승인 전까지 금지한다. SQL: [20261026-02-mobile-delivery-sales-events.sql](../sql-drafts/20261026-02-mobile-delivery-sales-events.sql).

## 현재 흐름과 새 데이터의 관계

| 현재 저장 | 구조화 행 | 연결·멱등 기준 |
| --- | --- | --- |
| `customer_notes`의 배송 메모 | `delivery_events` 1건 | `(company_id, customer_note_id)` 유일. 8종 배송 유형, 원인, 품목·수량, 공급처, 발생 구간, 조치, 처리 상태 |
| `customer_attachments`의 배송 사진 | `delivery_event_attachments` 여러 건 | 배송 이벤트·사진 모두 같은 회사와 같은 거래처인지 복합 FK로 검사 |
| `lead_actions`의 방문·연락 메모 | `sales_offers` 0건 이상 | `(company_id, lead_action_id, line_number)` 유일. 품목·제시 단가·유효일과 샘플 품목·수량 |

원문 메모는 사람이 읽을 짧은 요약으로 유지한다. 기존 행은 자동 변환하지 않는다. 배송·영업 저장 API는 기존 메모 저장이 성공한 뒤 그 ID를 받아 구조화 행을 기록해야 한다. 앱 전환 시 부분 실패가 생기지 않도록 서버 트랜잭션 또는 같은 멱등 키로 재시도하는 설계를 별도 검증한다. `customer_notes`/`lead_actions`의 ID에 연결되므로 중복 요청은 기존 행을 찾아 동일한 이벤트를 upsert한다. 다른 회사 또는 다른 매장·리드 기록을 연결하려는 요청은 복합 FK가 거부한다. 공용/익명/인증 사용자에게 테이블 접근 권한이 없고, 서버가 `manage_sales` 등 기존 권한 검사를 한 후 service role로 접근한다.

배송 `event_type`은 기존 `domains/delivery/issue-causes.ts`의 `DeliveryRecordType`과 정확히 같다. `cause_code`는 같은 파일의 11개 원인 코드다. `stage`는 입고/보관/적재/운송/하차, `action_type`은 재배송/교환/차감/공급처 클레임, `status`는 접수/조치 중/완료를 코드값으로 저장한다. 초기 UI에서 입력하지 않는 공급처·구간·조치 값은 `null`, 이슈 상태는 `received`다. 정상 완료도 이벤트로 저장하지만 이슈 집계에서는 제외한다. 공급처 FK가 삭제되면 표시용 이름 스냅샷은 보존한다. 과거 메모를 파싱해 집계하지 않는다.

제시 단가는 원 단위 정수 `unit_price`, 유효일은 `date`, 샘플 수량은 양수 소수로 저장한다. 한 행동에 여러 품목을 제시할 수 있도록 `line_number`를 둔다. 제시 단가 또는 샘플 중 하나는 있어야 한다. 이는 실제 견적서나 거래처 계약 단가가 아니며 보류된 견적 모듈을 호출하지 않는다. 유효일 리마인드는 이후 승인된 기능에서 이 열을 읽고, 과거 메모 문자열은 대상에서 제외한다.

## 승인 뒤 적용·검증 순서

1. SQL 적용 전 기존 테이블의 `(company_id, id, customer_id/lead_id)` 유일 제약과 `product_suppliers(company_id,id)`을 다시 확인한다. SQL 적용 뒤 테이블 3개, 복합 FK, 유일 제약, 인덱스, RLS와 `anon`/`authenticated` 접근 거부를 검증한다.
2. 서버 쓰기 경로를 기존 메모·사진 저장과 연결한다. UI는 원인·품목·수량·샘플·단가·유효일을 별도 입력으로 보내고 메모에는 요약만 남긴다. 실패·재시도와 다른 회사 ID 거부를 테스트한다.
3. N1 배송 CS 화면은 `delivery_events`와 사진 연결표만 읽는다. 별도 이슈 입력 원장을 만들지 않는다. 단가 만료 알림은 `sales_offers.valid_until`을 사용한다.

## 롤백

쓰기 코드 배포 전이면 SQL 끝의 주석 처리된 롤백 블록으로 새 테이블 3개와 새 부모 유일 제약을 제거한다. 쓰기 코드 배포 뒤에는 먼저 쓰기를 이전 버전으로 돌리고 새 행을 백업한 다음 제거한다. 기존 메모·사진·행동 기록은 롤백으로 변경되지 않는다.

## ⑬의 별도 잔여 UI

- 하단 `오늘`과 `코스`가 모두 `#route-list`로 연결되어 있다. 코스 페이지의 실제 경로와 세션·권한 의존성을 확인해 코스 링크만 바꾼다.
- 배송/신규/영업 모드 탭, 상태 칩, 한 줄 카드, 일괄 상태 변경은 현재 작업의 SQL 적용과 독립된 UI 단계다. 시안은 `docs/design/2026-10-26/MapFirstMobile.dc.html`만 참조한다.
- SQL 승인 전에는 `delivery_events`, `sales_offers` 쓰기 코드와 운영 DB 변경을 진행하지 않는다.
