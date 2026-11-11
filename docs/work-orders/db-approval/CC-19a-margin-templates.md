# CC-19a 마진 템플릿 + CC-17 폴더 이동 — 운영 승인 대기

Ponytail: 사용함 (Claude Code ponytail-review). 지시서 `docs/dispatch/2026-11-11-category-margin.md` CC-17·CC-19.
**운영 SQL 미실행.** 기능 스위치·배포·기존 데이터 변경 없음. 적용은 대표 명시 승인 문구 후, 아래 순서대로.
요청 문구(안): `fcmdvveqmcgtioelzqun CC-19a 마진 템플릿·폴더 이동 SQL 승인`

## 무엇이 생기나 (`docs/sql-drafts/20261111-CC-19a-margin-templates.sql`)

| 대상 | 내용 |
|---|---|
| `margin_templates` | 회사별 템플릿(이름·기본 마진 bp·끝자리 올림·보관일). `(company_id,name)` 고유 |
| `margin_template_categories` | 템플릿 분류별 마진(경로). 템플릿 삭제 시 함께 삭제 |
| `margin_template_items` | 템플릿 상품별 마진 또는 직접 단가(둘 중 하나는 필수). 상품은 같은 회사만(복합 FK) |
| `normalized_customers.margin_template_id` | NULL = 기본. `(company_id, margin_template_id)` FK로 **다른 회사 템플릿 지정 불가** |
| `product_category_moves` | 폴더 이동 이력(이전 분류 목록 포함, 되돌리기·감사용) |
| `move_product_category(company, from, to, actor)` | 상품 분류와 마진 연결(기본·템플릿)을 **한 트랜잭션**으로 같이 변경. 하위 폴더 포함, `A>B`·`A > B` 표기 같게 취급, 같은 이름 폴더로 옮기면 합치기(대상 쪽 마진 연결이 우선), 자기 하위로 이동 거부 |

- 전부 service_role 전용(RLS 켬, anon·authenticated 권한 없음). 기존 테이블·행은 **변경하지 않음**(거래처에 NULL 열 1개 추가만).
- 발행된 문서 버전은 스냅샷이라 건드리지 않음. 이동된 상품 분류는 `A > B` 정규 표기로 저장됨(공백 없는 `A>B`로 저장돼 있던 행은 이동 대상일 때만 표기가 바뀜).
- 화면은 이 PR에 없음(CC-17 화면·CC-19b·c는 승인·적용 뒤, 기능 스위치 `MARGIN_TEMPLATES_ENABLED` 대표 회사부터).

## 적용 순서 (승인 후)
1. 사전 읽기: `margin_templates` 없음(`to_regclass`), `normalized_customers`·`margin_group_categories` 있음, `normalized_customers` 건수 기록.
2. up 1회(3초 잠금 대기·30초 제한, 이미 적용이면 `cc19a_already_applied`로 중단).
3. 사후 읽기: 새 테이블 4개·함수 2개 존재, anon/authenticated 실행 불가·service_role 가능, `normalized_customers` 건수 불변·`margin_template_id` 전부 NULL.
4. down(`...CC-19a-margin-templates.down.sql`): 연결된 거래처·템플릿·이동 이력이 하나라도 있으면 거부(`cc19a_down_refused_*`).

## 격리 검증 (CI PG17, `tests/sql/margin-templates-cc19a.pg17.test.sql`)
권한 · 타사 상품/타사 템플릿 연결 거부 · 폴더 이름 바꾸기(상품·기본 그룹 연결·템플릿 연결 동시 이동, `농산물`처럼 접두어만 같은 폴더 불변, 타사 불변) · 이력 · 합치기 충돌 없음 · 자기 하위 이동/빈 경로 거부 · down 거부 → 정리 후 down → 재up. 가격 계산은 `domains/pricing/margin-template.ts` 단위 테스트(상품 직접 > 상품 마진 > 가장 깊은 분류 > 템플릿 기본).

## 보완(컨트롤타워 지시, 2026-11-11)
- 경로 하위 비교를 `LIKE`에서 `left(경로, 길이+3) = '경로 > '`로 변경 — 폴더 이름의 `_`·`%`가 와일드카드로 동작하지 않음(PG17 테스트 추가: `x_y` 이동 시 `xzy`·`x%y` 불변).
- 화면(CC-17, 승인 후 구현): 폴더 이동 성공 직후 `recalculate`를 바로 실행해 판매가를 갱신.
- 화면 합치기 확인창 문구: "같은 경로가 이미 있으면 대상 폴더의 마진 연결을 유지합니다."

## 운영 적용 기록 (2026-11-11 17:0x KST · 컨트롤타워)
- 승인 문구(대표 16:18): `fcmdvveqmcgtioelzqun CC-19a 마진 템플릿·폴더 이동 SQL 승인 (위 3가지 보완 후 적용)`
- 보완 1(SQL, `_`·`%` 와일드카드): 컨트롤타워 `2bddc04`(#550, PG17 통과 — `cc17_in_subtree()` left() 비교)로 적용. 같은 시각 Claude Code `77f64da`도 같은 보완을 인라인으로 넣었다 → **운영과 같은 `2bddc04` 형태로 초안을 맞춤**(이 PR). down에 `cc17_in_subtree` 삭제 추가.
- 보완 2·3(판매가 재계산·합치기 문구): CC-17 화면 PR 조건.
- 16:2x 첫 시도는 MCP 확인 대기 시간 초과로 미적용(한 트랜잭션이라 변경 없음 확인) → 17:0x 재적용.
- 읽기 검증: `margin_templates`·`margin_template_categories`·`margin_template_items`·`product_category_moves` 생성, RLS 켬, anon select·authenticated execute 없음, 함수 3개(`move_product_category`·`cc17_in_subtree`·`cc17_category_norm`), `normalized_customers.margin_template_id` 추가, 감사 로그 1건. 거래처 1건 영향 없음(열 null).
