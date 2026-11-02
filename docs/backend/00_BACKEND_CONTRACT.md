# MAJU 백엔드 계약서 v1 (2026-11-02 · Claude)

> **고정 규칙**: 코드 작성 · 수정은 Codex 플러그인 **포니테일(Ponytail)** 을 반드시 사용한다. PR 본문 첫 줄 `Ponytail: 사용함` (AGENTS.md 0-0).

**이 문서를 읽는 법**
- 이 문서는 **결정만** 담는다. 세부(DDL · RLS · API 요청과 응답 · 이전 SQL)는 Codex가 이 계약을 보고 코드에서 뽑아 `docs/backend/`에 쓴다(10절).
- 우선순위: 이 계약서 > `2026-11-02-codex-decisions-0824.md` 2절(화면 스펙) > 차수별 지시서.
  - 지시서에 있는 테이블 이름이 이 문서와 다르면 **이 문서의 이름을 쓴다**(2절 대응표).
- 계약서는 이 파일 하나만 그 자리에서 고친다. 바뀐 결정은 맨 아래 "변경 기록"에 한 줄 남긴다.
- 기준 코드: main `29afedc`. 운영 DB 상태는 Codex가 U-1에서 읽기 전용으로 확인한다. `supabase/migrations`에 있는 것은 적용됐다고 가정하고, 아니면 보고한다.

## 1. 도메인과 소유

| 도메인 | 소유 데이터 | 다른 도메인이 쓰는 방법 |
|---|---|---|
| organization | companies, 직원 · 역할(WO-21), 회사별 플래그(env) | `isFeatureEnabled`, 권한 확인 함수 |
| customer | `normalized_customers`(매출처), `product_suppliers`(매입처) | id로만 참조, 스냅샷은 문서에 복사 |
| catalog | `product_catalog`, `product_categories`, `product_unit_conversions`, `category_unit_rules`, `product_unit_observations`, `supplier_products`(+ cost history), `import_jobs` / `import_rows` | 상품 조회 · 단위 환산 함수 |
| pricing | `pricing_settings` · `margin_groups` · `pricing_items`(P0), `product_base_prices`, `pricing_documents` / `_versions` · `pricing_promotions`(P1), `customer_price_agreements` | **가격 결정 함수 하나**(6절) |
| order | `store_orders` / `store_order_lines` / `storefront_links` / `store_order_*` 설정(P2), `store_product_preferences`, `customer_items` | 주문 확정 · 마감 이벤트 |
| purchasing | `purchase_orders` / `purchase_order_items`(새로 만듦) | 발주 → 매입전표 요청 |
| ledger (ERP) | `business_documents` / `business_document_lines`(전표), `partner_ledger_entries`(모든 돈), `erp_number_counters` | 전표 확정 · 입출금 기록 함수 |
| inventory | `inventory_movements` · `inventory_balances` · `inventory_document_positions` · `product_inventory_settings` · `inventory_stocktakes` | 전표 확정이 재고를 움직인다(7절) |

- 규칙 1: 도메인끼리는 함수(Use Case)로만 부른다. 다른 도메인의 테이블에 직접 쓰지 않는다.
  - 예외: **읽기 전용 조회 뷰**는 허용한다.
- 규칙 2: 새 비즈니스 로직은 `domains/<도메인>/` + `application/<도메인>/`에 둔다. `lib/store.ts`에는 더하지 않는다.

## 2. 이름 대응표 (지시서 이름 → 정식 테이블)

