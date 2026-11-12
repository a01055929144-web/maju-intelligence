# CC-29b 행사 노출 대상 저장 함수 + 주문 함수 2개 수정 — 운영 승인 대기

Ponytail: 사용함 (Claude Code ponytail-review). 지시서 `docs/dispatch/2026-11-11-category-margin.md` CC-29 · `2026-11-11-pricing-simplify.md` CC-30c.
**운영 SQL 미실행.** 기능 스위치·배포 변경 없음. 적용은 대표 명시 승인 문구 후.
요청 문구(안): `fcmdvveqmcgtioelzqun CC-29b 행사 노출 대상 저장·주문 함수 SQL 승인`
선행: CC-29a 운영 적용 완료(11/12).

## 무엇이 바뀌나 (`docs/sql-drafts/20261112-CC-29b-promotion-audience-orders.sql`)
| 대상 | 내용 |
|---|---|
| `save_promotion_audience_v1(회사, 행사, 기대 revision, audience, targets jsonb)` (새 함수) | 한 트랜잭션에서 행사 잠금 → revision 불일치면 `Stale promotion`으로 거부 → 대상(매장·등급)이 **같은 회사**인지 확인 → 대상을 **통째로 교체** → `audience` 저장, revision +1. `only`인데 대상 0개면 거부, `all`에 대상이 있으면 거부, 중복 대상은 하나로. `service_role`만 실행 |
| `place_store_order` · `place_store_member_order` (본문 일부 치환) | ① **대상인 매장 + 행사 줄**: 행사가 그대로, 재고·한도 확인 그대로. **약정가(매장 가격)가 행사가를 덮어쓰지 않음**(지금은 덮어씀). ② **대상이 아닌 매장 + 행사 줄**: 정상 줄로 처리 — 약정가 → 서버가 넘긴 등급가(`normalPrice`) → 문서의 정상 줄 가격 → 상품 `default_sales_price` 순, 행사 재고 확인·차감 없음, 주문 줄 `promotion_id` 비움, 결과 JSON에 `promotionNotApplied` 개수. 정상 가격을 못 찾으면 `Normal price unavailable`로 거부. ③ 행사 없는 줄·기간 끝난 행사·없는 행사 처리는 그대로 |

- 기존 행사는 모두 `audience='all'`이므로 **적용만으로 주문 동작은 바뀌지 않는다**(약정가가 있는 매장이 `all` 행사 줄을 주문할 때 행사가가 유지되는 것만 바뀜 — 지시서 CC-30c "행사 대상이면 행사가 > 매장 가격").
- 본문 치환 방식은 CX-08과 같다(앵커 7개가 각 함수에서 정확히 1번씩 맞아야 하고, 아니면 중단 `cc29b_definition_changed`). 운영 두 함수에서 7개 모두 1번씩 맞는 것을 읽기로 확인함(11/12). 함수 줄바꿈(CRLF/LF)은 함수 자체를 따른다.
- 함수 식별자·권한(service_role만)·invoker 유지 확인, 바뀌면 중단.

## 적용 순서 (승인 후)
1. 사전 읽기: `save_promotion_audience_v1` 없음, 두 주문 함수 앵커 7개 각 1번, `product_catalog.default_sales_price` 있음(확인됨), `audience<>'all'` 행사 수 기록.
2. up 1회(3초 잠금 대기·30초 제한). **같은 트랜잭션에서 `admin_audit_logs`에 `db_migration_applied` 기록**(`README.md` 규칙, 승인 문구 원문 포함).
3. 사후 읽기: 새 함수 존재·권한(anon/authenticated 불가), 두 함수 `-- cc29b` 표식 1개씩·ACL 동일·invoker, 기존 행사 전부 `all`.
4. 이 문서에 승인 문구 원문·audit 기록 id 기록 → 서랍 화면(기능 스위치 OFF)·매장 화면 단계 진행.
5. down(`...CC-29b-promotion-audience-orders.down.sql`): 두 함수를 **이전 본문으로 정확히 복원**하고 새 함수 삭제. **제한된 대상(`only`/`except`)이 있는 행사가 하나라도 있으면 `cc29b_down_refused_audience_in_use`로 거부**.

## 격리 검증 (CI PG17, `tests/sql/promotion-audience-orders-cc29b.pg17.test.sql`, 로컬 Docker PG17에서도 통과)
- legacy·member 두 함수 모두, 약정가 있는 매장 + 행사 줄: `all` 행사는 행사가 유지(약정가 700이어도 900) · 일반 줄은 약정가 유지.
- `only`+매장 / `only`+등급 / `except`+매장: 비대상은 약정가(700) 또는 `normalPrice`(1300) → 문서 정상 줄(1500) → 상품 기본가(1100) 순, `promotion_id` 비움, 행사 재고 미차감(5개 주문해도 재고 그대로), `promotionNotApplied`=1. 대상은 행사가 900·재고 차감, 재고 2 초과 시 `Promotion unavailable`.
- 정상 줄이 없는 문서 + 기본가 없음 → `Normal price unavailable`. 끝난 행사·없는 행사 → 그대로 거부.
- `save_promotion_audience_v1`: revision +1, 오래된 revision 거부, `only` 대상 0개 거부, `all`+대상 거부, 다른 회사 매장·등급 거부, 잘못된 값 거부, 거부 시 변경 없음, 대상 통째 교체·중복 제거, 권한.
- down: 제한된 대상이 있으면 거부 → 해제 후 down → 두 함수 정의·ACL 바이트 단위 복원 → 재 up.

## 남은 것 (이 SQL 밖)
- 서버가 등급가를 계산해 줄에 `normalPrice`로 넘기는 연결(앱 코드, 별도 PR). 안 넘기면 등급가 대신 문서 정상 줄 가격이 쓰인다.
- 서랍 화면(대상 고르기)은 기능 스위치 OFF로 올리고, 이 SQL 적용 뒤에만 켠다.
