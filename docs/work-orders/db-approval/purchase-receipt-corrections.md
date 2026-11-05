# 매입이력 정정 적용 기록

| 순서 | SQL | 변경 | 운영 상태 |
| --- | --- | --- | --- |
| 1 | `docs/sql-drafts/20261105-purchase-receipt-corrections.sql` | 기존 매입 행의 회사 복합 유니크 인덱스와 service_role SELECT·UPDATE 권한, 정정 override·이벤트 테이블, 원자적 정정 RPC | 대표 승인 후 2026-11-05 19:03 KST 운영 적용·읽기 검증 완료 |

원본 `purchase_receipt_lines`의 기존 행·금액은 바꾸지 않습니다. 정정 내역은 override에서 읽으며 재업로드 후에도 남습니다. 기존 현재 매입가와 판매가의 자동 변경은 포함하지 않습니다. 앱은 `PURCHASE_RECEIPT_CORRECTIONS_COMPANY_IDS`가 빈 기본 상태에서는 새 테이블을 조회하지 않고 정정 버튼·API를 열지 않습니다.

PG17에서 초안·롤백, 다른 회사 상품 연결 거부, 동시 정정 revision 충돌, 회사 삭제 cascade, 0원·소수 단가, 원본 보존·재업로드 후 override 유지를 확인했습니다. 운영 적용 후 원본 828행 유지, 정정·이벤트 0행, 새 테이블 RLS와 service_role 권한 및 RPC 존재를 읽기 전용으로 확인했습니다. 운영 쓰기 시험은 하지 않았으며 기능 플래그는 계속 꺼져 있습니다. 적용본은 `supabase/migrations/20261105190300_purchase_receipt_corrections.sql`에 기록하고 재실행하지 않습니다.
