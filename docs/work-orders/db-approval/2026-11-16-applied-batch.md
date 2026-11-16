# 운영 DB 적용 기록 — 2026-11-16 22:3x KST (컨트롤타워)

대표 승인 문구(11/16 22:30, 6건 각각 `fcmdvveqmcgtioelzqun 운영 DB에 <파일> 적용 승인`) → 컨트롤타워가 운영 DB `fcmdvveqmcgtioelzqun`에 **한 건씩 한 트랜잭션**(`lock_timeout 3s`)으로 적용 · 건마다 `admin_audit_logs`(`action = db_draft_applied`) 1행 · 적용 뒤 읽기 확인.

| 순서 | 파일 | 무엇 | 적용 전 확인(운영 읽기) | 적용 뒤 읽기 확인 |
| --- | --- | --- | --- | --- |
| 1 | `docs/sql-drafts/2026-11-16-CX-44-short-share-links.sql` (#914) | 짧은 공유 링크 칸 · 열람 기록 · 함수 7 | `pricing_s2_public_request_guard` · `storefront_links` 열람 칸 · `storefront_link_events.device_class` 있음 | 새 칸 6 · 이벤트 테이블 · 함수 7 · **`short_share_code_v1()` 10자 생성 성공** |
| 2 | `docs/sql-drafts/2026-11-16-CX-46c-delivery-route-stops.sql` (#912) | 기사 경로 정류장 · 사진 · 사유 코드 | 선행 테이블 10 · 연결 제약 · 운영 경로 0건 | 정류장 · 사진 테이블 · 사유 코드 12 · 정류장 0행(옮길 경로 없음) |
| 3 | `docs/sql-drafts/2026-11-17-store-profile-notifications.sql` (#915 + #925) | 회사 알림 · 매장 정보 칸 4 · 변경 기록 · 함수 3 | 선행 테이블 · 함수 2 · 매장 1 · 계정 1 | 알림 · 변경 기록 테이블 · 칸 4 · 함수 3 |
| 4 | `docs/sql-drafts/2026-11-15-industry-basket.sql` (#831) | 업종 바구니 · 공유 미리보기 칸 3 | `product_catalog(company_id, id)` 유일 · 감사 칸 | 바구니 테이블 · 미리보기 칸 3 |
| 5 | `docs/sql-drafts/20261109-store-connection.sql` (#450 브랜치) | 매장 연결 해제 · 이용 종료 함수 | `store_accounts.status`에 closed · 이벤트 `remove` · `storefront_links.can_order` · `reason` 칸 | `change_store_connection_v1` 있음 |
| 6 | `docs/sql-drafts/2026-11-16-CX-38-order-sale-documents.sql` (#891) | 주문 → 매출 전표 · 수령 확인 · 함수 5 | ERP 함수 4 · 주문 · 주문 줄 · 전표 · 전표 줄 칸 전부 · `pricing_p0_*` · `source_type`에 order | 수령 테이블 · 함수 5 |

감사 기록: 최근 1시간 `db_draft_applied` 6행.

## 이제 풀리는 작업
- **07** #450 병합 가능(함수 적용됨) → S-7b(매장 설정 수정 · 첫 가입 입력 · 새 매장 확인 · 정보 바뀜 알림)
- **09** S-2a 초안의 `new_order` 알림 → `company_notifications` 운영에 있음
- **06** CX-44 앱(`/s/<코드>` · 열람 → 주문 단계)
- **01** CX-46a · CX-46e(정류장 테이블 운영에 있음) · Claude Code CC-59(가는 길에 넣기, 스위치 OFF로 시작)
- **01** E CX-42 수령 확인 · 09 E CX-39(주문 확정 전표 연결) — 기능 스위치 `ERP_ORDER_DOCUMENTS` 기본 OFF
- 업종 바구니 화면(06/09 다음 차수)

## 되돌리기
각 파일 옆 `.down.sql`(#450은 `20261109-store-connection.down.sql`). 운영 데이터는 아직 0~1행이라 down 시 영향 거의 없음.
