# CC-26a 폴더 순서 테이블 — 운영 승인 대기

Ponytail: 사용함 (Claude Code ponytail-review). 지시서 `docs/dispatch/2026-11-11-products-partners.md` CC-26a.
**운영 SQL 미실행.** 화면(CC-26)·기능 스위치·배포 변경 없음. 적용은 대표 명시 승인 문구 후.
요청 문구(안): `fcmdvveqmcgtioelzqun CC-26a 폴더 순서 SQL 승인`

## 무엇이 바뀌나 (`docs/sql-drafts/20261111-CC-26a-category-folders.sql`)
| 대상 | 내용 |
|---|---|
| `product_category_folders` (새 테이블) | `company_id` · `path`(정규화 `A > B`) · `sort_order`(같은 상위 안 순서) · 시각 · (company_id, path) 기본키 · RLS 켬, 앱 역할 권한 없음, `service_role`만 |
| 백필 | 지금 상품 분류 경로의 **모든 상위 폴더**마다 1행, 순서는 같은 상위 안에서 이름순(현재 상품관리 표시 순서) |
| `move_product_category` (교체) | 기존(CC-19a) 동작 그대로 + 폴더 순서 행도 같이 이동. 합치기(같은 경로가 이미 있음)이면 **대상 폴더의 순서를 유지**, 원본 행은 삭제 |
| `reorder_product_category_folder(회사, 경로, 앞에 둘 형제)` (새 함수) | 같은 상위 안에서 폴더를 형제 앞(없으면 맨 뒤)으로 옮기고 형제를 0..n-1로 다시 매김. 상품이 있는 폴더(업로드로 새로 생긴 것 포함)는 행이 없어도 형제로 처리. 회사 단위 잠금(`pg_advisory_xact_lock`) |
| `cc26a_parent(경로)` (새 함수) | 상위 경로 계산 보조 |

- 순서가 없는 폴더(새로 생긴 분류)는 같은 상위 안에서 맨 뒤·이름순. 빈 폴더 보존은 이후 화면 작업(CC-26)에서.
- **발행된 문서 버전은 그대로**(스냅샷). 이 SQL은 상품·마진·문서 내용을 바꾸지 않는다(기존 `move_product_category`와 같은 범위).
- 의존: CC-19a(`cc17_category_norm`·`cc17_in_subtree`·`move_product_category`) 적용 완료 상태(운영 확인됨).

## 적용 순서 (승인 후)
1. 사전 읽기: `product_category_folders` 없음, `move_product_category`·`cc17_*` 있음, 회사별 상품 분류 경로 수 기록.
2. up 1회(3초 잠금 대기·30초 제한, 이미 적용이면 `cc26a_already_applied`로 중단).
3. 사후 읽기: 테이블·RLS·권한(anon/authenticated 불가), 회사별 폴더 행 수 = 사전 읽기의 "상위 폴더 포함 경로 수", 최상위 순서가 이름순, 함수 3개 service_role만 실행 가능.
4. `docs/work-orders/db-approval/` 기록(이 문서에 결과 추가) → CC-26 화면 단계 진행.
5. down(`...CC-26a-category-folders.down.sql`): CC-19a의 `move_product_category`로 되돌리고 함수·테이블 삭제. **백필 이후 순서를 한 번이라도 바꿨으면 `cc26a_down_refused_order_edited`로 거부**(순서 유실 방지) — 화면을 먼저 되돌려야 함.

## 격리 검증 (CI PG17, `tests/sql/category-folders-cc26a.pg17.test.sql`)
백필 건수·순서(회사별) · 권한(anon/authenticated 불가, service_role 가능) · 형제 앞/맨 뒤 이동 · 다른 회사 불변 · 형제가 아니면 거부 · 빈 경로 거부 · 업로드로 새로 생긴 폴더 포함 · 이름 바꾸기 시 순서 행 동행(하위 포함, 이전 행 삭제) · 합치기 시 대상 순서 유지·중복 없음 · 자기 하위 이동 거부 · 재적용 거부 · down 거부(순서 편집 후) → 정리 후 down → 기존 이동 함수 동작 → 재 up.
