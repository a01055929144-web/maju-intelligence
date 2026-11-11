# CC-26a 폴더 순서 — 운영 적용 완료 (2026-11-11 21:5x KST · 컨트롤타워)

- 승인 문구(대표 21:49): `fcmdvveqmcgtioelzqun CC-26a 폴더 순서 SQL 승인`
- 적용본: #579 head `b8e5d92`의 `docs/sql-drafts/20261111-CC-26a-category-folders.sql` 그대로 + `admin_audit_logs` `db_migration_applied`(CC-26a).
- CI: PG17 `CC-26a PG17 OK`. build 실패 1건은 `order-inbox.spec.ts` 1440px(점주 수정 충돌 안내 문구 — 이 PR 변경과 무관, 재실행 필요).
- 읽기 검증: `product_category_folders` RLS 켬 · anon select 없음 · authenticated execute 없음 · 백필 108행(전부 제이에스리테일, 최상위 6) · 감사 로그 1건.
- 최상위 순서(백필 = 가나다): 공산품 0 · 기타 1 · 농산 2 · 비식품 3 · 수산 4 · 축산 5 → 대표가 원하는 순서(예: 농산·축산·수산·공산품·비식품·기타)는 CC-26 화면에서 끌어서 바꾸거나 승인 후 `reorder_product_category_folder`로.

## 최상위 순서 변경 (22:02 KST)
- 승인 문구: `fcmdvveqmcgtioelzqun 폴더 순서 승인 — 농산·축산·수산·공산품·비식품·기타`
- `reorder_product_category_folder`를 그 순서로 6회(각각 맨 뒤로) + 감사 로그 `category_folder_reorder`.
- 결과: 농산 0 · 축산 1 · 수산 2 · 공산품 3 · 비식품 4 · 기타 5. 중·소분류는 가나다(백필) 그대로.