| 지시서에 나온 이름 | 정식 | 결정 |
|---|---|---|
| `ledger_entries`(16 · 23차) | **`partner_ledger_entries`**(있음) | 새로 만들지 않는다. 예치금 entry_type을 추가한다(8절) |
| 매입전표 · 매출전표 | **`business_documents`**(document_type sale / purchase / *_return) | source_type에 `purchase_order`를 추가한다 |
| `inventory_movements`(17차) | **`inventory_movements`**(있음) | 그대로 쓴다. 예약 이동은 만들지 않는다(7절) |
| `product_purchase_units`(19차) | **`product_unit_conversions`**(있음) + `is_default_purchase` | 새로 만들지 않는다 |
| `company_unit_policies`(22차) | **지금 만들지 않는다** | 중앙값 고정(23차). 바꿀 수 있게 열 때 만든다 |
| 섞인 재고 매입가 "중앙값" | **재고 가치는 `inventory_balances.average_unit_cost`(이동 평균) 그대로** | 중앙값은 *매입가 반영 후보 · 기준 매입가 제안 · 박스 실중량*에만 쓴다. 회계상 재고 단가와 섞지 않는다 |
| `product_base_prices`(22차) | **`product_base_prices`**(초안) | 날짜별 기준 단가의 정본. `pricing_items`는 *규칙*(마진 · 직접가)만 담는다 |
| 견적서 · 단가표 | **`pricing_documents`(kind sheet / quote)** | 정본. 기존 `sales_quotes`는 리드 영업 견적으로 계속 쓰고, 새 견적은 pricing_documents로 만든다. 합치기는 이전 계획(9절)에서 |
| 협의 고정가(우선순위 0) | **`customer_price_agreements`**(초안) | 견적이 수락되면 만든다 |
| `customer_items`(17 · 25차) | **`customer_items`**(초안) | 회사 쪽 "거래처 원장 품목" 캐시. 매출전표가 확정되면 갱신되고, 가져오기로 처음 채운다. 매장 쪽 즐겨찾기 · 숨김은 `store_product_preferences`. **둘은 목적이 다르다** |
| 주문(링크 · 직접) | **`store_orders`**(P2) | 주문의 정본. `channel`(link / manual / phone)을 추가한다. 초안 `sales_orders`는 **버린다** |
| `purchase_orders`(17차 발주) | **`purchase_orders` + `purchase_order_items`**(새로 만듦) | 초안 `order-and-purchasing-foundation`의 정의는 버리고 17 · 22 · 23차 칸으로 다시 쓴다 |
| `company_field_definitions` · `import_rows` | 초안 그대로 | 새 가져오기의 정본. 기존 `product_catalog_imports`는 읽기 전용으로 남긴다 |
| 매장 노출 설정(17차 F) | `store_order_settings` / `store_order_customer_rules`에 칸 추가 | 새 테이블을 만들지 않는다 |

## 3. 깨지면 안 되는 규칙 → 모두 테스트로 만든다

| ID | 규칙 | 테스트 종류 |
|---|---|---|
| I-1 | 모든 행에 `company_id`가 있다. 다른 회사 행을 참조할 수 없다(복합 FK `(company_id, id)`) | PG |
| I-2 | 돈의 움직임(매출 · 매입 · 입금 · 지급 · 예치금 · 조정)은 **`partner_ledger_entries`에만** 남긴다. 고치지 않고, 되돌릴 때는 `reversal` 행을 더한다 | PG |
| I-3 | 같은 원본 문서로 재고가 두 번 움직이지 않는다(`inventory_document_positions` + idempotency_key) | PG |
| I-4 | 가격 결정은 6절 함수 하나로만 한다. 화면이나 API가 따로 계산하지 않는다 | 단위 |
| I-5 | 확정된 전표의 줄 단가(실제 단가)는 기준 단가나 가격 규칙이 바뀌어도 다시 계산하지 않는다 | PG |
| I-6 | 예치금 잔액은 0 아래로 내려가지 않는다(거래처별, 행 잠금) | PG |
| I-7 | 같은 요청이 여러 번 와도 결과는 하나다: 주문 제출 · 전표 확정 · 지급 · 가져오기 반영 모두 idempotency_key | PG |
| I-8 | 발주 하나에 확정 매입전표는 하나다 | PG |
| I-9 | 매장(링크)은 토큰으로만 들어온다. 노출 설정과 플래그는 서버에서 확인한다 | 통합 |
| I-10 | 운영 DB 변경은 승인 줄(`DB-APPROVED:`)이 있는 PR로만 한다 | CI |
| I-11 | 기준 단가는 (상품, 날짜)마다 하나다 | PG |
| I-12 | 중앙값 계산: 홀수 · 짝수 개수, 기록 없음이면 고정값 | 단위 |

