# CC-29c 비대상 행사 줄 정상가를 서버 계산으로 — 운영 적용 완료(11/12)

Ponytail: 사용함 (Claude Code ponytail-review). CC-29b(운영 적용 11/12 12:07) 수정분. 지시: 대표 11/12 "P2, 행사 대상 스위치 켜기 전 필수".
**운영 적용 완료(11/12 13:02 KST).** `PROMOTION_AUDIENCE` 스위치는 계속 OFF(켜기는 대표 승인).
요청 문구(안): `fcmdvveqmcgtioelzqun CC-29c 비대상 행사 정상가 서버 계산 SQL 승인`

## 무엇이 문제였나 (29b 운영 반영분)
대상이 아닌 매장이 행사 줄을 주문하면 정상가를 `약정가 → v_line->>'normalPrice'(요청 입력값) → 문서 정상 줄 → 상품 default_sales_price` 순으로 정했다.
1. 요청 입력값(`normalPrice`)을 가격으로 쓸 수 있었다. 지금 `app/api/storefront/route.ts`는 `productId·promotionId·quantity`만 넘겨 막혀 있지만, 함수가 입력을 믿는 구조 자체가 위험하다.
2. `default_sales_price`는 실제 회사(제이에스리테일)에서 비어 있어, 문서에 정상 줄이 없으면 주문이 거부된다. 가격 관리의 판매가·등급가는 보지 않았다.

## 무엇이 바뀌나 (`docs/sql-drafts/20261112-CC-29c-promotion-normal-price-server.sql`)
| 대상 | 내용 |
|---|---|
| `place_store_order` · `place_store_member_order` (한 줄 치환 2곳, 앵커가 각 1번 맞아야 함) | 비대상 행사 줄 정상가 순서: ① 유효 약정가(기존 코드, 변경 없음) → ② **매장 `margin_template_id` 등급가** → ③ **`pricing_p0_effective.price`**(가격 관리 판매가, E1 매출 전표와 같은 출처, 0이면 미설정) → ④ 문서의 정상 줄 가격. 없으면 `Normal price unavailable`로 거부(기존과 같음). **요청 입력(`normalPrice`)과 `default_sales_price`는 더 이상 보지 않음** |
| `margin_template_price_v1(회사, 매장, 상품)` (새 함수, service_role만) | 앱의 `templatePrice`와 같은 규칙: 등급 상품 고정가 > 등급 상품 마진 > 가장 깊은 분류 마진 > 등급 기본 마진, 올림은 기존 `pricing_p0_price`. 등급이 없거나 가격이 0이면 NULL(다음 순서로) |
- 데이터 변경 없음. 대상 매장·일반 줄·행사 재고·약정가 처리는 그대로. 행사 대상 스위치가 꺼져 있고 제한된 행사가 0건이라 **적용해도 현재 주문 동작은 바뀌지 않는다**.
- 함수 식별자·권한(service_role만)·invoker 유지 확인, 바뀌면 중단.

## 적용 순서 (승인 후)
1. 사전 읽기: `margin_template_price_v1` 없음, 두 주문 함수에서 29b 문장 2개가 각 1번, `-- cc29c` 표식 없음.
2. up 1회(3초 잠금 대기·30초 제한). **같은 트랜잭션에서 `admin_audit_logs`에 `db_migration_applied` 기록**(`README.md` 규칙).
3. 사후 읽기: 새 함수 권한, 두 주문 함수 `-- cc29c` 표식 1개씩·`normalPrice`·`default_sales_price` 문자열 없음·ACL 동일·invoker.
4. down(`...CC-29c-...down.sql`): 29b 문장으로 정확히 복원 + 새 함수 삭제(결함이 있던 29b 동작으로 돌아가므로 롤백 전용).

## 격리 검증 (CI PG17, `tests/sql/promotion-normal-price-cc29c.pg17.test.sql` — 29b 테스트 직후 같은 DB)
legacy·member 두 함수 모두:
- 제이에스리테일처럼 `default_sales_price` 비어 있음 + `pricing_items.price` 1700: 등급 없는 매장 1700, 등급 매장(마진 20%) 1200.
- 순서 확인: 약정가(700·650) > 등급가 > 가격 관리 판매가 > 문서 정상 줄(1500). 판매가 0이면 문서 줄, 문서 줄도 없으면 `Normal price unavailable`.
- 요청에 `normalPrice:1`을 넣어도 무시(1700·1200).
- 등급 규칙: 상품 고정가 1111 > 상품 마진(5%)→1050 > 깊은 분류 마진(10%→1100) > 상위 분류(30%→1300) > 등급 기본(20%→1200), 등급 없으면 NULL.
- 대상 매장은 행사가 900 유지·`promotion_id` 그대로.
- 정의에 `normalPrice`·`default_sales_price`가 남지 않음, ACL·invoker 불변, down 정확 복원 후 재 up.

## 적용 기록 (2026-11-12)
- 승인 문구 원문(대표 메시지 그대로): `fcmdvveqmcgtioelzqun CC-29c 행사 비대상 정상가 서버 계산 SQL 승인` ← 안내한 문구와 단어 순서가 달랐음("비대상 행사" → "행사 비대상"). 프로젝트 ID·작업 ID·내용이 같아 의도 동일로 판단(CC-29a와 같은 처리).
- 승인 시각: 2026-11-12 13:01 KST 직전(메시지 수신 직후 사전 읽기 13:01:50). 적용 13:02:10 KST. 초안 커밋 `f75aac6`(#611).
- **감사 기록(`admin_audit_logs`)**: 같은 트랜잭션 안에서 기록(id `fe82675e-8bec-4c8f-b90b-7205c4e0318d`, action `db_migration_applied`, target_type `migration`, actor·company 없음). 읽기로 확인함.
- 적용: 운영 `fcmdvveqmcgtioelzqun`에 초안 SQL 1회 적용(Supabase `apply_migration` `cc29c_promotion_normal_price_server`, 성공).
- 사전 읽기: `margin_template_price_v1` 없음, 두 주문 함수에서 29b 문장 2개가 각 1번, `-- cc29c` 표식 없음, 제한된 행사 0건.
- 사후 읽기: `margin_template_price_v1` 존재(service_role만, invoker), 두 주문 함수 ACL 그대로(`postgres`·`service_role`)·invoker, 각 함수 `-- cc29c` 표식 2개씩, `normalPrice`·`default_sales_price` 문자열 없음, 제한된 행사 0건, audit 기록 1건.
- 데이터 변경: 없음. 다음: 스위치 켜기 전 매장 화면·견적서 블록·주문함 표시(2번 나머지).
