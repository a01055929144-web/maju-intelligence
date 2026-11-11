# CC-29a 행사 노출 대상(매장·등급) 데이터 틀 — 운영 승인 대기

Ponytail: 사용함 (Claude Code ponytail-review). 지시서 `docs/dispatch/2026-11-11-category-margin.md` CC-29.
**운영 SQL 미실행.** 화면·기능 스위치·배포 변경 없음. 적용은 대표 명시 승인 문구 후.
요청 문구(안): `fcmdvveqmcgtioelzqun CC-29a 행사 노출 대상 SQL 승인`

## 무엇이 바뀌나 (`docs/sql-drafts/20261112-CC-29a-promotion-audience.sql`)
| 대상 | 내용 |
|---|---|
| `pricing_promotions.audience` (열 추가) | `all`(기본) · `only` · `except`. **기존 행사는 모두 `all`**(동작 변화 없음) |
| `pricing_promotion_targets` (새 테이블) | `company_id` · `promotion_id` · `customer_id`(거래처) 또는 `template_id`(등급=마진 템플릿) 중 **하나만** · 회사 경계 외래키(행사·거래처·템플릿 모두 같은 회사) · 같은 대상 중복 불가 · RLS 켬, 앱 역할 권한 없음, `service_role`만 |
| `promotion_applies_to(회사, 행사, 거래처)` (새 함수) | `all` → 참 / `only` → 매장이 직접 지정됐거나 **매장 등급이 지정**됐으면 참 / `except` → 그 반대. 등급이 없는 매장은 매장 지정으로만 매칭. 없는 행사·다른 회사 행사 → 거짓 |

- 지시서의 `target_kind`/`target_id` 대신 **열 2개(`customer_id`·`template_id`) + 각각 외래키**로 만들었다(한 열로는 거래처/템플릿 외래키를 걸 수 없어, 지운 매장·템플릿의 대상이 남는 것을 DB가 막도록).
- **이 단계는 판정 데이터와 함수만.** 주문 함수(`place_store_order`·`place_store_member_order`) 수정(대상 아닌 매장은 견적가 → 등급가 → 기본가, 행사 재고 차감 안 함, 줄의 `promotion_id` 비움, "행사 미적용 N줄")은 **CC-29b 별도 초안**으로 올린다. 운영 함수 정의가 각 13KB라 주문 경로를 따로 검증하기 위해 나눔. **29a만 적용해도 매장 주문·화면 동작은 그대로**(아무도 이 판정을 부르지 않음).
- 등급 가격(템플릿 가격)은 앱의 가격 엔진이 계산하므로, 29b에서는 서버가 계산한 "정상 가격"을 주문 함수에 넘기는 방식을 제안한다(안 넘기면 문서의 정상 줄 → 상품 기본 판매가 순서).

## 적용 순서 (승인 후)
1. 사전 읽기: `pricing_promotion_targets` 없음, `pricing_promotions.audience` 없음, `margin_templates`·`normalized_customers` 있음.
2. up 1회(3초 잠금 대기·30초 제한, 이미 적용이면 `cc29a_already_applied`로 중단).
3. 사후 읽기: 열·테이블·함수 존재, 기존 행사 전부 `audience='all'`, `anon`/`authenticated` 접근 불가, `service_role` 가능. 데이터 변경 없음.
4. 이 문서에 결과 기록 → 서랍 화면(대상 고르기)·CC-29b 진행.
5. down(`...CC-29a-promotion-audience.down.sql`): 함수·테이블·열 삭제. **제한된 대상(`only`/`except`)이나 대상 행이 하나라도 있으면 `cc29a_down_refused_audience_in_use`로 거부**(설정 유실 방지).

## 격리 검증 (CI PG17, `tests/sql/promotion-audience-cc29a.pg17.test.sql`)
기본값 all·전 매장 참 · 권한(앱 역할 불가) · only+매장 · only+등급 · only 대상 없음=아무도 아님 · except+등급(등급 없는 매장은 해당) · except 대상 없음=모두 · except+매장 · 없는 행사/다른 회사 행사·매장 거짓 · 제약(둘 다/둘 다 없음/중복/다른 회사 매장·등급/잘못된 audience 거부) · 행사 삭제 시 대상 삭제 · down 거부 후 down·재 up.
