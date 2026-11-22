# CX-66 출고 확정·부분 출고 — 운영 적용 대조 기록

- 상태: **적용 완료(11/19 · #1150 → #1155 → #1157 → #1156 묶음).** 이 문서는 11/22 대조 결과이며 SQL을 다시 적용하지 않았다. **재실행 금지.**
- 적용 근거: 현황판 "배포 기록" 11/19 오전 줄(Codex 총괄방, CX-38b · CX-66 기본 · 부분 출고 1회 적용).
- 대조 일시·방법: 2026-11-22 Claude Code, 운영 `fcmdvveqmcgtioelzqun` **읽기 전용**. 운영 `pg_proc.prosrc`의 MD5와 main의 SQL 파일 `$$ … $$` 본문 MD5를 비교했다.

| 객체 | 운영 본문 MD5 | main SQL 본문 MD5 | 결과 |
|---|---|---|---|
| `dispatch_store_orders` | `1d63d29e5e74a28d1e944add3046c548` (4,702자) | `docs/sql-drafts/2026-11-18-CX-66-order-dispatch.sql` 동일 | 일치 |
| `dispatch_store_orders_partial_final_cancel` | `0b84371a7c5c0ef76621a5c94d460dd2` (11,397자) | `docs/sql-drafts/2026-11-18-CX-66-partial-dispatch-final-cancel.sql` 동일 | 일치 |
| `block_order_sale_document_early_confirmation` (트리거 함수) | `a126de92e0e92b9dab7dcc8d9080de82` | `…CX-66-order-dispatch.sql` 동일 | 일치 |

- 트리거 `order_sale_document_requires_dispatch`가 `business_documents`에 걸려 있고 활성(`O`).
- 두 출고 함수: 소유자 `postgres`, security definer, `search_path=""`, 실행 권한은 `postgres`·`service_role`만(anon/authenticated 없음).
- `order_dispatch_requests`: RLS 켜짐, anon/authenticated 권한 없음, 0행.
- 선행 확인: CX-62 `receive_store_order_with_sale_document`는 운영에 **없음**(별도 승인 대기). 출고 함수는 접수 전표가 없으면 쓰이지 않으며 기능은 OFF다.
- 하지 않은 것: 함수 호출, 데이터 변경, down 실행, 기능 ON.