## 4. 상태 흐름

- **store_orders**(P2 값을 넓힌다):
  - 흐름: `submitted` → `received`(고객사 확인 · 수정 가능) → `closed`(마감: 수량 고정, 발주 집계 대상) → `in_delivery` → `delivered`
  - `cancelled`는 closed 전까지만 된다. 그 뒤에는 반품 전표로 처리한다.
  - 새 값: `closed`. 매출전표는 `in_delivery`로 넘어갈 때(출고 확정) 만든다.
- **purchase_orders**:
  - 흐름: `draft`(집계) → `ordered`(발주함 · 시각) → `received`(입고 입력) → `voucher_created`(매입전표 확정)
  - `cancelled`도 있다. 줄에는 `excluded_at`(−) · `carried_to_round`(다음 회차)를 둔다.
- **business_documents**: `draft` → `confirmed` → (`cancelled` = reversal 행 생성)
  - confirmed가 될 때만 재고 · 원장이 움직인다.
- **storefront_links**: 발급 → (`revoked_at` | `expires_at`)
  - 발급한 회사의 플래그가 꺼지면 링크도 막힌다(404).
- **pricing_documents**: 편집(revision) → 게시(version, 바꿀 수 없음)
  - 매장 링크는 **게시된 version**을 가리킨다.
- **import_jobs**: `uploaded` → `mapped` → `previewed` → `applied` | `rolled_back`

## 5. 트랜잭션 경계 (하나의 DB 함수 · RPC로 묶는다)

| Use Case | 한 번에 처리하는 것 |
|---|---|
| `PlaceStoreOrder` | 주문 + 줄(가격은 6절 함수로 그 순간 값을 스냅샷) + 요청 기록 |
| `ConfirmSaleDocument` | 전표 confirmed + 재고 sale_out + 원장 sale (+ 입금 시 receipt) + `customer_items` 갱신 |
| `CreatePurchaseVoucher` | 전표 confirmed + 재고 purchase_in + 원장 purchase (+ 지급 시 payment / deposit_use) + 발주 상태 + `product_base_prices`(체크했을 때) + 덜 온 수량 다음 회차 |
| `ApplyImport` | import_rows 적용 + 대상 테이블 + 되돌리기 정보(previous_values) |
| `RecordPayment` | 원장 행 1개 (+ 예치금 잔액 확인) |

- 모든 함수: `company_id`와 권한을 먼저 확인한다. idempotency_key를 받는다. 실패하면 전부 되돌린다.

## 6. 가격 결정 함수 (정본 하나)

`resolve_price(company_id, customer_id, product_id, date, unit)` →
`{price, tax_type, source: agreement|quote|sheet|base|promotion, document_version_id?}`

1. 행사 · 임박(`pricing_promotions`, 기간 · 재고 · 매장당 한도 안) — 따로 표시하고, 더 싼 값을 보여주는 규칙은 화면 스펙을 따른다.
2. 0 `customer_price_agreements`(active, 기간 안)
3. 1 견적서 / 2 단가표: 그 매장에 붙은 **게시 version 하나**. 기간이 끝나면 다음 순위로 넘어간다.
4. 3 기본가 = `product_base_prices`(그날 이하 가장 최근)의 `base_price`.
   - 없으면 `pricing_items`의 규칙(마진 · 직접가)과 최근 매입가로 계산한다.
5. 시세 품목은 price null + `is_market_price`.

- 단위가 다르면 `product_unit_conversions`로 환산한다.

