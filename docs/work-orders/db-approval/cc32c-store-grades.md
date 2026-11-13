# CC-32c 매장 등급 승인표

상태: **초안 · 운영 미적용**(대표 승인 문구 전 적용 금지). Owner: customer(매장 등급) · pricing(행사 대상). 
파일: `docs/sql-drafts/20261113-CC-32c-store-grades.sql` · `.down.sql` · `.pg17.test.sql`(CI PG17 단계 추가, 별도 DB).

## 운영 DB 읽기 확인 (2026-11-13, `fcmdvveqmcgtioelzqun`)
- `company_store_grades` 없음, `normalized_customers.store_grade_id` 없음(`margin_template_id`는 있음).
- `pricing_promotion_targets`는 **`target_kind` 열이 없고** `customer_id` / `template_id` 중 하나만 채우는 구조(`CHECK ((customer_id IS NULL) <> (template_id IS NULL))`), 행 0개, 유일 인덱스 2개.
  → 지시서의 "`target_kind` 허용값에 `store_grade` 추가"는 **`store_grade_id` 열 추가 + "세 가지 중 정확히 하나" 체크**로 구현(지시서와 다른 점, 컨트롤타워 확인 필요).
- `promotion_applies_to(company, promotion, customer)` 본문 확인(`audience` all/only/except, 대상은 매장 직접 지정 또는 카탈로그). 이 함수에 "매장 등급" 판정만 추가한다.

## 변경 내용
| 항목 | 내용 |
| --- | --- |
| 새 테이블 | `company_store_grades(id, company_id, name, color, sort_order, archived_at, created_at, updated_at)` — 이름 1~40자, 색 7종, RLS 켬(정책 없음)·anon/authenticated 회수·service_role만 |
| 이름 유일 | 보관하지 않은 등급끼리 `(company_id, lower(btrim(name)))` 유일(보관한 이름은 다시 쓸 수 있음 — 지시서는 보관 구분 없이 유일이라 했으나 재사용이 필요해 부분 유일로 함, 확인 필요) |
| 매장 연결 | `normalized_customers.store_grade_id uuid null` + 복합 FK `(company_id, store_grade_id)` → 같은 회사 등급만, 삭제 제한(NO ACTION: 쓰는 매장이 있으면 지울 수 없음, 보관만) |
| 행사 대상 | `pricing_promotion_targets.store_grade_id` 추가 + 복합 FK(등급 삭제 시 대상 행도 삭제) + 체크 `num_nonnulls(customer_id, template_id, store_grade_id) = 1` + `(promotion_id, store_grade_id)` 유일 |
| 노출 판정 | `promotion_applies_to`에 매장 등급 일치 조건 추가(매장 직접 · 카탈로그 · 매장 등급 중 하나라도 맞으면 hit, only/except 의미 그대로) |
| 행사 대상 저장 RPC | `save_promotion_audience_v1`: kind `store_grade` 허용(같은 회사 + 보관 안 한 등급만, 아니면 `Audience target outside company`), insert·distinct에 `store_grade_id` 포함. 나머지 본문은 운영과 동일(2026-11-13 읽기 확인). down은 원래 본문 복원 |
| updated_at | 운영에 있는 `set_row_updated_at()` 트리거 재사용(컨트롤타워 권장 반영) |
| 건드리지 않음 | `grade_override`(A/B/C 매출 등급), `margin_templates`(카탈로그), 기존 행사 대상 행 |

## down
등급을 쓰는 매장이나 행사 대상이 있으면 `store_grade_in_use`로 **거부**(데이터 삭제 없음). 없을 때만 함수·제약·열·테이블을 원래대로 되돌린다.

## PG17 검증 항목(CI)
등급 대상 저장 RPC(성공·다른 회사 등급 거부·보관 등급 거부) · updated_at 트리거 · 등급 대상 행사 only/except 판정 · 기존 매장 직접 지정 동작 유지 · 대상 두 종류 동시 지정 거부 · 같은 회사 이름 대소문자 무시 유일 · 다른 회사 등급 FK 거부 · 쓰는 등급 삭제 거부 · anon/authenticated 권한 없음 · 보관한 이름 재사용 · down 거부(사용 중)/성공(비운 뒤)과 옛 동작 복원.

## 적용 후 따라올 코드(승인 뒤 별도 PR)
등급 관리 서랍(이름·색·순서·보관) · 매장 가격 탭 등급 칩/필터 · 행사 대상 "매장 등급" 고르기 · `GET/POST` 서버 API(service_role 경유). 기본 OFF.

## 적용 절차(승인 후, 승인 받은 쪽이 직접)
승인 문구 원문 → 같은 트랜잭션에 `db_migration_applied` audit log → 적용 → 읽기 검증(새 테이블·열·제약·함수 본문) → 이 문서에 기록.
