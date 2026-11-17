# CX-62 주문 접수와 매출 전표 적용 승인표

**운영 적용 대기 · SQL 적용 선행 · 배포 금지.** 대표 승인 뒤 컨트롤타워가 적용 잠금을 잡고 SQL 초안을 적용한다. 운영 함수와 권한을 읽기로 재확인한 뒤 앱 코드 병합과 배포를 검토한다.

| 운영 읽기로 확인한 선행 조건 | 결과 |
| --- | --- |
| CX-38 `confirm_order_sale_document`와 `revise_order_sale_document` | 두 함수가 운영에 있다. 이 초안은 기존 확정·원장·재고 경로를 호출한다. |
| `store_orders` 및 `business_documents` 서비스 역할 접근 | 운영에 두 테이블과 서비스 역할 접근이 있다. `store_orders_review_guard`가 설치돼 있다. |
| CX-62 `receive_store_order_with_sale_document` | 운영에 없다. 이 초안의 적용·확인이 앱 병합·배포의 선행 조건이다. |
| 기능 스위치 | 기존 `FEATURE_ERP_ORDER_DOCUMENTS_COMPANY_IDS`에 제이에스리테일이 허용돼 있다(R7 적용 기록). 코드 배포 즉시 해당 회사의 접수에서 전표가 생성된다. 옛 `ERP_ORDER_DOCUMENTS`, `ERP_ORDER_DOCUMENTS_COMPANY_IDS`는 앱이 읽지 않는다. |

접수 RPC는 회사·주문 행을 잠그고 요청 revision을 확인한다. CX-38 전표 확정·수정, 회사·거래처·원본 연결 확인, `received` 변경은 한 트랜잭션에서 완료한다. 접수 트리거까지 포함해 어느 단계에서든 실패하면 전표·원장·재고도 롤백한다. 같은 revision의 중복 접수는 기존 접수 결과를 반환한다.

[PG17 합성 시험](../../sql-drafts/2026-11-17-CX-62-order-receipt.pg17.test.sql)은 서로 다른 연결에서 낡은 revision의 접수와 동시 중복 접수를 검증한다. 기존 CX-41 fixture의 재고 대역으로 재고 출고 이벤트의 중복과 롤백을 검증한다. 운영 실데이터, 직원 수정·취소 및 07방 CX-64의 전표 삭제·주문 되돌리기는 이 PR의 검증 범위 밖이다.

[되돌리기](../../sql-drafts/2026-11-17-CX-62-order-receipt.down.sql)는 새 RPC만 내린다. 접수·전표·원장·재고 기록을 보존한다. 운영 되돌리기가 필요하면 앱 호출을 먼저 중지하거나 앱을 되돌리고 RPC를 제거한다.