## 7. 재고 (기존 inventory_phase_1 기준)

| 사건 | 처리 |
|---|---|
| 매입전표 확정 | `purchase_in` + 이동 평균 갱신 |
| 매출전표 확정 (주문에서 출고 확정 때 자동 · 또는 직접 입력) | `sale_out` **딱 한 번**. 17차의 "마감 · 출고 −, 주문 전표는 다시 안 뺌"과 결과가 같다 |
| 반품 전표 | `sale_return_in` / `purchase_return_out` |
| 맞추기 · 재고 엑셀 | `inventory_stocktakes` → `adjustment` |
| **출고 예정(예약)** | 이동 행을 **만들지 않는다**. `closed` 상태이고 아직 매출전표가 없는 주문 줄의 합으로 **계산**한다(뷰). 가능 = 현재 − 출고 예정 |

- 재고 추적 대상은 `product_inventory_settings.tracking_enabled`인 상품만이다(사입 · 시세는 제외).

## 8. 돈 (partner_ledger_entries)

- `entry_type`에 추가한다: `deposit`(예치금 받음/맡김), `deposit_apply`(예치금으로 결제), `deposit_refund`.
  - 예치금 잔액 = 거래처별로 이 세 가지의 합이다.
- 전표와 연결: `source_document_id`. 일부만 지급하면 남은 금액은 미수 / 미지급(잔액 계산)으로 남는다.
- 2% 수수료: **보류**. `store_orders.link_id`로 귀속만 추적한다. 수금 · 정산 테이블은 만들지 않는다.

## 9. 권한 · 이전

- 역할: 대표(전부) · 경리(돈 · 전표) · 직원(주문 · 상품 · 발주, 돈은 보기만) · 기사(배송 · 증빙) · 매장(링크 토큰, 자기 주문만).
  - Codex가 이 표를 RLS와 API 확인 함수로 풀어서 `docs/backend/03_PERMISSIONS.md`에 쓴다.
- 이전(나중에 하고, 지금은 계획만):
  - `sales_transactions`(옛 매출 업로드) → 읽기 전용으로 두고, 통계에만 쓴다.
  - `sales_quotes` → pricing_documents로 옮기는 스크립트는 E 이후에 만든다.
  - `normalized_customers.delivery_manager`(이름 문자열) → 직원 id로 바꾸는 작업은 별도 WO로 한다.

## 10. Codex가 할 일 (설계 PR · "지금 바로 쓰기" 다음 · 문서와 테스트만)

1. `docs/backend/01_SCHEMA.md` — **스크립트로 자동 생성**한다(`scripts/gen-schema-doc.mjs`: migrations + sql-drafts → 테이블 · 칸 · FK · RLS 목록, 초안/적용 표시). CI가 마이그레이션이 바뀔 때마다 다시 만든다.
2. `docs/backend/02_API.md` — 1절 Use Case마다 경로 · 입력 · 출력 · 오류 · 권한.
3. `docs/backend/03_PERMISSIONS.md` — 9절 역할 × 테이블/API 표.
4. `docs/backend/04_GAPS.md` — 이 계약과 지금 코드가 다른 곳의 목록(예: P2 status에 `closed` 없음, entry_type에 deposit 없음, purchase_orders 새로 필요).
5. **규칙 테스트**: 3절 I-1~I-12를 PG / 단위 테스트로 만든다. 지금 코드가 통과하지 못하는 것은 `skip` + 4번 GAPS에 연결한다.
6. 승인 표(`db-approval-queue.md`)에 이 계약 때문에 생긴 변경을 묶음 단위로 추가한다.

- Claude 검토: 이 계약과 다른지만 본다(체크리스트 = 2 · 3 · 5 · 6 · 7 · 8절).

## 변경 기록
- v1 2026-11-02 09:55 처음 작성(대표 지시: 프론트만 설계됐다는 지적 → 계약서는 Claude, 세부는 Codex).
