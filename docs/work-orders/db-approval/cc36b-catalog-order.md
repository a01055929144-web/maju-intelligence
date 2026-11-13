# CC-36b 전체 상품 주문 + 품목 메모 승인표

상태: **초안 · 운영 미적용**(컨트롤타워 검토 → 대표 승인 문구 전 적용 금지). Owner: store(주문) · pricing(가격). 
파일: `docs/sql-drafts/20261113-CC-36b-catalog-order.sql` · `.down.sql` · `.pg17.test.sql`(CI PG17 단계 추가, 별도 DB).

## 운영 DB 읽기 확인 (2026-11-13, `fcmdvveqmcgtioelzqun`)
- `storefront_links.document_version_id`·`store_orders.document_version_id` 둘 다 **NOT NULL**. `store_orders_link_scope_fk`·`store_orders_version_fk`는 `document_version_id`를 포함한 복합 FK라 NULL이면 검사하지 않음(전체 상품 주문 허용).
- `place_store_order`(15,013자)·`place_store_member_order`(16,252자) 본문 확인 — **이 초안은 두 함수를 바꾸지 않는다.** 문서 링크 토큰으로 새 함수를 부르면 `Link unavailable`, 전체 상품 링크 토큰으로 기존 함수를 부르면 문서 버전이 없어 `Document prices expired`로 막힌다.
- `pricing_promotions`에 `price`·`tax_type`·`stock`·`per_store_limit` 열 있음(행사가는 문서 스냅샷 없이 이 열로). `margin_template_price_v1(company, customer, product) → bigint`(service_role 전용) 있음. `product_catalog` 실제 열: `sales_product_name`·`canonical_name`·`purchase_product_name`·`sales_spec`·`sales_unit`·`tax_type`·`order_pricing_mode`·`is_active`.
- 기존 문서 링크 발급(`issue_storefront_links`)에는 감사 기록이 없다 → 전체 상품 링크 발급 함수에서 `admin_audit_logs`(`storefront_link_issued`, metadata.source=`catalog`)를 같은 트랜잭션에 남긴다(지시서의 "같은 action" 대신 새 action, 확인 필요).

## 변경 내용
| 항목 | 내용 |
| --- | --- |
| 링크 종류 | `storefront_links.source`(`document`|`catalog`, 기본 `document`) + `document_version_id` NOT NULL 해제 + 체크 `(source='document') = (document_version_id is not null)` |
| 주문 | `store_orders.document_version_id` NOT NULL 해제(문서 주문은 기존 함수가 계속 채움) |
| 품목 메모(CC-37) | `store_order_lines`: `line_memo`(1~50자) · `memo_kind`(product/packing/delivery/complaint) · `memo_tags text[]`(≤5) · `memo_edited_by_user_id` · `memo_edited_at` · `memo_original`(≤50자). 메모와 종류는 함께 있거나 함께 없다 |
| 링크 발급 | `issue_catalog_storefront_links_v1(company, links, expires_at, actor)` — 매장당 활성 전체 상품 링크 1개(있으면 재사용), 다른 회사 매장 거부, 유효기간 370일 이하, 감사 기록 |
| 주문 | `place_store_catalog_order_v1`(점주 링크) · `place_store_catalog_member_order_v1`(로그인 구성원) → 공용 본문 `place_store_catalog_order_core_v1`. 배송일·마감·최소금액·멱등·수정(revision) 규칙은 문서 주문과 같고, **줄 가격은 요청값을 무시**: 행사(대상 매장·진행 중·재고·매장 한도) → 매장 개별·견적 수락 가격 → `margin_template_price_v1` → 가격 관리 판매가, 판매 중 상품만, 시세 품목 단가 null, 행사 대상이 아니면 일반 가격으로(`promotionNotApplied`) |
| 권한 | 새 함수 4개 모두 public/anon/authenticated 회수, service_role만 |

## 지시서와 다른 점 · 확인 필요
1. 지시서는 "검증을 기존 함수에서 공용 내부 함수로 뽑아 둘 다 호출"이지만, 11/13 지시("기존 문서 주문 RPC는 손대지 마")에 따라 **기존 함수는 무변경**, 새 공용 본문에 같은 규칙을 둠(복사가 생김). 나중에 기존 쪽을 공용 본문으로 합치는 건 별도 승인 건.
2. 회사 쪽 주문 화면·기사·전표 등 `store_orders.document_version_id`를 읽는 코드가 NULL을 견디는지는 **코드 PR(36c)에서 확인**(읽기 코드 점검 후 스위치 `STORE_CATALOG_LINK` 켬).
3. 감사 action 이름(`storefront_link_issued`).

## down
전체 상품 링크·그 주문(`document_version_id is null`)·품목 메모가 있으면 `catalog_order_in_use`로 **거부**. 없을 때만 함수·제약·열을 원래대로 되돌린다(NOT NULL 복구).

## PG17 검증 항목(CI)
기존 문서 링크·주문 유지 · 문서 링크는 버전 필수 · 전체 상품 링크 발급(재사용·다른 회사 거부·감사) · 주문 가격 = 서버 계산(요청 단가 무시) · 시세 단가 null · 합계는 일반 줄만 · 메모 저장 · 멱등(같은 내용 재전송/내용 다르면 충돌) · 다른 회사 상품·판매 중지 상품·메모 51자·메모 종류 오류·문서 링크 토큰 거부 · 구성원 진입점은 구성원 필수 · 권한(anon/authenticated 없음) · down 거부/성공과 문서 행 보존.

## 적용 후 따라올 코드(승인 뒤 별도 PR, 36c)
링크 관리 "전체 상품 링크" 발급(`issue_catalog_storefront_links_v1`) · 매장 화면 주문 연결(`place_store_catalog_*`, 토큰으로 회사·매장 결정) · 품목 메모 입력 화면은 CC-37 보류. 스위치 기본 OFF, 첫 대상 제이에스리테일.

## 적용 절차(승인 후, 승인 받은 쪽이 직접)
승인 문구 원문 → 같은 트랜잭션에 `db_migration_applied` audit log → 적용 → 읽기 검증(새 열·제약·함수 본문·권한) → 이 문서에 기록.
